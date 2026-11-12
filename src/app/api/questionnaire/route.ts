import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';

/**
 * The homeowner questionnaire link (/questionnaire?token=...). The token is the only credential, so the form reaches this route instead of the
 * database: one row at a time, only the answer fields can change, and a submitted questionnaire is locked.
 */
const TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

const ANSWER_FIELDS = [
  'confirmed_address', 'property_type', 'bedrooms', 'bathrooms', 'current_occupancy', 'has_hoa', 'hoa_allows_str', 'has_smoke_detectors',
  'has_co_detectors', 'has_fire_extinguisher', 'has_working_locks', 'has_safe_egress', 'has_pool_safety_compliance', 'known_hazards', 'safety_notes',
  'regulation_responses', 'furnishing_status', 'current_availability', 'has_existing_lease', 'desired_start_date', 'personal_use_restrictions',
  'preferred_contact_method', 'best_contact_time', 'additional_info',
] as const;

const HIDDEN = ['save_token', 'agent_notified_at'];
const RESULTS = new Set(['qualified', 'needs_review', 'not_a_fit']);

const bad = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!TOKEN.test(token)) return bad('Not found', 404);
  if (!allowRequest(`questionnaire:get:${clientIp(req.headers)}`, 60, 10 * 60_000)) return bad('Too many requests', 429);

  const db = getSupabaseAdmin();
  const { data } = await db.from('homeowner_questionnaires').select('*').eq('unique_token', token).maybeSingle();
  if (!data) return bad('Not found', 404);
  for (const k of HIDDEN) delete (data as Record<string, unknown>)[k];

  let rules: unknown[] = [];
  if (data.prefilled_state) {
    const r = await db.from('regulation_rules').select('*').eq('state', data.prefilled_state).eq('is_active', true).order('display_order');
    rules = r.data ?? [];
  }
  return NextResponse.json({ questionnaire: data, rules });
}

/** PATCH { token, answers, submit?: { result, reasons } } */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; answers?: unknown; submit?: { result?: unknown; reasons?: unknown } };
  const token = typeof body.token === 'string' ? body.token : '';
  if (!TOKEN.test(token)) return bad('Not found', 404);
  if (!allowRequest(`questionnaire:patch:${clientIp(req.headers)}`, 30, 10 * 60_000)) return bad('Too many requests', 429);
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) return bad('answers are required', 400);

  const db = getSupabaseAdmin();
  const { data: row } = await db.from('homeowner_questionnaires').select('id, submitted_at').eq('unique_token', token).maybeSingle();
  if (!row) return bad('Not found', 404);
  if (row.submitted_at) return bad('This questionnaire was already submitted.', 409);

  const answers = body.answers as Record<string, unknown>;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  for (const k of ANSWER_FIELDS) if (k in answers) patch[k] = answers[k];

  if (body.submit) {
    const result = typeof body.submit.result === 'string' && RESULTS.has(body.submit.result) ? body.submit.result : null;
    if (!result) return bad('Invalid result', 400);
    const reasons = Array.isArray(body.submit.reasons) ? body.submit.reasons.filter((r): r is string => typeof r === 'string').slice(0, 20) : [];
    Object.assign(patch, { questionnaire_status: result, qualification_result: result, qualification_reasons: reasons, submitted_at: now });
  } else {
    Object.assign(patch, { questionnaire_status: 'in_progress', last_saved_at: now });
  }

  const { error } = await db.from('homeowner_questionnaires').update(patch).eq('id', row.id);
  if (error) return bad('Could not save', 500);
  return NextResponse.json({ ok: true });
}
