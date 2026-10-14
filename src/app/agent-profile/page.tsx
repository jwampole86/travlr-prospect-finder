'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Bell, CheckCircle2, Clock, Loader2, LayoutDashboard, Lock, Mail, Monitor, Save, Send, Shield, Smartphone, User, XCircle } from 'lucide-react';
import { DAYS, LANDING_VIEWS, TIMEZONES, withinWorkingHours, type AgentPrefs, type Day, type NotifPrefs } from '@/lib/agentPrefs';

interface Snapshot {
  profile: { id: string; email: string; fullName: string; phone: string; timezone: string; bio: string; avatarInitials: string; smsOptIn: boolean; role: string; createdAt: string; lastActiveAt: string | null; sessionCount: number; permissions: Record<string, boolean> };
  prefs: AgentPrefs; myLeads: { total: number; byStage: Record<string, number> };
  notifications: { unread: number; recent: Array<{ id: string; title: string; message: string; created_at: string; read: boolean }> };
  channels: { email: boolean; sms: boolean };
}
interface Form { fullName: string; phone: string; timezone: string; bio: string; avatarInitials: string; smsOptIn: boolean; prefs: AgentPrefs }
type Tab = 'profile' | 'notifications' | 'hours' | 'dashboard' | 'security';

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [{ id: 'profile', label: 'Profile', icon: User }, { id: 'notifications', label: 'Notifications', icon: Bell }, { id: 'hours', label: 'Working hours', icon: Clock }, { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { id: 'security', label: 'Security', icon: Lock }];
const TYPES: Array<{ key: keyof NotifPrefs; label: string; desc: string }> = [
  { key: 'escalation', label: 'Replies and escalations', desc: 'A homeowner replies YES or a co-host prospect writes back' },
  { key: 'deliveryFailure', label: 'Delivery failures', desc: 'A text or email could not be delivered' },
  { key: 'leadAssigned', label: 'Leads assigned to me', desc: 'A lead is added to your queue' },
  { key: 'systemAlerts', label: 'System alerts', desc: 'Sync failures and service problems' },
  { key: 'weeklyDigest', label: 'Weekly digest', desc: 'A Monday summary of your leads' },
];
const STAGE_LABEL: Record<string, string> = { prospect: 'Prospects', queued: 'Queued', texted: 'Texted', engaged: 'Engaged', hot: 'Hot', human: 'Human Outreach', contract: 'Under Contract', live: 'Live', unreachable: 'Unreachable', closed: 'Closed' };
const DAY_LABEL: Record<Day, string> = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const RESULT: Record<string, string> = { sent: 'Sent', off: 'Switched off', outside_hours: 'Skipped: outside working hours', no_address: 'Skipped: nothing on file', no_consent: 'Skipped: text consent not given', duplicate_of_team_alert: 'Skipped: already covered by the team alert', failed: 'Failed' };

const toForm = (s: Snapshot): Form => ({ fullName: s.profile.fullName, phone: s.profile.phone, timezone: s.profile.timezone, bio: s.profile.bio, avatarInitials: s.profile.avatarInitials, smsOptIn: s.profile.smsOptIn, prefs: s.prefs });
const ago = (iso: string | null) => { if (!iso) return 'never'; const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
      <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform" style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }} />
    </button>
  );
}

const input = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

export default function AgentProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('profile');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string> | null>(null);
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try { const res = await fetch('/api/agent/profile', { cache: 'no-store' }); const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not load your profile.'); setSnap(j); setForm(toForm(j)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your profile.'); }
  }, []);
  useEffect(() => { void load(); const h = location.hash.slice(1) as Tab; if (TABS.some(t => t.id === h)) setTab(h); }, [load]);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(t); }, []);

  const dirty = !!snap && !!form && JSON.stringify(form) !== JSON.stringify(toForm(snap));
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);

  const phoneOk = !form?.phone.trim() || /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(form.phone.trim());
  const problems = useMemo(() => {
    if (!form) return [] as string[]; const p: string[] = [];
    if (form.fullName.trim().length < 2) p.push('Enter your full name.');
    if (!phoneOk) p.push('Enter a valid US phone number.');
    if (!/^[A-Za-z]{1,3}$/.test(form.avatarInitials.trim())) p.push('Initials must be 1 to 3 letters.');
    for (const d of DAYS) { const h = form.prefs.hours[d]; if (h.enabled && h.end <= h.start) p.push(`${DAY_LABEL[d]} must end after it starts.`); }
    if (form.prefs.notif.sms && (!form.phone.trim() || !form.smsOptIn)) p.push('Text alerts need a phone number and your consent.');
    return p;
  }, [form, phoneOk]);

  const save = useCallback(async () => {
    if (!form || saving || problems.length) { if (problems.length) toast.error(problems[0]); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/agent/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: form.fullName, phone: form.phone, timezone: form.timezone, bio: form.bio, avatarInitials: form.avatarInitials, smsOptIn: form.smsOptIn, prefs: form.prefs }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Your changes could not be saved.');
      setSnap(j); setForm(toForm(j)); toast.success('Saved');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Your changes could not be saved.'); } finally { setSaving(false); }
  }, [form, saving, problems]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (dirty) void save(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [dirty, save]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => f && { ...f, [k]: v });
  const setPrefs = (fn: (p: AgentPrefs) => AgentPrefs) => setForm(f => f && { ...f, prefs: fn(f.prefs) });
  const setNotif = (k: keyof NotifPrefs, v: boolean) => setPrefs(p => ({ ...p, notif: { ...p.notif, [k]: v } }));
  const setDay = (d: Day, patch: Partial<AgentPrefs['hours'][Day]>) => setPrefs(p => ({ ...p, hours: { ...p.hours, [d]: { ...p.hours[d], ...patch } } }));
  const preset = (days: Day[], start: string, end: string) => setPrefs(p => ({ ...p, hours: Object.fromEntries(DAYS.map(d => [d, { enabled: days.includes(d), start, end }])) as AgentPrefs['hours'] }));
  const goTab = (t: Tab) => { setTab(t); history.replaceState(null, '', `#${t}`); };

  async function sendTest() {
    if (dirty) { toast.info('Save your changes first so the test uses them.'); return; }
    setTesting(true); setTestResult(null);
    try { const res = await fetch('/api/agent/profile/test', { method: 'POST' }); const j = await res.json(); if (!res.ok) throw new Error(j.error); setTestResult(j.delivery); void load(); } catch { toast.error('The test could not be sent.'); } finally { setTesting(false); }
  }
  async function changePassword() {
    if (pw.next.length < 10) { toast.error('Use at least 10 characters.'); return; }
    if (pw.next !== pw.confirm) { toast.error('The two passwords do not match.'); return; }
    setPwBusy(true); const { error: e } = await supabase.auth.updateUser({ password: pw.next }); setPwBusy(false);
    if (e) toast.error(e.message); else { toast.success('Password updated'); setPw({ next: '', confirm: '' }); }
  }

  if (error && !snap) return <AppLayout><div className="p-6 max-w-3xl mx-auto"><div className="bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm rounded-xl p-4 flex items-center justify-between">{error}<button onClick={() => void load()} className="font-semibold underline">Retry</button></div></div></AppLayout>;
  if (!snap || !form) return <AppLayout><div className="p-6 max-w-5xl mx-auto space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}</div></AppLayout>;

  const p = snap.profile; const prefs = form.prefs; const isAdmin = ['admin', 'owner'].includes(p.role);
  const inHours = withinWorkingHours(prefs.hours, form.timezone);
  const localTime = new Date().toLocaleTimeString('en-US', { timeZone: form.timezone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const strength = [pw.next.length >= 10, /[A-Z]/.test(pw.next) && /[a-z]/.test(pw.next), /\d/.test(pw.next), /[^A-Za-z0-9]/.test(pw.next)].filter(Boolean).length;
  const channelCard = (key: 'inApp' | 'email' | 'sms', label: string, Icon: React.ElementType, desc: string, unavailable?: string) => (
    <div className={`p-3.5 rounded-xl border transition ${prefs.notif[key] ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'}`}>
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Icon size={14} className={prefs.notif[key] ? 'text-primary' : 'text-muted-foreground'} /><span className="text-sm font-semibold text-foreground">{label}</span></div><Toggle checked={prefs.notif[key]} onChange={v => setNotif(key, v)} label={label} disabled={!!unavailable} /></div>
      <p className="text-[11px] text-muted-foreground mt-1.5">{unavailable ?? desc}</p>
    </div>);

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 pb-24">
        <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary shrink-0">{(form.avatarInitials || p.fullName.slice(0, 2)).toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground">{form.fullName || 'Your name'}</h1>
            <p className="text-xs text-muted-foreground">{p.email} · <span className="capitalize">{p.role}</span> · member since {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · last active {ago(p.lastActiveAt)}</p>
            <div className="flex gap-1.5 flex-wrap mt-2">{Object.entries(p.permissions).map(([k, v]) => <span key={k} className={`text-[10px] px-2 py-0.5 rounded-full ${v || isAdmin ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground line-through'}`}>{k}</span>)}</div>
          </div>
          <div className="flex gap-3 text-center">
            <Link href="/pipeline" className="px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted"><p className="text-lg font-bold text-foreground leading-tight">{snap.myLeads.total}</p><p className="text-[10px] text-muted-foreground">My leads</p></Link>
            <Link href="/notifications" className="px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted"><p className={`text-lg font-bold leading-tight ${snap.notifications.unread ? 'text-orange-600' : 'text-foreground'}`}>{snap.notifications.unread}</p><p className="text-[10px] text-muted-foreground">Unread alerts</p></Link>
            <div className="px-3 py-2 rounded-lg bg-muted/40"><p className="text-lg font-bold text-foreground leading-tight">{p.sessionCount}</p><p className="text-[10px] text-muted-foreground">Sign-ins</p></div>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
          {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => goTab(t.id)} className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><t.icon size={14} />{t.label}</button>)}
        </div>

        {tab === 'profile' && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 md:col-span-2">
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block text-xs font-medium text-muted-foreground">Full name<input value={form.fullName} onChange={e => set('fullName', e.target.value)} maxLength={80} className={`${input} mt-1.5`} /></label>
                <label className="block text-xs font-medium text-muted-foreground">Initials (avatar)<input value={form.avatarInitials} onChange={e => set('avatarInitials', e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase())} className={`${input} mt-1.5`} /></label>
                <label className="block text-xs font-medium text-muted-foreground">Mobile number<input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 123-4567" inputMode="tel" className={`${input} mt-1.5 ${phoneOk ? '' : 'border-red-500'}`} /><span className={`block text-[11px] mt-1 ${phoneOk ? 'text-muted-foreground' : 'text-red-600'}`}>{phoneOk ? 'Used only for text alerts you switch on.' : 'Enter a valid US phone number.'}</span></label>
                <label className="block text-xs font-medium text-muted-foreground">Timezone<select value={form.timezone} onChange={e => set('timezone', e.target.value)} className={`${input} mt-1.5`}>{TIMEZONES.map(z => <option key={z}>{z}</option>)}</select><span className="block text-[11px] mt-1 text-muted-foreground">It is {localTime} there now.</span></label>
              </div>
              <label className="block text-xs font-medium text-muted-foreground">Short bio<textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={3} maxLength={300} className={`${input} mt-1.5 resize-none`} /><span className="block text-right text-[11px] text-muted-foreground">{form.bio.length}/300</span></label>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Email address</h3>
              <p className="text-xs text-muted-foreground">Signed in as <span className="font-medium text-foreground">{p.email}</span>. A confirmation link goes to the new address before it changes.</p>
              <div className="flex gap-2"><input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="new@example.com" className={input} /><button disabled={!/^\S+@\S+\.\S+$/.test(newEmail)} onClick={async () => { const { error: e } = await supabase.auth.updateUser({ email: newEmail }); if (e) toast.error(e.message); else { toast.success('Check your new inbox to confirm'); setNewEmail(''); } }} className="px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted disabled:opacity-40">Change</button></div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-2">My leads by stage</h3>
              {snap.myLeads.total === 0 ? <p className="text-xs text-muted-foreground">No leads are assigned to you yet.</p> : <div className="flex flex-wrap gap-1.5">{Object.entries(snap.myLeads.byStage).map(([s, n]) => <Link key={s} href="/pipeline" className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-primary/10 text-foreground">{STAGE_LABEL[s] ?? s} <span className="font-bold">{n}</span></Link>)}</div>}
              {isAdmin && <p className="text-[11px] text-muted-foreground mt-3">As an administrator you can see every lead on the Pipeline Board.</p>}
            </div>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div><h3 className="text-sm font-semibold text-foreground">How you are alerted</h3><p className="text-xs text-muted-foreground mt-0.5">In-app alerts always arrive. Email and text alerts are only sent during your working hours, so nothing wakes you at night.</p></div>
              <div className="grid sm:grid-cols-3 gap-3">
                {channelCard('inApp', 'In-app', Monitor, 'The bell and the notifications page')}
                {channelCard('email', 'Email', Mail, `Sent to ${p.email}`, snap.channels.email ? undefined : 'Email is not set up on this system.')}
                {channelCard('sms', 'Text message', Smartphone, form.phone ? `Sent to ${form.phone}` : 'Add your mobile number on the Profile tab', snap.channels.sms ? undefined : 'Text messaging is not set up on this system.')}
              </div>
              {prefs.notif.sms && (
                <label className="flex items-start gap-2 text-xs text-foreground bg-muted/40 rounded-lg p-3 cursor-pointer"><input type="checkbox" checked={form.smsOptIn} onChange={e => set('smsOptIn', e.target.checked)} className="mt-0.5" /><span>I agree to receive TRAVLR alerts by text message at {form.phone || 'my mobile number'}. Message and data rates may apply. I can turn this off any time.</span></label>
              )}
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">What you are alerted about</h3>
              <div className="divide-y divide-border">{TYPES.map(t => <div key={t.key} className="flex items-center justify-between gap-3 py-2.5"><div><p className="text-sm font-medium text-foreground">{t.label}</p><p className="text-xs text-muted-foreground">{t.desc}</p></div><Toggle checked={prefs.notif[t.key]} onChange={v => setNotif(t.key, v)} label={t.label} /></div>)}</div>
              <p className="text-[11px] text-muted-foreground mt-3">The weekly digest and lead-assigned alerts are saved now and will start when those alerts are built. Replies, escalations and delivery failures are live.</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-2"><div><h3 className="text-sm font-semibold text-foreground">Send a test</h3><p className="text-xs text-muted-foreground">Sends one alert through every channel you switched on, ignoring working hours.</p></div>
                <button onClick={() => void sendTest()} disabled={testing} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted disabled:opacity-50">{testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Send test</button></div>
              {testResult && <ul className="mt-3 space-y-1 text-xs">{(['inApp', 'email', 'sms'] as const).map(c => <li key={c} className="flex items-center gap-2">{testResult[c] === 'sent' ? <CheckCircle2 size={13} className="text-emerald-600" /> : <XCircle size={13} className="text-muted-foreground" />}<span className="font-medium text-foreground w-24">{c === 'inApp' ? 'In-app' : c === 'sms' ? 'Text' : 'Email'}</span><span className="text-muted-foreground">{RESULT[testResult[c]] ?? testResult[c]}</span></li>)}</ul>}
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-foreground">Recent alerts</h3><Link href="/notifications" className="text-xs text-primary hover:underline">See all</Link></div>
              {snap.notifications.recent.length === 0 ? <p className="text-xs text-muted-foreground">Nothing yet.</p> : <ul className="divide-y divide-border">{snap.notifications.recent.map(n => <li key={n.id} className="py-2 flex gap-2"><span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.read ? 'bg-border' : 'bg-orange-500'}`} /><div className="min-w-0"><p className="text-xs font-medium text-foreground">{n.title}</p><p className="text-[11px] text-muted-foreground line-clamp-2">{n.message}</p></div><span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">{ago(n.created_at)}</span></li>)}</ul>}
            </div>
          </div>
        )}

        {tab === 'hours' && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div><h3 className="text-sm font-semibold text-foreground">Working hours</h3><p className="text-xs text-muted-foreground mt-0.5">Email and text alerts are only sent inside these hours, in {form.timezone}. It is {localTime} now.</p></div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${inHours ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{inHours ? 'Working now' : 'Off the clock'}</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {([['Weekdays 9 to 5', () => preset(DAYS.slice(0, 5), '09:00', '17:00')], ['Weekdays 8 to 6', () => preset(DAYS.slice(0, 5), '08:00', '18:00')], ['Every day 9 to 8', () => preset([...DAYS], '09:00', '20:00')], ['Copy Monday to weekdays', () => setPrefs(p => ({ ...p, hours: { ...p.hours, tuesday: { ...p.hours.monday }, wednesday: { ...p.hours.monday }, thursday: { ...p.hours.monday }, friday: { ...p.hours.monday } } }))]] as Array<[string, () => void]>).map(([l, fn]) => <button key={l} onClick={fn} className="text-xs px-2.5 py-1 rounded-full border border-border hover:bg-muted text-foreground">{l}</button>)}
            </div>
            <div>{DAYS.map(d => { const h = prefs.hours[d]; const bad = h.enabled && h.end <= h.start; return (
              <div key={d} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0 flex-wrap">
                <div className="flex items-center gap-2 w-36"><Toggle checked={h.enabled} onChange={v => setDay(d, { enabled: v })} label={DAY_LABEL[d]} /><span className={`text-sm font-medium ${h.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{DAY_LABEL[d]}</span></div>
                {h.enabled ? <div className="flex items-center gap-2"><input type="time" value={h.start} onChange={e => setDay(d, { start: e.target.value })} className={`${input} !w-auto !py-1`} /><span className="text-xs text-muted-foreground">to</span><input type="time" value={h.end} onChange={e => setDay(d, { end: e.target.value })} className={`${input} !w-auto !py-1 ${bad ? 'border-red-500' : ''}`} />{bad && <span className="text-[11px] text-red-600">Must end after it starts</span>}</div> : <span className="text-xs text-muted-foreground italic">Off</span>}
              </div>); })}</div>
          </div>
        )}

        {tab === 'dashboard' && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div><h3 className="text-sm font-semibold text-foreground">Where you land</h3><p className="text-xs text-muted-foreground mt-0.5">The first screen you see each time you sign in.</p></div>
              <select value={prefs.dash.defaultView} onChange={e => setPrefs(pr => ({ ...pr, dash: { ...pr.dash, defaultView: e.target.value } }))} className={input} aria-label="Default landing screen">{LANDING_VIEWS.filter(v => !v.adminOnly || isAdmin).map(v => <option key={v.value} value={v.value}>{v.label}</option>)}</select>
              <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-foreground">Compact dashboard</p><p className="text-xs text-muted-foreground">Tighter spacing so more fits on screen</p></div><Toggle checked={prefs.dash.compact} onChange={v => setPrefs(pr => ({ ...pr, dash: { ...pr.dash, compact: v } }))} label="Compact dashboard" /></div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div><h3 className="text-sm font-semibold text-foreground">Dashboard sections</h3><p className="text-xs text-muted-foreground mt-0.5">Hide what you do not use.</p></div>
              {([['showKPIs', 'KPI cards'], ['showFunnel', 'Pipeline by stage'], ['showTopLeads', 'Top scored leads'], ['showActivityFeed', 'Recent activity']] as const).map(([k, l]) => <div key={k} className="flex items-center justify-between"><span className="text-sm text-foreground">{l}</span><Toggle checked={prefs.dash[k]} onChange={v => setPrefs(pr => ({ ...pr, dash: { ...pr.dash, [k]: v } }))} label={l} /></div>)}
              <div className="pt-2 border-t border-border"><p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Preview</p><div className={prefs.dash.compact ? 'space-y-1' : 'space-y-2'}>{([['showKPIs', 'KPI cards', 'h-8'], ['showFunnel', 'Pipeline by stage', 'h-10'], ['showTopLeads', 'Top scored leads', 'h-12'], ['showActivityFeed', 'Recent activity', 'h-8']] as const).filter(([k]) => prefs.dash[k]).map(([k, l, h]) => <div key={k} className={`${h} rounded-md bg-primary/10 border border-primary/20 text-[10px] text-primary px-2 flex items-center`}>{l}</div>)}</div></div>
            </div>
          </div>
        )}

        {tab === 'security' && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Lock size={14} />Change password</h3>
              <input type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw(s => ({ ...s, next: e.target.value }))} placeholder="New password" className={input} />
              <div className="flex gap-1" aria-hidden>{[0, 1, 2, 3].map(i => <span key={i} className={`h-1 flex-1 rounded-full ${i < strength ? (strength >= 4 ? 'bg-emerald-500' : strength >= 2 ? 'bg-amber-400' : 'bg-red-400') : 'bg-border'}`} />)}</div>
              <input type="password" autoComplete="new-password" value={pw.confirm} onChange={e => setPw(s => ({ ...s, confirm: e.target.value }))} placeholder="Confirm new password" className={input} />
              <p className="text-[11px] text-muted-foreground">At least 10 characters. Mix upper and lower case, a number and a symbol for a strong password.</p>
              <button onClick={() => void changePassword()} disabled={pwBusy || !pw.next} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{pwBusy ? 'Updating…' : 'Update password'}</button>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield size={14} />Sessions</h3>
              <p className="text-xs text-muted-foreground">You have signed in {p.sessionCount} time{p.sessionCount === 1 ? '' : 's'}. If you used a shared or lost device, sign out everywhere else. This browser stays signed in.</p>
              <button onClick={async () => { const { error: e } = await supabase.auth.signOut({ scope: 'others' }); if (e) toast.error(e.message); else toast.success('Signed out of all other devices'); }} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted">Sign out other devices</button>
            </div>
          </div>
        )}
      </div>

      {(dirty || saving) && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
            <p className="text-sm text-foreground flex-1 min-w-0">{problems.length ? <span className="text-red-600">{problems[0]}</span> : 'You have unsaved changes.'}</p>
            <button onClick={() => setForm(toForm(snap))} disabled={saving} className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted">Discard</button>
            <button onClick={() => void save()} disabled={saving || problems.length > 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
