import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

// ─── Lead Auto-Assignment Rule Engine ────────────────────────────────────────
// Executes assignment rules against unassigned leads.
// Matches on AI score, region, expertise tags, and workload balance.

interface AssignmentRule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  min_ai_score: number;
  max_ai_score: number;
  regions: string[];
  expertise_tags: string[];
  lead_stages: string[];
  target_agent_id: string | null;
  target_agent_name: string;
  max_workload: number;
}

interface AgentWorkload {
  agentId: string;
  agentName: string;
  currentCount: number;
  maxWorkload: number;
  regions: string[];
  expertiseTags: string[];
}

interface LeadRow {
  id: string;
  address: string;
  state: string;
  stage: string;
  prospect_score: number;
  tags: string[];
}

function extractStateFromAddress(address: string): string {
  const match = address?.match(/,\s*([A-Z]{2})\s*(\d{5})?/) || address?.match(/\b([A-Z]{2})\b/);
  return match ? match[1] : '';
}

function ruleMatchesLead(rule: AssignmentRule, lead: LeadRow): boolean {
  // AI score check
  const score = lead.prospect_score ?? 0;
  if (score < rule.min_ai_score || score > rule.max_ai_score) return false;

  // Region check (empty = any)
  if (rule.regions && rule.regions.length > 0) {
    const leadState = lead.state || extractStateFromAddress(lead.address || '');
    if (!leadState || !rule.regions.includes(leadState)) return false;
  }

  // Stage check (empty = any)
  if (rule.lead_stages && rule.lead_stages.length > 0) {
    const leadStage = (lead.stage || '').toLowerCase();
    const stageMatch = rule.lead_stages.some(s => leadStage.includes(s.toLowerCase()));
    if (!stageMatch) return false;
  }

  // Expertise tags check (empty = any) — match against lead tags
  if (rule.expertise_tags && rule.expertise_tags.length > 0) {
    const leadTags = (lead.tags || []).map((t: string) => t.toLowerCase());
    const tagMatch = rule.expertise_tags.some(t => leadTags.includes(t.toLowerCase()));
    if (!tagMatch) return false;
  }

  return true;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { rules: clientRules, dryRun = false } = body;

    const supabase = createClient();

    // ── 1. Load rules (from DB, fall back to client-provided rules) ───────────
    let rules: AssignmentRule[] = [];
    const { data: dbRules } = await supabase
      .from('lead_assignment_rules')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: true });

    if (dbRules && dbRules.length > 0) {
      rules = dbRules as AssignmentRule[];
    } else if (clientRules && Array.isArray(clientRules)) {
      // Map client-side rule format to DB format
      rules = clientRules
        .filter((r: any) => r.enabled)
        .map((r: any) => ({
          id: r.id,
          name: r.name,
          priority: r.priority,
          enabled: r.enabled,
          min_ai_score: r.minAiScore ?? r.min_ai_score ?? 0,
          max_ai_score: r.maxAiScore ?? r.max_ai_score ?? 100,
          regions: r.regions ?? [],
          expertise_tags: r.expertiseTags ?? r.expertise_tags ?? [],
          lead_stages: r.leadStages ?? r.lead_stages ?? [],
          target_agent_id: r.targetAgentId ?? r.target_agent_id ?? null,
          target_agent_name: r.targetAgentName ?? r.target_agent_name ?? '',
          max_workload: r.maxWorkload ?? r.max_workload ?? 50,
        }))
        .sort((a: AssignmentRule, b: AssignmentRule) => a.priority - b.priority);
    }

    if (rules.length === 0) {
      return NextResponse.json({ success: true, assigned: 0, skipped: 0, message: 'No active rules found' });
    }

    // ── 2. Load unassigned leads ───────────────────────────────────────────────
    const { data: unassignedLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id, address, state, stage, prospect_score, tags')
      .is('assigned_agent_id', null)
      .order('prospect_score', { ascending: false })
      .limit(500);

    if (leadsError) {
      // Try without assigned_agent_id filter (column may not exist yet)
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, address, state, stage, prospect_score, tags')
        .order('prospect_score', { ascending: false })
        .limit(200);

      if (!allLeads || allLeads.length === 0) {
        return NextResponse.json({ success: true, assigned: 0, skipped: 0, message: 'No leads to assign' });
      }
    }

    const leads: LeadRow[] = (unassignedLeads || []) as LeadRow[];

    if (leads.length === 0) {
      return NextResponse.json({ success: true, assigned: 0, skipped: 0, message: 'No unassigned leads found' });
    }

    // ── 3. Build agent workload map ────────────────────────────────────────────
    const agentWorkloadMap = new Map<string, AgentWorkload>();

    // Initialize from rules
    for (const rule of rules) {
      const key = rule.target_agent_name;
      if (!agentWorkloadMap.has(key)) {
        agentWorkloadMap.set(key, {
          agentId: rule.target_agent_id || '',
          agentName: rule.target_agent_name,
          currentCount: 0,
          maxWorkload: rule.max_workload,
          regions: rule.regions,
          expertiseTags: rule.expertise_tags,
        });
      }
    }

    // Get current assignment counts from DB
    const { data: existingAssignments } = await supabase
      .from('lead_assignment_log')
      .select('assigned_to_agent_name')
      .gte('assigned_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (existingAssignments) {
      for (const row of existingAssignments) {
        const key = row.assigned_to_agent_name;
        if (agentWorkloadMap.has(key)) {
          const agent = agentWorkloadMap.get(key)!;
          agent.currentCount++;
        }
      }
    }

    // ── 4. Execute rule engine ─────────────────────────────────────────────────
    const assignmentResults: Array<{
      leadId: string;
      leadAddress: string;
      agentName: string;
      agentId: string;
      ruleName: string;
      ruleId: string;
      aiScore: number;
      region: string;
      reason: string;
    }> = [];

    const skippedLeads: string[] = [];
    const assignedLeadIds = new Set<string>();

    for (const lead of leads) {
      if (assignedLeadIds.has(lead.id)) continue;

      let assigned = false;

      for (const rule of rules) {
        if (!ruleMatchesLead(rule, lead)) continue;

        const agentKey = rule.target_agent_name;
        const agentWorkload = agentWorkloadMap.get(agentKey);
        if (!agentWorkload) continue;

        // Check workload capacity
        if (agentWorkload.currentCount >= agentWorkload.maxWorkload) {
          continue; // Agent at capacity, try next rule
        }

        const leadState = lead.state || extractStateFromAddress(lead.address || '');
        const reason = [
          `AI score ${lead.prospect_score} in range [${rule.min_ai_score}–${rule.max_ai_score}]`,
          rule.regions.length > 0 ? `region ${leadState} matches` : null,
          rule.expertise_tags.length > 0 ? `tags match [${rule.expertise_tags.join(', ')}]` : null,
          `workload ${agentWorkload.currentCount + 1}/${agentWorkload.maxWorkload}`,
        ].filter(Boolean).join(', ');

        assignmentResults.push({
          leadId: lead.id,
          leadAddress: lead.address || '',
          agentName: rule.target_agent_name,
          agentId: rule.target_agent_id || '',
          ruleName: rule.name,
          ruleId: rule.id,
          aiScore: lead.prospect_score || 0,
          region: leadState,
          reason,
        });

        agentWorkload.currentCount++;
        assignedLeadIds.add(lead.id);
        assigned = true;
        break; // First matching rule wins
      }

      if (!assigned) {
        skippedLeads.push(lead.id);
      }
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        assigned: assignmentResults.length,
        skipped: skippedLeads.length,
        preview: assignmentResults.slice(0, 20),
      });
    }

    // ── 5. Persist assignments ─────────────────────────────────────────────────
    if (assignmentResults.length > 0) {
      const logRows = assignmentResults.map(r => ({
        id: crypto.randomUUID(),
        lead_id: r.leadId,
        lead_address: r.leadAddress,
        assigned_to_agent_id: r.agentId || null,
        assigned_to_agent_name: r.agentName,
        rule_id: r.ruleId || null,
        rule_name: r.ruleName,
        ai_score: r.aiScore,
        region: r.region,
        reason: r.reason,
        assigned_at: new Date().toISOString(),
      }));

      await supabase.from('lead_assignment_log').insert(logRows).catch(() => {});

      // Update leads with assigned agent (if column exists)
      for (const result of assignmentResults) {
        if (result.agentId) {
          await supabase
            .from('leads')
            .update({ assigned_agent_id: result.agentId } as any)
            .eq('id', result.leadId)
            .catch(() => {});
        }

        // Log activity event per lead
        await supabase.from('activity_events').insert({
          lead_id: result.leadId,
          event_type: 'assignment',
          title: `Auto-assigned to ${result.agentName}`,
          body: `Rule: "${result.ruleName}" — ${result.reason}`,
          metadata: {
            rule_id: result.ruleId,
            rule_name: result.ruleName,
            agent_name: result.agentName,
            ai_score: result.aiScore,
          },
        } as any).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      assigned: assignmentResults.length,
      skipped: skippedLeads.length,
      results: assignmentResults.slice(0, 50),
    });
  } catch (err) {
    console.error('[leads/auto-assign]', err);
    return NextResponse.json({ error: 'Auto-assignment failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createClient();

    // Return recent assignment log
    const { data: log } = await supabase
      .from('lead_assignment_log')
      .select('*')
      .order('assigned_at', { ascending: false })
      .limit(50);

    return NextResponse.json({ log: log || [] });
  } catch (err) {
    console.error('[leads/auto-assign GET]', err);
    return NextResponse.json({ error: 'Failed to fetch log' }, { status: 500 });
  }
}
