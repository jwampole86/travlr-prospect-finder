import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTeamAlert } from '@/lib/services/replyAlerts';
import { advancePipeline } from '@/lib/services/leadPipeline';

/**
 * POST /api/estimate/event { c, sid, event, data }
 * Public. Records what a homeowner does on the estimate page after tapping our text link. The short code identifies the
 * lead server-side, so no personal data travels in the request. Unknown codes and events are ignored.
 */
const EVENTS = new Set([
  'page_view', 'estimate_shown', 'contact_started', 'questionnaire_started', 'submitted', 'call_requested', 'question_requested',
  'report_downloaded', 'report_printed', 'link_copied', 'chat_opened', 'chat_question', 'website_clicked', 'credential_clicked',
  'phone_clicked', 'email_clicked', 'scroll_depth', 'time_on_page', 'address_changed',
]);

export async function POST(req: NextRequest) {
  const ok = NextResponse.json({ ok: true });
  try {
    const body = await req.json().catch(() => null) as { c?: unknown; sid?: unknown; event?: unknown; data?: unknown } | null;
    const code = typeof body?.c === 'string' ? body.c : '';
    const sid = typeof body?.sid === 'string' ? body.sid : '';
    const event = typeof body?.event === 'string' ? body.event : '';
    if (!/^[a-z0-9]{4,16}$/i.test(code) || !/^[a-z0-9-]{8,40}$/i.test(sid) || !EVENTS.has(event)) return ok;

    // Keep only short primitive values so the table cannot be used to store arbitrary content.
    const data: Record<string, string | number | boolean> = {};
    if (body?.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
      for (const [k, v] of Object.entries(body.data as Record<string, unknown>).slice(0, 8)) {
        if (!/^[a-zA-Z_]{1,24}$/.test(k)) continue;
        if (typeof v === 'string') data[k] = v.slice(0, event === 'chat_question' ? 300 : 120);
        else if (typeof v === 'number' && Number.isFinite(v)) data[k] = v;
        else if (typeof v === 'boolean') data[k] = v;
      }
    }

    const db = getSupabaseAdmin();
    const { data: link } = await db.from('link_clicks').select('lead_id').eq('token', code).eq('sequence_name', 'estimate_outreach').maybeSingle();
    if (!link?.lead_id) return ok;

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await db.from('estimate_journey_events').select('id', { count: 'exact', head: true }).eq('session_id', sid).gte('created_at', since);
    if ((count ?? 0) >= 150) return ok;

    await db.from('estimate_journey_events').insert({ code, lead_id: link.lead_id, session_id: sid, event, data });
    if (event === 'submitted') {
      await advancePipeline(db, link.lead_id, 'callback_scheduled');
      const { data: l } = await db.from('leads').select('address,city,state,owner_name').eq('id', link.lead_id).maybeSingle();
      const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://prospect.staytrvlr.com').replace(/\/$/, '');
      await sendTeamAlert({ key: `home-submit:${link.lead_id}`, text: `Homeowner submitted the estimate form: ${[l?.owner_name, [l?.address, l?.city, l?.state].filter(Boolean).join(', ')].filter(Boolean).join(', ')}`, url: `${base}/lead-profile?id=${encodeURIComponent(link.lead_id)}`, email: true });
    }
  } catch { /* tracking must never surface an error to the visitor */ }
  return ok;
}
