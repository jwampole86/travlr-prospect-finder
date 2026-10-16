import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdminActor, requireApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const RULE_TYPES = new Set([
  'ownership_min_confidence',
  'market_comp_freshness_days',
  'price_anomaly_pct',
  'overall_min_confidence',
  'field_min_confidence',
]);
const RULE_ACTIONS = new Set(['flag', 'block', 'notify']);
const RULE_SEVERITIES = new Set(['info', 'warning', 'critical']);

type RuleRow = {
  id: string;
  rule_name: string;
  rule_type: string;
  threshold_value: number;
  target_field: string | null;
  action: string;
  severity: string;
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
};

function getDb(fallback: SupabaseClient) {
  try {
    return getSupabaseAdmin();
  } catch {
    return fallback;
  }
}

function cleanText(value: unknown, max = 200) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function nullableText(value: unknown, max = 200) {
  const cleaned = cleanText(value, max);
  return cleaned || null;
}

function coerceThreshold(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildViolationSummary(
  rows: Array<{ rule_name: string; rule_type: string; severity: string; detected_at: string }>
) {
  const aggMap = new Map<
    string,
    { rule_name: string; rule_type: string; severity: string; count: number; last_detected: string }
  >();

  for (const row of rows) {
    const existing = aggMap.get(row.rule_name);
    if (!existing) {
      aggMap.set(row.rule_name, {
        rule_name: row.rule_name,
        rule_type: row.rule_type,
        severity: row.severity,
        count: 1,
        last_detected: row.detected_at,
      });
      continue;
    }

    existing.count += 1;
    if (row.detected_at > existing.last_detected) {
      existing.last_detected = row.detected_at;
    }
  }

  return Array.from(aggMap.values()).sort((a, b) => b.count - a.count);
}

export async function GET(req: NextRequest) {
  const auth = await requireApiActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getDb(auth.actor.client);
    const [rulesResult, violationsResult, totalResult, unresolvedResult] = await Promise.all([
      db.from('enrichment_confidence_rules').select('*').order('created_at', { ascending: true }),
      db
        .from('rules_engine_violations')
        .select('rule_name, rule_type, severity, detected_at')
        .order('detected_at', { ascending: false })
        .limit(200),
      db.from('rules_engine_violations').select('*', { count: 'exact', head: true }),
      db
        .from('rules_engine_violations')
        .select('*', { count: 'exact', head: true })
        .eq('resolved', false),
    ]);

    if (rulesResult.error) throw rulesResult.error;
    if (violationsResult.error) throw violationsResult.error;
    if (totalResult.error) throw totalResult.error;
    if (unresolvedResult.error) throw unresolvedResult.error;

    return NextResponse.json({
      rules: (rulesResult.data ?? []) as RuleRow[],
      violations: buildViolationSummary(
        (violationsResult.data ?? []) as Array<{
          rule_name: string;
          rule_type: string;
          severity: string;
          detected_at: string;
        }>
      ),
      totalViolations: totalResult.count ?? 0,
      unresolvedViolations: unresolvedResult.count ?? 0,
    });
  } catch (error) {
    console.error('[enrichment-rules-engine] GET', error);
    return NextResponse.json({ error: 'Failed to load rules engine data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const ruleName = cleanText(body.rule_name, 120);
    const ruleType = cleanText(body.rule_type, 80);
    const threshold = coerceThreshold(body.threshold_value);
    const action = cleanText(body.action, 30);
    const severity = cleanText(body.severity, 30);
    const targetField = nullableText(body.target_field, 80);

    if (!ruleName) return NextResponse.json({ error: 'Rule name is required' }, { status: 400 });
    if (!RULE_TYPES.has(ruleType))
      return NextResponse.json({ error: 'Invalid rule type' }, { status: 400 });
    if (threshold === null)
      return NextResponse.json({ error: 'Threshold value must be numeric' }, { status: 400 });
    if (!RULE_ACTIONS.has(action))
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    if (!RULE_SEVERITIES.has(severity))
      return NextResponse.json({ error: 'Invalid severity' }, { status: 400 });
    if (ruleType === 'field_min_confidence' && !targetField) {
      return NextResponse.json(
        { error: 'Target field is required for field confidence rules' },
        { status: 400 }
      );
    }

    const db = getDb(auth.actor.client);
    const now = new Date().toISOString();
    const { data, error } = await db
      .from('enrichment_confidence_rules')
      .insert({
        rule_name: ruleName,
        rule_type: ruleType,
        threshold_value: threshold,
        target_field: ruleType === 'field_min_confidence' ? targetField : null,
        action,
        severity,
        enabled: body.enabled === false ? false : true,
        description: nullableText(body.description, 500),
        created_by: auth.actor.user.id,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ rule: data as RuleRow });
  } catch (error) {
    console.error('[enrichment-rules-engine] POST', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create rule' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean')
        return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
      patch.enabled = body.enabled;
    }
    if (body.threshold_value !== undefined) {
      const threshold = coerceThreshold(body.threshold_value);
      if (threshold === null)
        return NextResponse.json({ error: 'Threshold value must be numeric' }, { status: 400 });
      patch.threshold_value = threshold;
    }
    if (body.action !== undefined) {
      const action = cleanText(body.action, 30);
      if (!RULE_ACTIONS.has(action))
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      patch.action = action;
    }
    if (body.severity !== undefined) {
      const severity = cleanText(body.severity, 30);
      if (!RULE_SEVERITIES.has(severity))
        return NextResponse.json({ error: 'Invalid severity' }, { status: 400 });
      patch.severity = severity;
    }
    if (body.description !== undefined) {
      patch.description = nullableText(body.description, 500);
    }
    if (body.target_field !== undefined) {
      patch.target_field = nullableText(body.target_field, 80);
    }

    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    const db = getDb(auth.actor.client);
    const { data, error } = await db
      .from('enrichment_confidence_rules')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ rule: data as RuleRow });
  } catch (error) {
    console.error('[enrichment-rules-engine] PATCH', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update rule' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });

    const db = getDb(auth.actor.client);
    const { error } = await db.from('enrichment_confidence_rules').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('[enrichment-rules-engine] DELETE', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete rule' },
      { status: 500 }
    );
  }
}
