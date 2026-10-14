/** Per-user preferences stored in user_profiles.agent_preferences. Shared by the profile page, the dashboard and the notifier. */

export interface NotifPrefs {
  inApp: boolean; email: boolean; sms: boolean;
  leadAssigned: boolean; escalation: boolean; deliveryFailure: boolean; weeklyDigest: boolean; systemAlerts: boolean;
}
export type NotifKind = 'leadAssigned' | 'escalation' | 'deliveryFailure' | 'weeklyDigest' | 'systemAlerts';

export interface DashPrefs { defaultView: string; compact: boolean; showKPIs: boolean; showFunnel: boolean; showTopLeads: boolean; showActivityFeed: boolean }
export interface DayHours { enabled: boolean; start: string; end: string }
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Day = typeof DAYS[number];
export type WeekHours = Record<Day, DayHours>;
export interface AgentPrefs { notif: NotifPrefs; dash: DashPrefs; hours: WeekHours }

// Email and text alerts are opt-in so nobody starts getting messages they never asked for.
export const DEFAULT_NOTIF: NotifPrefs = { inApp: true, email: false, sms: false, leadAssigned: true, escalation: true, deliveryFailure: true, weeklyDigest: false, systemAlerts: false };
export const DEFAULT_DASH: DashPrefs = { defaultView: 'dashboard', compact: false, showKPIs: true, showFunnel: true, showTopLeads: true, showActivityFeed: true };
export const DEFAULT_HOURS: WeekHours = {
  monday: { enabled: true, start: '09:00', end: '17:00' }, tuesday: { enabled: true, start: '09:00', end: '17:00' }, wednesday: { enabled: true, start: '09:00', end: '17:00' },
  thursday: { enabled: true, start: '09:00', end: '17:00' }, friday: { enabled: true, start: '09:00', end: '17:00' }, saturday: { enabled: false, start: '10:00', end: '14:00' }, sunday: { enabled: false, start: '10:00', end: '14:00' },
};

export const LANDING_VIEWS: Array<{ value: string; label: string; href: string; adminOnly?: boolean }> = [
  { value: 'dashboard', label: 'Dashboard', href: '/' }, { value: 'pipeline', label: 'Pipeline Board', href: '/pipeline' }, { value: 'lead-management', label: 'Lead Management', href: '/lead-management' },
  { value: 'campaigns', label: 'Campaigns', href: '/campaigns' }, { value: 'map-view', label: 'Map View', href: '/map-view' }, { value: 'escalated-leads', label: 'Escalated Leads', href: '/escalated-leads' },
  { value: 'executive-overview', label: 'Executive Overview', href: '/executive-overview', adminOnly: true },
];

export const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Fills any missing or malformed setting from the defaults; `raw` is whatever is stored. */
export function mergePrefs(raw: unknown): AgentPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const notif = { ...DEFAULT_NOTIF }; for (const k of Object.keys(DEFAULT_NOTIF) as Array<keyof NotifPrefs>) if (typeof r.notif?.[k] === 'boolean') notif[k] = r.notif[k];
  const dash: DashPrefs = { ...DEFAULT_DASH };
  for (const k of ['compact', 'showKPIs', 'showFunnel', 'showTopLeads', 'showActivityFeed'] as const) if (typeof r.dash?.[k] === 'boolean') dash[k] = r.dash[k];
  if (typeof r.dash?.defaultView === 'string' && LANDING_VIEWS.some(v => v.value === r.dash.defaultView)) dash.defaultView = r.dash.defaultView;
  // Working hours saved during onboarding (one range for chosen days) seed the weekly grid until it is edited here.
  const hours = { ...DEFAULT_HOURS } as WeekHours;
  if (!r.hours && r.workingHoursStart && TIME.test(r.workingHoursStart) && TIME.test(r.workingHoursEnd ?? '') && Array.isArray(r.workingDays)) {
    for (const d of DAYS) hours[d] = { enabled: r.workingDays.map((x: string) => String(x).toLowerCase()).some((x: string) => d.startsWith(x.slice(0, 3))), start: r.workingHoursStart, end: r.workingHoursEnd };
  }
  for (const d of DAYS) { const h = r.hours?.[d]; if (h && typeof h.enabled === 'boolean' && TIME.test(h.start ?? '') && TIME.test(h.end ?? '')) hours[d] = { enabled: h.enabled, start: h.start, end: h.end }; }
  return { notif, dash, hours };
}

/** True when `at` falls inside the person's working hours in their own timezone. */
export function withinWorkingHours(hours: WeekHours, timezone: string, at = new Date()): boolean {
  let parts: Record<string, string>;
  try { parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map(p => [p.type, p.value])); }
  catch { return true; }
  const h = hours[parts.weekday.toLowerCase() as Day]; if (!h?.enabled) return false;
  const now = `${parts.hour}:${parts.minute}`; return now >= h.start && now < h.end;
}

export function validPrefsPatch(p: unknown): string | null {
  if (!p || typeof p !== 'object') return 'Preferences are missing.';
  const x = p as Record<string, any>;
  for (const d of DAYS) { const h = x.hours?.[d]; if (!h) continue; if (typeof h.enabled !== 'boolean' || !TIME.test(h.start ?? '') || !TIME.test(h.end ?? '')) return `Working hours for ${d} are not valid.`; if (h.enabled && h.end <= h.start) return `Working hours for ${d} must end after they start.`; }
  return null;
}
