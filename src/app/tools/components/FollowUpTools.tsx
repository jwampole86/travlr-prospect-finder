'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, Bell, Calendar, CheckCircle, Clock, Edit3, ExternalLink, Eye, Loader2, Mail, MessageSquare, Phone, Plus, Save, Search, Send, SkipForward, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { FOLLOW_UP_CATEGORIES, categoryLabel, renderTemplate, templateToText, textToBody } from '@/lib/followUpTemplates';

interface EmailTemplate { id: string; name: string; subject: string; body: string; category: string; created_at?: string }
interface Reminder { id: string; lead_id: string; title: string; due_date: string; priority: 'low' | 'medium' | 'high'; completed: boolean }
interface CadenceStep { id: string; lead_id: string; step_number: number; channel: string; scheduled_at: string; status: 'pending' | 'sent' | 'skipped'; template_id?: string | null }
interface LeadInfo { id: string; address: string | null; city: string | null; state: string | null; contact_name: string | null }
interface Preview { to?: string; subject?: string; text?: string; templateId?: string | null; senderName?: string; error?: string; code?: string }

const priorityColors: Record<string, string> = { low: 'text-muted-foreground', medium: 'text-amber-500', high: 'text-red-500' };
const channelIcon = (c: string) => (c === 'email' ? <Mail size={13} /> : c === 'sms' ? <MessageSquare size={13} /> : <Phone size={13} />);
const todayStr = () => new Date().toLocaleDateString('en-CA');
const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() + n); return t.toLocaleDateString('en-CA'); };
const dayOf = (s: string) => String(s).slice(0, 10);
const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

function LeadLink({ lead, id }: { lead?: LeadInfo; id: string }) {
  const label = lead ? [lead.address, lead.city, lead.state].filter(Boolean).join(', ') || 'Open lead' : 'Open lead';
  return <Link href={`/lead-profile?id=${id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline min-w-0"><span className="truncate">{label}</span><ExternalLink size={10} className="shrink-0" /></Link>;
}

export default function FollowUpTools() {
  const supabase = useMemo(() => createClient(), []);
  const [section, setSection] = useState<'templates' | 'reminders' | 'cadence'>('cadence');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [cadences, setCadences] = useState<CadenceStep[]>([]);
  const [leads, setLeads] = useState<Map<string, LeadInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Templates
  const [tplSearch, setTplSearch] = useState('');
  const [tplCat, setTplCat] = useState('all');
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [tplName, setTplName] = useState(''); const [tplSubject, setTplSubject] = useState(''); const [tplBody, setTplBody] = useState(''); const [tplCategory, setTplCategory] = useState('initial_outreach');
  const [savingTpl, setSavingTpl] = useState(false);
  const [previewTpl, setPreviewTpl] = useState<EmailTemplate | null>(null);

  // Reminders
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // Cadence send review
  const [review, setReview] = useState<{ step: CadenceStep; templateId: string; loading: boolean; sending: boolean; data: Preview | null } | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const [tplRes, remRes, cadRes] = await Promise.all([
        supabase.from('email_templates').select('id,name,subject,body,category,created_at').order('name').limit(500),
        supabase.from('lead_reminders').select('*').eq('completed', false).order('due_date').limit(200),
        supabase.from('outreach_cadences').select('*').eq('status', 'pending').order('scheduled_at').limit(200),
      ]);
      const err = tplRes.error || remRes.error || cadRes.error;
      if (err) throw new Error(err.message);
      const rem = (remRes.data ?? []) as Reminder[]; const cad = (cadRes.data ?? []) as CadenceStep[];
      setTemplates((tplRes.data ?? []) as EmailTemplate[]); setReminders(rem); setCadences(cad);
      const ids = [...new Set([...rem.map(r => r.lead_id), ...cad.map(c => c.lead_id)])];
      const map = new Map<string, LeadInfo>();
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('leads').select('id,address,city,state,contact_name').in('id', ids.slice(i, i + 100));
        for (const l of (data ?? []) as LeadInfo[]) map.set(l.id, l);
      }
      setLeads(map);
    } catch (e) { setLoadError((e as Error).message || 'Could not load follow-up data.'); }
    finally { setLoading(false); }
  }, [supabase]);
  useEffect(() => { loadData(); }, [loadData]);

  const today = todayStr();

  // ── Cadence ──────────────────────────────────────────────────────────────
  async function callCadence(stepId: string, action: 'preview' | 'send' | 'done' | 'skip', templateId?: string) {
    const res = await fetch('/api/follow-up/cadence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepId, action, templateId: templateId || undefined }) });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, j: j as Preview & { error?: string } };
  }
  async function openReview(step: CadenceStep, templateId = step.template_id ?? '') {
    setReview({ step, templateId, loading: true, sending: false, data: null });
    const { ok, j } = await callCadence(step.id, 'preview', templateId);
    setReview(r => (r && r.step.id === step.id ? { ...r, loading: false, data: ok ? j : { error: j.error ?? 'Could not prepare this email.', code: j.code } } : r));
  }
  async function confirmSend() {
    if (!review) return;
    setReview({ ...review, sending: true });
    const { ok, j } = await callCadence(review.step.id, 'send', review.templateId);
    if (!ok) { toast.error(j.error ?? 'The email could not be sent.'); setReview(r => (r ? { ...r, sending: false } : r)); return; }
    toast.success(`Email sent to ${j.to}`);
    setCadences(prev => prev.filter(c => c.id !== review.step.id)); setReview(null);
  }
  async function markStep(step: CadenceStep, action: 'done' | 'skip') {
    setBusyStep(step.id);
    const { ok, j } = await callCadence(step.id, action);
    setBusyStep(null);
    if (!ok) { toast.error(j.error ?? 'Could not update this step.'); return; }
    setCadences(prev => prev.filter(c => c.id !== step.id));
    toast.success(action === 'done' ? 'Marked done' : 'Skipped');
  }

  // ── Reminders ────────────────────────────────────────────────────────────
  async function completeReminder(rem: Reminder) {
    const { error } = await supabase.from('lead_reminders').update({ completed: true }).eq('id', rem.id);
    if (error) { toast.error('Could not complete that reminder.'); return; }
    setReminders(prev => prev.filter(r => r.id !== rem.id));
  }
  async function snoozeReminder(rem: Reminder) {
    const due = addDays(dayOf(rem.due_date) < today ? today : dayOf(rem.due_date), 1);
    const { error } = await supabase.from('lead_reminders').update({ due_date: due }).eq('id', rem.id);
    if (error) { toast.error('Could not snooze that reminder.'); return; }
    setReminders(prev => prev.map(r => (r.id === rem.id ? { ...r, due_date: due } : r)).sort((a, b) => a.due_date.localeCompare(b.due_date)));
    toast.success(`Moved to ${due}`);
  }

  // ── Templates ────────────────────────────────────────────────────────────
  function startNew() { setEditing(null); setTplName(''); setTplSubject(''); setTplBody(''); setTplCategory('initial_outreach'); setCreating(true); }
  function startEdit(t: EmailTemplate) { setCreating(false); setEditing(t); setTplName(t.name); setTplSubject(t.subject); setTplBody(templateToText(t.body).text); setTplCategory(t.category); }
  function cancelEdit() { setCreating(false); setEditing(null); }
  async function saveTemplate() {
    if (!tplName.trim() || !tplSubject.trim() || !tplBody.trim()) { toast.error('Give the template a name, subject and body.'); return; }
    setSavingTpl(true);
    try {
      const row = { name: tplName.trim(), subject: tplSubject.trim(), body: textToBody(tplBody.trim()), category: tplCategory };
      const { error } = editing ? await supabase.from('email_templates').update({ ...row, updated_at: new Date().toISOString() }).eq('id', editing.id) : await supabase.from('email_templates').insert({ id: crypto.randomUUID(), ...row });
      if (error) throw new Error(error.message);
      toast.success('Template saved'); cancelEdit(); await loadData();
    } catch (e) { toast.error((e as Error).message || 'Could not save the template.'); }
    finally { setSavingTpl(false); }
  }
  async function deleteTemplate(t: EmailTemplate) {
    if (!window.confirm(`Delete the template "${t.name}"? Cadence steps that use it will fall back to the default wording.`)) return;
    const { error } = await supabase.from('email_templates').delete().eq('id', t.id);
    if (error) { toast.error('Could not delete the template.'); return; }
    setTemplates(prev => prev.filter(x => x.id !== t.id));
  }

  const visibleTemplates = useMemo(() => templates.filter(t => (tplCat === 'all' || t.category === tplCat) && (!tplSearch || `${t.name} ${t.subject}`.toLowerCase().includes(tplSearch.toLowerCase()))), [templates, tplCat, tplSearch]);
  const visibleReminders = reminders.filter(r => priorityFilter === 'all' || r.priority === priorityFilter);
  const overdue = visibleReminders.filter(r => dayOf(r.due_date) < today);
  const dueToday = visibleReminders.filter(r => dayOf(r.due_date) === today);
  const upcoming = visibleReminders.filter(r => dayOf(r.due_date) > today);
  const overdueSteps = cadences.filter(c => dayOf(c.scheduled_at) < today).length;
  const todaySteps = cadences.filter(c => dayOf(c.scheduled_at) === today).length;

  const sections = [
    { key: 'cadence' as const, label: 'Outreach Cadence', icon: <Calendar size={14} />, count: cadences.length, alert: overdueSteps },
    { key: 'reminders' as const, label: 'Next-Action Reminders', icon: <Bell size={14} />, count: reminders.length, alert: reminders.filter(r => dayOf(r.due_date) < today).length },
    { key: 'templates' as const, label: 'Email Templates', icon: <Mail size={14} />, count: templates.length, alert: 0 },
  ];

  const reminderRow = (rem: Reminder, tone: 'overdue' | 'today' | 'upcoming') => (
    <div key={rem.id} className={cx('rounded-xl border p-3 flex items-center gap-3', tone === 'overdue' ? 'bg-red-500/5 border-red-500/20' : 'bg-card border-border')}>
      <button onClick={() => completeReminder(rem)} aria-label="Mark done" title="Mark done" className={cx('w-5 h-5 rounded-full border-2 shrink-0 hover:bg-emerald-500/10 hover:border-emerald-500', tone === 'overdue' ? 'border-red-500' : 'border-border')} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{rem.title}</p>
        <div className="flex items-center gap-2 flex-wrap"><LeadLink lead={leads.get(rem.lead_id)} id={rem.lead_id} /><span className="text-[10px] text-muted-foreground">Due {rem.due_date} · <span className={cx('capitalize font-medium', priorityColors[rem.priority])}>{rem.priority}</span></span></div>
      </div>
      <button onClick={() => snoozeReminder(rem)} className="px-2 py-1 text-[11px] rounded-lg border border-border hover:bg-muted">Snooze 1 day</button>
      <button onClick={() => completeReminder(rem)} className="px-2 py-1 text-[11px] rounded-lg bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 inline-flex items-center gap-1"><CheckCircle size={12} />Done</button>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex border-b border-border bg-muted/30 overflow-x-auto">
        {sections.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)} className={cx('flex items-center gap-2 px-5 py-3 text-xs font-medium transition-colors border-b-2 whitespace-nowrap', section === s.key ? 'border-primary text-primary bg-card' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {s.icon}{s.label}
            {s.count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">{s.count}</span>}
            {s.alert > 0 && <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 text-[10px] font-semibold">{s.alert} overdue</span>}
          </button>
        ))}
      </div>

      <div className="p-5">
        {loadError && <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600"><AlertCircle size={14} />{loadError}<button onClick={loadData} className="ml-auto text-xs underline">Try again</button></div>}
        {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={22} /></div> : (
          <>
            {/* ── CADENCE ── */}
            {section === 'cadence' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">Pending outreach steps across your leads: {overdueSteps} overdue, {todaySteps} due today. Email steps send to the lead&apos;s own address on file after you review the message. Other channels: contact the lead, then mark the step done. Add steps from a lead&apos;s page.</p>
                {cadences.length === 0 ? <p className="text-center py-8 text-sm text-muted-foreground">No pending outreach steps.</p> : (
                  <div className="space-y-2">{cadences.map(step => {
                    const d = dayOf(step.scheduled_at); const late = d < today; const now = d === today;
                    return (
                      <div key={step.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 flex-wrap">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">{step.step_number}</div>
                        <div className="flex-1 min-w-[200px]">
                          <p className="text-sm font-medium text-foreground capitalize inline-flex items-center gap-1.5">{channelIcon(step.channel)}{step.channel} outreach</p>
                          <div className="flex items-center gap-2 flex-wrap"><LeadLink lead={leads.get(step.lead_id)} id={step.lead_id} /><span className="text-[10px] text-muted-foreground">Scheduled {step.scheduled_at}</span></div>
                        </div>
                        <span className={cx('text-[10px] font-medium px-2 py-0.5 rounded-full', late ? 'bg-red-500/10 text-red-600' : now ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground')}>{late ? 'Overdue' : now ? 'Due today' : 'Upcoming'}</span>
                        {step.channel === 'email'
                          ? <button onClick={() => openReview(step)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20"><Eye size={11} />Review and send</button>
                          : <button onClick={() => markStep(step, 'done')} disabled={busyStep === step.id} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-700 rounded-lg hover:bg-emerald-500/20 disabled:opacity-50"><CheckCircle size={11} />Mark done</button>}
                        {step.channel === 'email' && <button onClick={() => markStep(step, 'done')} disabled={busyStep === step.id} title="I already contacted them another way" className="px-2 py-1.5 text-[11px] rounded-lg border border-border hover:bg-muted disabled:opacity-50">Mark done</button>}
                        <button onClick={() => markStep(step, 'skip')} disabled={busyStep === step.id} className="px-2 py-1.5 text-[11px] rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1 disabled:opacity-50"><SkipForward size={11} />Skip</button>
                      </div>
                    );
                  })}</div>
                )}
              </div>
            )}

            {/* ── REMINDERS ── */}
            {section === 'reminders' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-muted-foreground">Next-action reminders across your leads. Add reminders from a lead&apos;s page.</p>
                  <div className="inline-flex rounded-lg border border-border p-0.5 text-[11px]">{(['all', 'high', 'medium', 'low'] as const).map(p => <button key={p} onClick={() => setPriorityFilter(p)} aria-pressed={priorityFilter === p} className={cx('px-2.5 py-1 rounded-md capitalize', priorityFilter === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{p}</button>)}</div>
                </div>
                {overdue.length > 0 && <div className="space-y-2"><h4 className="flex items-center gap-2 text-xs font-semibold text-red-600 uppercase tracking-wide"><AlertCircle size={13} />Overdue ({overdue.length})</h4>{overdue.map(r => reminderRow(r, 'overdue'))}</div>}
                {dueToday.length > 0 && <div className="space-y-2"><h4 className="flex items-center gap-2 text-xs font-semibold text-amber-600 uppercase tracking-wide"><Clock size={13} />Due today ({dueToday.length})</h4>{dueToday.map(r => reminderRow(r, 'today'))}</div>}
                {upcoming.length > 0 && <div className="space-y-2"><h4 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"><Clock size={13} />Upcoming ({upcoming.length})</h4>{upcoming.map(r => reminderRow(r, 'upcoming'))}</div>}
                {visibleReminders.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">No pending reminders{priorityFilter !== 'all' ? ` with ${priorityFilter} priority` : ''}.</p>}
              </div>
            )}

            {/* ── TEMPLATES ── */}
            {section === 'templates' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input value={tplSearch} onChange={e => setTplSearch(e.target.value)} placeholder="Search templates" aria-label="Search templates" className="h-8 w-52 rounded-lg border border-border bg-background pl-7 pr-2 text-xs" /></div>
                  <select value={tplCat} onChange={e => setTplCat(e.target.value)} aria-label="Category" className="h-8 rounded-lg border border-border bg-background px-2 text-xs"><option value="all">All categories</option>{FOLLOW_UP_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                  <span className="text-[11px] text-muted-foreground">{visibleTemplates.length} of {templates.length}</span>
                  <Link href="/email-templates" className="ml-auto text-xs text-primary hover:underline">Full template editor</Link>
                  <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"><Plus size={12} />New template</button>
                </div>
                <p className="text-[11px] text-muted-foreground">Fields that fill in automatically: <code className="bg-muted px-1 rounded">{'{{address}}'}</code> <code className="bg-muted px-1 rounded">{'{{contactName}}'}</code> <code className="bg-muted px-1 rounded">{'{{senderName}}'}</code> <code className="bg-muted px-1 rounded">{'{{localBlurb}}'}</code> <code className="bg-muted px-1 rounded">{'{{price}}'}</code>. A template with any other field cannot be sent from the cadence.</p>

                {(creating || editing) && (
                  <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-foreground">{editing ? 'Edit template' : 'New template'}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Template name" aria-label="Template name" className="px-3 py-2 text-sm bg-background border border-border rounded-lg" />
                      <select value={tplCategory} onChange={e => setTplCategory(e.target.value)} aria-label="Template category" className="px-3 py-2 text-sm bg-background border border-border rounded-lg">{FOLLOW_UP_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                    </div>
                    <input value={tplSubject} onChange={e => setTplSubject(e.target.value)} placeholder="Email subject" aria-label="Email subject" className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg" />
                    <textarea value={tplBody} onChange={e => setTplBody(e.target.value)} placeholder="Email body" aria-label="Email body" rows={8} className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg font-mono" />
                    <div className="flex gap-2">
                      <button onClick={saveTemplate} disabled={savingTpl} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"><Save size={13} />{savingTpl ? 'Saving...' : 'Save template'}</button>
                      <button onClick={cancelEdit} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted"><X size={13} />Cancel</button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                  {visibleTemplates.map(t => {
                    const cat = FOLLOW_UP_CATEGORIES.find(c => c.key === t.category); const editable = templateToText(t.body).editable;
                    return (
                      <div key={t.id} className="bg-background border border-border rounded-xl p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-medium text-foreground">{t.name}</p><span className={cx('text-[10px] font-medium px-2 py-0.5 rounded-full', cat?.tone ?? 'bg-muted text-muted-foreground')}>{categoryLabel(t.category)}</span></div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.subject}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setPreviewTpl(t)} title="Preview" aria-label="Preview" className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-muted"><Eye size={13} /></button>
                          {editable ? <button onClick={() => startEdit(t)} title="Edit" aria-label="Edit" className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-muted"><Edit3 size={13} /></button>
                            : <Link href="/email-templates" title="This template has images or buttons. Edit it in Email Templates." className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-muted"><ExternalLink size={13} /></Link>}
                          <button onClick={() => deleteTemplate(t)} title="Delete" aria-label="Delete" className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-500/10"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    );
                  })}
                  {visibleTemplates.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">No templates match.</p>}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Review and send */}
      {review && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Review email">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-foreground">Review before sending</h3><div className="mt-0.5"><LeadLink lead={leads.get(review.step.lead_id)} id={review.step.lead_id} /></div></div><button onClick={() => setReview(null)} aria-label="Close" className="p-1 rounded hover:bg-muted"><X size={16} /></button></div>
            <label className="block text-xs text-muted-foreground">Template
              <select value={review.templateId} onChange={e => openReview(review.step, e.target.value)} className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground">
                <option value="">Default follow-up wording</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            {review.loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div> : review.data?.error ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-800 dark:text-amber-300">{review.data.error}{review.data.code === 'no_email' && <Link href={`/lead-profile?id=${review.step.lead_id}`} className="block mt-2 text-xs text-primary hover:underline">Open the lead profile</Link>}</div>
            ) : review.data && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">To <b className="text-foreground">{review.data.to}</b> · from {review.data.senderName}</p>
                <p className="text-sm font-medium text-foreground">{review.data.subject}</p>
                <pre className="text-xs whitespace-pre-wrap font-sans bg-muted/60 rounded-xl p-3 max-h-72 overflow-y-auto">{review.data.text}</pre>
                <p className="text-[11px] text-muted-foreground">An unsubscribe link and our postal address are added automatically.</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setReview(null)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={confirmSend} disabled={review.loading || review.sending || !!review.data?.error || !review.data} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">{review.sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Send email</button>
            </div>
          </div>
        </div>
      )}

      {/* Template preview */}
      {previewTpl && (() => {
        const r = renderTemplate(previewTpl.subject, previewTpl.body, { address: '123 Aspen Ridge Rd', city: 'Aspen', state: 'CO', contact_name: 'Alex Rivera', price: 1250000 }, 'Your Name');
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Template preview">
            <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-3">
              <div className="flex items-start justify-between"><div><h3 className="text-sm font-semibold text-foreground">{previewTpl.name}</h3><p className="text-[11px] text-muted-foreground">Preview with sample homeowner details</p></div><button onClick={() => setPreviewTpl(null)} aria-label="Close" className="p-1 rounded hover:bg-muted"><X size={16} /></button></div>
              {r.missing.length > 0 && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">This template uses {r.missing.map(m => `{{${m}}}`).join(', ')}, which cannot be filled automatically, so it cannot be sent from the cadence.</div>}
              <p className="text-sm font-medium text-foreground">{r.subject}</p>
              <pre className="text-xs whitespace-pre-wrap font-sans bg-muted/60 rounded-xl p-3">{r.text}</pre>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
