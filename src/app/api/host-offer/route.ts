import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';
import { notifyAdmins } from '@/lib/services/smsConsent';
import { toE164 } from '@/lib/services/smsConsent';

export const maxDuration = 30;

const EVENTS = new Set(['scenario', 'service', 'cta_click', 'form_start']);
const SERVICES = new Set(['co_host_only', 'co_host_and_manager', 'not_sure']);
const EARLY_STAGES = ['identified', 'reviewed', 'contacted'];
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

/** POST /api/host-offer  (public). action: event | request | opt_out. The code in the link is the only key; no personal data is read back. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const code = clip(body.code, 16);
  if (!/^[a-z0-9]{4,16}$/i.test(code)) return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
  if (!allowRequest(`host-offer:${clientIp(req.headers)}:${body.action}`, body.action === 'event' ? 60 : 6, 10 * 60_000)) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  const db = getSupabaseAdmin();
  const { data: link } = await db.from('cohost_offer_links').select('code,property_id,opted_out_at').eq('code', code).maybeSingle();
  if (!link) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  if (body.action === 'event') {
    if (!EVENTS.has(String(body.event))) return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
    await db.from('cohost_offer_events').insert({ code, event: body.event, sid: clip(body.sid, 60) || null, data: body.data && typeof body.data === 'object' ? JSON.parse(JSON.stringify(body.data).slice(0, 500)) : null });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'request') {
    const name = clip(body.name, 120); const email = clip(body.email, 160).toLowerCase(); const phone = clip(body.phone, 40);
    if (name.length < 2) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && !toE164(phone)) return NextResponse.json({ error: 'Please enter a valid email or phone number so we can reach you.' }, { status: 400 });
    const service = SERVICES.has(String(body.service)) ? String(body.service) : 'not_sure';
    const message = clip(body.message, 1000);
    await db.from('cohost_offer_events').insert({ code, event: 'request', data: { name, email: email || null, phone: phone || null, service, message: message || null } });
    await db.from('cohost_offer_links').update({ requested_at: new Date().toISOString(), opted_out_at: null }).eq('code', code);
    const { data: l } = await db.from('str_listings').select('title,market,pipeline_stage').eq('property_id', link.property_id).maybeSingle();
    const patch: Record<string, unknown> = {};
    if (service !== 'not_sure') patch.service_model = service;
    if (l && (EARLY_STAGES.includes(l.pipeline_stage) || l.pipeline_stage === 'declined')) { patch.pipeline_stage = 'replied'; patch.stage_updated_at = new Date().toISOString(); }
    if (Object.keys(patch).length) await db.from('str_listings').update(patch).eq('property_id', link.property_id);
    await notifyAdmins(db, { title: 'Co-host audit requested', message: `${name} asked for a listing audit${l?.market ? ` (${l.market})` : ''}.`, metadata: { kind: 'cohost_offer_request', code, property_id: link.property_id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'opt_out') {
    await db.from('cohost_offer_links').update({ opted_out_at: new Date().toISOString() }).eq('code', code);
    await db.from('cohost_offer_events').insert({ code, event: 'opt_out' });
    const { data: l } = await db.from('str_listings').select('pipeline_stage,matched_owner').eq('property_id', link.property_id).maybeSingle();
    if (l && !['agreed', 'onboarded'].includes(l.pipeline_stage)) await db.from('str_listings').update({ pipeline_stage: 'declined', stage_updated_at: new Date().toISOString() }).eq('property_id', link.property_id);
    // Any phone we hold for this owner is also blocked from text messages.
    const o = (l?.matched_owner ?? {}) as { skipTrace?: { results?: Array<{ found?: { phones?: Array<{ e164?: string }> } }> }; homesage?: { persons?: Array<{ phones?: Array<{ e164?: string }> }> }; contact?: { phone?: string } };
    const phones = [...(o.skipTrace?.results ?? []).flatMap(r => (r.found?.phones ?? []).map(p => p.e164)), ...(o.homesage?.persons ?? []).flatMap(p => (p.phones ?? []).map(x => x.e164)), toE164(o.contact?.phone)].filter((p): p is string => !!p);
    for (const p of new Set(phones)) await db.from('sms_suppressions').upsert({ phone_e164: p, reason: 'opt_out', last_message: 'co-host offer page opt-out' }, { onConflict: 'phone_e164' });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
