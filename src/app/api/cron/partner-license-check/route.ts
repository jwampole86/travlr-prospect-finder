import { NextRequest, NextResponse } from 'next/server';
import { verifyJobRequest } from '@/lib/jobAuth';
import { finishCronRun, startCronRun } from '@/lib/recordCronRun';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isAutomatic, verifyLicense } from '@/lib/seller/licenseVerify';
import { partnerPatchFor } from '@/lib/seller/licenseApply';

export const maxDuration = 300;
const BUDGET_MS = 240_000;

/**
 * Weekly: re-checks every partner whose license was verified, in the states that publish records. A license the state now shows as inactive
 * is marked expired, which stops new referrals to that partner until someone looks. Nothing is ever marked verified here that was not already.
 */
export async function GET(req: NextRequest) {
  const authorization = await verifyJobRequest(req);
  if (!authorization.authorized) return NextResponse.json({ error: authorization.reason ?? 'Unauthorized' }, { status: 401 });
  const run = await startCronRun('partner-license-check');
  const db = getSupabaseAdmin();
  const started = Date.now();
  const counts = { checked: 0, stillActive: 0, expired: 0, needsReview: 0, notFound: 0, failed: 0 };
  const errors: string[] = [];
  try {
    const { data: partners } = await db.from('service_partners').select('id,name,contact_name,brokerage,responsible_broker,license_number,license_state,license_status')
      .eq('license_status', 'verified').in('relationship_status', ['prospect', 'active']).not('license_number', 'is', null).limit(100);
    for (const p of (partners ?? []).filter((x) => isAutomatic(x.license_state))) {
      if (Date.now() - started > BUDGET_MS) break;
      counts.checked++;
      const result = await verifyLicense(p.license_state, p.license_number, [p.contact_name, p.name, p.brokerage, p.responsible_broker]);
      const patch = partnerPatchFor(result, p);
      // A lookup that fails, or does not find the number, leaves the current standing alone but keeps the note.
      await db.from('service_partners').update(patch).eq('id', p.id);
      if (result.outcome === 'verified') counts.stillActive++;
      else if (result.outcome === 'inactive') { counts.expired++; errors.push(`${p.name}: ${result.message}`); }
      else if (result.outcome === 'needs_review') { counts.needsReview++; errors.push(`${p.name}: ${result.message}`); }
      else if (result.outcome === 'not_found') { counts.notFound++; errors.push(`${p.name}: ${result.message}`); }
      else counts.failed++;
    }
    await finishCronRun(run, { status: counts.failed ? 'partial' : 'success', leadsScanned: counts.checked, errorCount: errors.length + counts.failed, errors, metadata: counts });
    return NextResponse.json({ ok: true, ...counts });
  } catch (e) {
    await finishCronRun(run, { status: 'failed', errorCount: 1, errors: [(e as Error).message] });
    throw e;
  }
}
