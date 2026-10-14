import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { dispatchSMS } from '@/lib/services/twilioService';
import { mergePrefs, withinWorkingHours, type NotifKind } from '@/lib/agentPrefs';
import { teamAlertTargets } from '@/lib/services/replyAlerts';
import { toE164 } from '@/lib/services/smsConsent';

type Db = ReturnType<typeof getSupabaseAdmin>;
export interface UserNote { title: string; message: string; kind?: NotifKind; metadata?: Record<string, unknown>; severity?: string; url?: string }
export type ChannelResult = 'sent' | 'off' | 'outside_hours' | 'no_address' | 'no_consent' | 'duplicate_of_team_alert' | 'failed';
export interface Delivery { inApp: ChannelResult; email: ChannelResult; sms: ChannelResult }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const PROFILE_COLUMNS = 'id,email,full_name,phone,timezone,sms_opt_in,agent_preferences';

/** Delivers one notification to one person through the channels and alert types they chose. `force` ignores working hours and alert-type switches (used for the test button). */
export async function notifyUser(db: Db, userId: string, n: UserNote, opts: { force?: boolean } = {}): Promise<Delivery> {
  const out: Delivery = { inApp: 'off', email: 'off', sms: 'off' };
  const { data: p } = await db.from('user_profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (!p) return out;
  const prefs = mergePrefs(p.agent_preferences); const kind = n.kind ?? 'escalation';
  if (!opts.force && !prefs.notif[kind]) return out;
  const tz = p.timezone || 'America/Denver'; const inHours = opts.force || withinWorkingHours(prefs.hours, tz);
  const team = teamAlertTargets();

  if (prefs.notif.inApp) {
    const { error } = await db.from('app_notifications').insert({ user_id: userId, type: 'homeowner_inquiry', severity: n.severity ?? 'warning', category: 'leads', title: n.title, message: n.message, metadata: n.metadata ?? {} });
    out.inApp = error ? 'failed' : 'sent';
  }
  if (prefs.notif.email) {
    if (!p.email) out.email = 'no_address';
    else if (!inHours) out.email = 'outside_hours';
    else if (!opts.force && p.email.toLowerCase() === team.email?.toLowerCase()) out.email = 'duplicate_of_team_alert';
    else {
      try {
        const { error } = await getResendClient().emails.send({ from: getResendFrom(), to: [p.email], subject: `TRAVLR: ${n.title}`, text: `${n.message}${n.url ? `\n\nOpen: ${n.url}` : ''}`, html: `<p><strong>${esc(n.title)}</strong></p><p>${esc(n.message)}</p>${n.url ? `<p><a href="${esc(n.url)}">Open it</a></p>` : ''}` });
        out.email = error ? 'failed' : 'sent';
      } catch { out.email = 'failed'; }
    }
  }
  if (prefs.notif.sms) {
    const to = toE164(p.phone ?? '');
    if (!to) out.sms = 'no_address';
    else if (!p.sms_opt_in) out.sms = 'no_consent';
    else if (!inHours) out.sms = 'outside_hours';
    else if (!opts.force && to === team.phone) out.sms = 'duplicate_of_team_alert';
    else { try { const r = await dispatchSMS({ to, leadId: 'internal-user-alert', body: `TRAVLR: ${n.title}. ${n.message}`.slice(0, 300) }); out.sms = r.success ? 'sent' : 'failed'; } catch { out.sms = 'failed'; } }
  }
  return out;
}

/** Notifies every active admin and owner, each by their own settings. */
export async function notifyAdminUsers(db: Db, n: UserNote) {
  const { data: admins } = await db.from('user_profiles').select('id').in('app_role', ['admin', 'owner']).neq('is_active', false).limit(10);
  await Promise.allSettled((admins ?? []).map(a => notifyUser(db, a.id, n)));
}
