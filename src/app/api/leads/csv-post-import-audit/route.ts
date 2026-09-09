import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { importBatchId } = body as { importBatchId?: string };

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Find leads with duplicate dedup_fingerprints
    const { data: allLeads, error } = await supabase
      .from('leads')
      .select('id, dedup_fingerprint, standardized_address, source_property_id, apn, address, city, state, zip, contact_name, primary_agent_id, notes, import_batch_id')
      .not('dedup_fingerprint', 'is', null)
      .order('dedup_fingerprint');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by fingerprint
    const fingerprintGroups = new Map<string, typeof allLeads>();
    for (const lead of (allLeads || [])) {
      const fp = (lead as Record<string, unknown>).dedup_fingerprint as string;
      if (!fp) continue;
      if (!fingerprintGroups.has(fp)) fingerprintGroups.set(fp, []);
      fingerprintGroups.get(fp)!.push(lead);
    }

    const duplicateGroups: Array<{
      fingerprint: string;
      leads: Array<{ id: string; address: string; hasNotes: boolean; hasAgent: boolean; importBatchId: string | null }>;
    }> = [];

    let flaggedCount = 0;
    const idsToFlag: string[] = [];

    for (const [fp, group] of fingerprintGroups) {
      if (group.length < 2) continue;
      const groupInfo = group.map(l => ({
        id: (l as Record<string, unknown>).id as string,
        address: [(l as Record<string, unknown>).address, (l as Record<string, unknown>).city, (l as Record<string, unknown>).state].filter(Boolean).join(', '),
        hasNotes: !!((l as Record<string, unknown>).notes),
        hasAgent: !!((l as Record<string, unknown>).primary_agent_id),
        importBatchId: (l as Record<string, unknown>).import_batch_id as string | null,
      }));
      duplicateGroups.push({ fingerprint: fp, leads: groupInfo });
      // Flag all but the oldest as POSSIBLE_DUPLICATE (keep first, flag rest)
      for (let i = 1; i < group.length; i++) {
        idsToFlag.push((group[i] as Record<string, unknown>).id as string);
        flaggedCount++;
      }
    }

    // Flag duplicates (add tag, do NOT delete)
    if (idsToFlag.length > 0) {
      for (let i = 0; i < idsToFlag.length; i += 50) {
        const batch = idsToFlag.slice(i, i + 50);
        await supabase
          .from('leads')
          .update({
            possible_duplicate: true,
            possible_duplicate_flagged_at: new Date().toISOString(),
            possible_duplicate_batch_id: importBatchId || null,
          })
          .in('id', batch)
          .catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      audit: {
        totalLeadsScanned: allLeads?.length || 0,
        duplicateGroupsFound: duplicateGroups.length,
        leadsFlagged: flaggedCount,
        duplicateGroups: duplicateGroups.slice(0, 50), // Return first 50 groups for UI
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Audit failed' },
      { status: 500 }
    );
  }
}
