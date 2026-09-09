'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, Bell, Calendar, Clock, Plus, Trash2, Edit3, Save, X, CheckCircle, AlertCircle, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  created_at?: string;
}

interface Reminder {
  id: string;
  lead_id: string;
  title: string;
  due_date: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
}

interface CadenceStep {
  id: string;
  lead_id: string;
  step_number: number;
  channel: string;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'skipped';
  template_id?: string;
}

interface LeadContact {
  id: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  price: number;
}

const categoryColors: Record<string, string> = {
  outreach: 'bg-blue-500/10 text-blue-500',
  follow_up: 'bg-amber-500/10 text-amber-500',
  proposal: 'bg-purple-500/10 text-purple-500',
  closing: 'bg-green-500/10 text-green-500',
};

const priorityColors: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-warning',
  high: 'text-danger',
};

export default function FollowUpTools() {
  const [activeSection, setActiveSection] = useState<'templates' | 'reminders' | 'cadence'>('templates');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [cadences, setCadences] = useState<CadenceStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingCadence, setSendingCadence] = useState<string | null>(null);

  // Template form
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [newTemplate, setNewTemplate] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplCategory, setTplCategory] = useState('outreach');
  const [savingTpl, setSavingTpl] = useState(false);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, remRes, cadRes] = await Promise.all([
        supabase.from('email_templates').select('*').order('category'),
        supabase.from('lead_reminders').select('*').eq('completed', false).order('due_date').limit(50),
        supabase.from('outreach_cadences').select('*').eq('status', 'pending').order('scheduled_at').limit(50),
      ]);
      if (tplRes.data) setTemplates(tplRes.data as EmailTemplate[]);
      if (remRes.data) setReminders(remRes.data as Reminder[]);
      if (cadRes.data) setCadences(cadRes.data as CadenceStep[]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  async function sendCadenceEmail(step: CadenceStep) {
    if (step.channel !== 'email') {
      toast.info('Only email channel steps can be sent via Resend.');
      return;
    }
    setSendingCadence(step.id);
    try {
      // Fetch lead contact info
      const { data: lead } = await supabase
        .from('leads')
        .select('id, address, contact_name, contact_phone, price')
        .eq('id', step.lead_id)
        .single();

      if (!lead) {
        toast.error('Lead not found for this cadence step.');
        return;
      }

      // Determine template
      let subject = `Following up on ${lead.address}`;
      let body = `Hi ${lead.contact_name || 'there'},\n\nI wanted to follow up regarding the property at ${lead.address}.\n\nWould you be open to a quick conversation?\n\nBest regards`;

      if (step.template_id) {
        const tpl = templates.find((t) => t.id === step.template_id);
        if (tpl) {
          subject = tpl.subject
            .replace(/{{address}}/g, lead.address)
            .replace(/{{contactName}}/g, lead.contact_name || 'there')
            .replace(/{{price}}/g, `$${lead.price?.toLocaleString('en-US') || ''}`);
          body = tpl.body
            .replace(/{{address}}/g, lead.address)
            .replace(/{{contactName}}/g, lead.contact_name || 'there')
            .replace(/{{price}}/g, `$${lead.price?.toLocaleString('en-US') || ''}`)
            .replace(/{{senderName}}/g, 'Your Name');
        }
      }

      // Determine recipient email — use contact_phone as placeholder if no email stored
      // In a real setup, leads would have a contact_email field
      const toEmail = `${lead.contact_name?.toLowerCase().replace(/\s+/g, '.') || 'prospect'}@example.com`;

      const { data, error } = await supabase.functions.invoke('send-cadence-email', {
        body: {
          to: toEmail,
          subject,
          body,
          cadenceId: step.id,
        },
      });

      if (error) {
        toast.error(`Failed to send: ${error.message}`);
        return;
      }

      // Mark cadence step as sent
      await supabase
        .from('outreach_cadences')
        .update({ status: 'sent' })
        .eq('id', step.id);

      // Log to contact history
      await supabase.from('contact_history').insert({
        lead_id: step.lead_id,
        type: 'email',
        subject,
        body,
        outcome: 'Sent via cadence',
        contacted_at: new Date().toISOString(),
      });

      toast.success(`Email sent for step #${step.step_number} — ${lead.address}`);
      setCadences((prev) => prev.filter((c) => c.id !== step.id));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send email.');
    } finally {
      setSendingCadence(null);
    }
  }

  function startNewTemplate() {
    setEditingTemplate(null);
    setTplName(''); setTplSubject(''); setTplBody(''); setTplCategory('outreach');
    setNewTemplate(true);
  }

  function startEditTemplate(tpl: EmailTemplate) {
    setNewTemplate(false);
    setEditingTemplate(tpl);
    setTplName(tpl.name); setTplSubject(tpl.subject); setTplBody(tpl.body); setTplCategory(tpl.category);
  }

  function cancelTemplateEdit() {
    setNewTemplate(false);
    setEditingTemplate(null);
  }

  async function saveTemplate() {
    if (!tplName.trim() || !tplSubject.trim() || !tplBody.trim()) return;
    setSavingTpl(true);
    try {
      if (editingTemplate) {
        await supabase.from('email_templates').update({
          name: tplName, subject: tplSubject, body: tplBody, category: tplCategory,
          updated_at: new Date().toISOString(),
        }).eq('id', editingTemplate.id);
      } else {
        await supabase.from('email_templates').insert({
          id: crypto.randomUUID(),
          name: tplName, subject: tplSubject, body: tplBody, category: tplCategory,
        });
      }
      cancelTemplateEdit();
      await loadData();
    } finally {
      setSavingTpl(false);
    }
  }

  async function deleteTemplate(id: string) {
    await supabase.from('email_templates').delete().eq('id', id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  async function toggleReminder(rem: Reminder) {
    await supabase.from('lead_reminders').update({ completed: true }).eq('id', rem.id);
    setReminders((prev) => prev.filter((r) => r.id !== rem.id));
  }

  const today = new Date().toISOString().split('T')[0];
  const overdueReminders = reminders.filter((r) => r.due_date < today);
  const upcomingReminders = reminders.filter((r) => r.due_date >= today);

  const sections = [
    { key: 'templates' as const, label: 'Email Templates', icon: <Mail size={14} />, count: templates.length },
    { key: 'reminders' as const, label: 'Next-Action Reminders', icon: <Bell size={14} />, count: reminders.length },
    { key: 'cadence' as const, label: 'Outreach Cadence', icon: <Calendar size={14} />, count: cadences.length },
  ];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Section tabs */}
      <div className="flex border-b border-border bg-muted/30">
        {sections.map((s) => (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-medium transition-colors border-b-2 ${activeSection === s.key ? 'border-primary text-primary bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {s.icon}{s.label}
            {s.count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">{s.count}</span>}
          </button>
        ))}
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* ── EMAIL TEMPLATES ── */}
            {activeSection === 'templates' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Manage reusable email templates. Use <code className="bg-muted px-1 rounded text-[10px]">{'{{address}}'}</code>, <code className="bg-muted px-1 rounded text-[10px]">{'{{contactName}}'}</code>, <code className="bg-muted px-1 rounded text-[10px]">{'{{price}}'}</code> as placeholders.</p>
                  <button onClick={startNewTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shrink-0">
                    <Plus size={12} />New Template
                  </button>
                </div>

                {/* New / Edit form */}
                {(newTemplate || editingTemplate) && (
                  <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-foreground">{editingTemplate ? 'Edit Template' : 'New Template'}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name"
                        className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                      <select value={tplCategory} onChange={(e) => setTplCategory(e.target.value)}
                        className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary">
                        <option value="outreach">Outreach</option>
                        <option value="follow_up">Follow-Up</option>
                        <option value="proposal">Proposal</option>
                        <option value="closing">Closing</option>
                      </select>
                    </div>
                    <input value={tplSubject} onChange={(e) => setTplSubject(e.target.value)} placeholder="Email subject"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                    <textarea value={tplBody} onChange={(e) => setTplBody(e.target.value)} placeholder="Email body..." rows={6}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none font-mono text-xs" />
                    <div className="flex gap-2">
                      <button onClick={saveTemplate} disabled={savingTpl}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all">
                        <Save size={13} />{savingTpl ? 'Saving...' : 'Save Template'}
                      </button>
                      <button onClick={cancelTemplateEdit}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-all">
                        <X size={13} />Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Template list */}
                <div className="space-y-2">
                  {templates.map((tpl) => (
                    <div key={tpl.id} className="bg-background border border-border rounded-xl p-4 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${categoryColors[tpl.category] || 'bg-muted text-muted-foreground'}`}>
                            {tpl.category.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{tpl.subject}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEditTemplate(tpl)}
                          className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-all">
                          <Edit3 size={13} />
                        </button>
                        <button onClick={() => deleteTemplate(tpl.id)}
                          className="p-1.5 rounded text-muted-foreground hover:text-danger hover:bg-danger-bg transition-all">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {templates.length === 0 && !newTemplate && (
                    <p className="text-center py-8 text-sm text-muted-foreground">No templates yet. Create your first one above.</p>
                  )}
                </div>
              </div>
            )}

            {/* ── REMINDERS ── */}
            {activeSection === 'reminders' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">All pending next-action reminders across your pipeline. Open a lead to add new reminders.</p>

                {overdueReminders.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={13} className="text-danger" />
                      <h4 className="text-xs font-semibold text-danger uppercase tracking-wide">Overdue ({overdueReminders.length})</h4>
                    </div>
                    {overdueReminders.map((rem) => (
                      <div key={rem.id} className="bg-danger-bg border border-danger/20 rounded-xl p-3 flex items-center gap-3">
                        <button onClick={() => toggleReminder(rem)}
                          className="w-5 h-5 rounded-full border-2 border-danger flex items-center justify-center shrink-0 hover:bg-danger/10 transition-colors">
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{rem.title}</p>
                          <p className="text-[10px] text-danger mt-0.5">Due: {rem.due_date} · <span className={`capitalize font-medium ${priorityColors[rem.priority]}`}>{rem.priority}</span></p>
                        </div>
                        <CheckCircle size={14} className="text-muted-foreground hover:text-success cursor-pointer transition-colors" onClick={() => toggleReminder(rem)} />
                      </div>
                    ))}
                  </div>
                )}

                {upcomingReminders.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="text-muted-foreground" />
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Upcoming ({upcomingReminders.length})</h4>
                    </div>
                    {upcomingReminders.map((rem) => (
                      <div key={rem.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                        <button onClick={() => toggleReminder(rem)}
                          className="w-5 h-5 rounded-full border-2 border-border flex items-center justify-center shrink-0 hover:border-success hover:bg-success/10 transition-colors">
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{rem.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Due: {rem.due_date} · <span className={`capitalize font-medium ${priorityColors[rem.priority]}`}>{rem.priority}</span></p>
                        </div>
                        <CheckCircle size={14} className="text-muted-foreground hover:text-success cursor-pointer transition-colors" onClick={() => toggleReminder(rem)} />
                      </div>
                    ))}
                  </div>
                )}

                {reminders.length === 0 && (
                  <p className="text-center py-8 text-sm text-muted-foreground">No pending reminders. Open a lead to add next-action reminders.</p>
                )}
              </div>
            )}

            {/* ── CADENCE ── */}
            {activeSection === 'cadence' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">All pending outreach steps across your pipeline. Click <strong>Send Now</strong> to dispatch via Resend email. Open a lead to schedule new steps.</p>
                {cadences.length === 0 ? (
                  <p className="text-center py-8 text-sm text-muted-foreground">No pending outreach steps. Open a lead to schedule outreach.</p>
                ) : (
                  <div className="space-y-2">
                    {cadences.map((step) => (
                      <div key={step.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-muted-foreground">{step.step_number}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground capitalize">{step.channel} outreach</p>
                          <p className="text-[10px] text-muted-foreground">Scheduled: {step.scheduled_at}</p>
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${step.scheduled_at < today ? 'bg-danger-bg text-danger' : 'bg-muted text-muted-foreground'}`}>
                          {step.scheduled_at < today ? 'Overdue' : 'Pending'}
                        </span>
                        {step.channel === 'email' && (
                          <button
                            onClick={() => sendCadenceEmail(step)}
                            disabled={sendingCadence === step.id}
                            title="Send email now via Resend"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-50 transition-all shrink-0"
                          >
                            {sendingCadence === step.id ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <Send size={11} />
                            )}
                            Send Now
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
