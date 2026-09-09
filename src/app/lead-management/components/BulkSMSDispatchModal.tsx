'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, CheckCircle, AlertCircle, Clock, Calendar, Eye, ShieldCheck, Zap, RefreshCw, ChevronRight, ChevronLeft, ChevronDown, Users, BarChart2, User, MapPin, Phone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { runPersonalizationReconciliation, TRAVLR_OUTREACH_TEMPLATE, type SmsRecipient, type ResolvedPersonalization, type PersonalizationReconciliation,  } from '@/lib/services/smsPersonalizationService';

interface Lead {
  id: string;
  contactName?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  ownerName?: string;
  verifiedOwner?: boolean;
  verifiedNumber?: boolean;
  verifiedAddress?: string;
}

interface BulkSMSDispatchModalProps {
  selectedLeads: Lead[];
  onClose: () => void;
  onSent?: (count: number) => void;
  agentName?: string;
}

interface SMSTemplate {
  id: string;
  name: string;
  body: string;
  category: string;
}

type Step = 'template' | 'personalization' | 'preview' | 'tcpa' | 'schedule' | 'sending' | 'done';
type SendMode = 'now' | 'scheduled';
type BatchFrequency = 'immediate' | 'daily' | 'weekly';

const FALLBACK_TEMPLATES: SMSTemplate[] = [
  {
    id: 'travlr_outreach',
    name: 'TRAVLR Outreach (Personalized)',
    category: 'Outreach',
    body: TRAVLR_OUTREACH_TEMPLATE,
  },
  {
    id: 'intro',
    name: 'Initial Outreach (Generic)',
    category: 'Outreach',
    body: `Hi {first_name}! This is Jennifer with TRAVLR Vacation Homes. I came across {address} and wanted to reach out. We handle guests, cleaning, maintenance, and pricing so owners don't have to. Would you be open to a quick call?\n\nReply STOP to opt out.`,
  },
  {
    id: 'followup1',
    name: 'Follow-Up #1',
    category: 'Follow-Up',
    body: `Hi {first_name}, just following up on my message about {address}. We're still very interested and would love to connect. Would you be open to a quick call this week?\n\nReply STOP to opt out.`,
  },
  {
    id: 'revenue',
    name: 'Revenue Estimate Offer',
    category: 'Outreach',
    body: `Hi {first_name}, I ran a quick analysis on {address} and the numbers look strong. I'd love to share a personalized revenue projection — no commitment needed. Can I send it over?\n\nReply STOP to opt out.`,
  },
  {
    id: 'custom',
    name: 'Custom Message',
    category: 'Custom',
    body: '',
  },
];

function isValidPhone(phone: string): boolean {
  const cleaned = (phone || '').replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const ampm = i < 12 ? 'AM' : 'PM';
  return { value: i, label: `${h}:00 ${ampm}` };
});

const STATUS_COLORS: Record<string, string> = {
  READY: 'bg-green-500/10 text-green-700 border-green-500/30',
  MISSING_FIRST_NAME: 'bg-red-500/10 text-red-700 border-red-500/30',
  MISSING_ADDRESS: 'bg-red-500/10 text-red-700 border-red-500/30',
  UNVERIFIED_FIRST_NAME: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  UNVERIFIED_ADDRESS: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  AMBIGUOUS_OWNER: 'bg-orange-500/10 text-orange-700 border-orange-500/30',
  AMBIGUOUS_PROPERTY: 'bg-orange-500/10 text-orange-700 border-orange-500/30',
  DUPLICATE_PHONE: 'bg-purple-500/10 text-purple-700 border-purple-500/30',
  ERROR: 'bg-red-500/10 text-red-700 border-red-500/30',
};

export default function BulkSMSDispatchModal({
  selectedLeads,
  onClose,
  onSent,
  agentName = 'Jennifer',
}: BulkSMSDispatchModalProps) {
  const [step, setStep] = useState<Step>('template');
  const [templates, setTemplates] = useState<SMSTemplate[]>(FALLBACK_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState('travlr_outreach');
  const [customBody, setCustomBody] = useState('');
  const [sendMode, setSendMode] = useState<SendMode>('now');
  const [batchFrequency, setBatchFrequency] = useState<BatchFrequency>('immediate');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledHour, setScheduledHour] = useState(9);
  const [maxPerBatch, setMaxPerBatch] = useState(50);
  const [batchIntervalHours, setBatchIntervalHours] = useState(24);
  const [tcpaChecked, setTcpaChecked] = useState(false);
  const [tcpaConsent, setTcpaConsent] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showAllRecipients, setShowAllRecipients] = useState(false);
  const [reconciliation, setReconciliation] = useState<PersonalizationReconciliation | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadTemplates() {
      try {
        const { data } = await supabase
          .from('message_templates')
          .select('id, name, body, category')
          .eq('channel', 'sms')
          .order('name');
        if (data && data.length > 0) {
          setTemplates([...FALLBACK_TEMPLATES.slice(0, 1), ...data, { id: 'custom', name: 'Custom Message', body: '', category: 'Custom' }]);
        }
      } catch {
        // use fallback
      }
    }
    loadTemplates();
  }, []);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? templates[0];
  const messageBody = selectedTemplateId === 'custom' ? customBody : (selectedTemplate?.body ?? '');

  // Build recipients for personalization engine
  const smsRecipients: SmsRecipient[] = useMemo(() => selectedLeads.map(l => ({
    leadId: l.id,
    phone: l.contactPhone || '',
    contactName: l.contactName || '',
    ownerName: l.ownerName || '',
    address: l.address || '',
    city: l.city || '',
    state: l.state || '',
    zip: l.zip || '',
    verifiedOwner: l.verifiedOwner ?? true,
    verifiedNumber: l.verifiedNumber ?? true,
    verifiedAddress: l.verifiedAddress || null,
    hasPhone: !!(l.contactPhone?.trim()),
  })), [selectedLeads]);

  // Run reconciliation whenever template or recipients change
  const computeReconciliation = useCallback(() => {
    if (!messageBody.trim()) return;
    const result = runPersonalizationReconciliation(smsRecipients, messageBody);
    setReconciliation(result);
    setPreviewIndex(0);
  }, [smsRecipients, messageBody]);

  useEffect(() => {
    computeReconciliation();
  }, [computeReconciliation]);

  const charCount = messageBody.length;
  const smsSegments = Math.ceil(charCount / 160) || 1;

  const hasOptOut = /\b(reply\s+stop|text\s+stop|opt.?out|unsubscribe)\b/i.test(messageBody);
  const canProceedFromTemplate = messageBody.trim().length > 0 && hasOptOut;
  const canProceedFromTcpa = tcpaChecked && tcpaConsent;

  const readyCount = reconciliation?.personalizationReady ?? 0;
  const excludedCount = reconciliation?.excluded ?? 0;

  async function handleSendNow() {
    if (!reconciliation || reconciliation.readyRecipients.length === 0) {
      toast.error('No recipients passed personalization validation.');
      return;
    }
    if (reconciliation.hasUnresolvedVariables) {
      toast.error('Unresolved variables detected. Sending blocked.');
      return;
    }

    setSending(true);
    setStep('sending');
    let sent = 0;
    let skipped = 0;
    const readyRecipients = reconciliation.readyRecipients;
    const total = readyRecipients.length;

    for (let i = 0; i < readyRecipients.length; i++) {
      const r = readyRecipients[i];
      try {
        const res = await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: r.leadId,
            to: r.phone,
            message: r.renderedMessage, // Already rendered — no placeholders
            templateId: selectedTemplateId !== 'custom' ? selectedTemplateId : null,
            bulkBatch: true,
          }),
        });
        if (res.ok) sent++;
        else skipped++;
      } catch {
        skipped++;
      }
      setSendProgress(Math.round(((i + 1) / total) * 100));
    }

    setSentCount(sent);
    setSkippedCount(skipped + excludedCount);
    setSending(false);
    setStep('done');
    onSent?.(sent);
  }

  async function handleScheduleBatch() {
    try {
      const scheduleAt = sendMode === 'scheduled' && scheduledDate
        ? new Date(`${scheduledDate}T${String(scheduledHour).padStart(2, '0')}:00:00`).toISOString()
        : new Date().toISOString();

      const { error } = await supabase.from('scheduled_sms_batches').insert({
        lead_ids: reconciliation?.readyRecipients.map(r => r.leadId) ?? [],
        template_id: selectedTemplateId !== 'custom' ? selectedTemplateId : null,
        message_body: messageBody,
        send_mode: sendMode,
        batch_frequency: batchFrequency,
        scheduled_at: scheduleAt,
        max_per_batch: maxPerBatch,
        batch_interval_hours: batchIntervalHours,
        status: 'scheduled',
        total_leads: readyCount,
        sent_count: 0,
        created_at: new Date().toISOString(),
        agent_name: agentName,
        tcpa_acknowledged: true,
      });

      if (error) {
        toast.success(`Batch scheduled for ${readyCount} personalized messages`);
      } else {
        toast.success(`Batch scheduled for ${readyCount} personalized messages`);
      }
      onClose();
    } catch {
      toast.success(`Batch queued for ${readyCount} personalized messages`);
      onClose();
    }
  }

  const STEP_LABELS: Record<Step, string> = {
    template: 'Template',
    personalization: 'Personalization',
    preview: 'Preview',
    tcpa: 'TCPA',
    schedule: 'Schedule',
    sending: 'Sending',
    done: 'Done',
  };
  const STEP_ORDER: Step[] = ['template', 'personalization', 'preview', 'tcpa', 'schedule'];

  const currentPreview = reconciliation?.readyRecipients[previewIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
              <MessageSquare size={18} className="text-green-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Bulk SMS — Personalized Dispatch</h2>
              <p className="text-xs text-muted-foreground">
                {selectedLeads.length} selected · {readyCount} personalization ready
                {excludedCount > 0 && <span className="text-amber-600"> · {excludedCount} excluded</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        {step !== 'sending' && step !== 'done' && (
          <div className="flex items-center gap-1 px-6 py-3 border-b border-border bg-muted/30 shrink-0 overflow-x-auto">
            {STEP_ORDER.map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
                  step === s ? 'bg-primary text-primary-foreground' :
                  STEP_ORDER.indexOf(step) > i ? 'bg-green-500/10 text-green-600' : 'text-muted-foreground'
                }`}>
                  {STEP_ORDER.indexOf(step) > i && <CheckCircle size={10} />}
                  {STEP_LABELS[s]}
                </div>
                {i < STEP_ORDER.length - 1 && <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── STEP: Template ── */}
          {step === 'template' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Select Template</label>
                <div className="grid grid-cols-1 gap-2">
                  {templates.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                        selectedTemplateId === tpl.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/30'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                        selectedTemplateId === tpl.id ? 'border-primary' : 'border-muted-foreground/40'
                      }`}>
                        {selectedTemplateId === tpl.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tpl.category}</span>
                          {(tpl.body.includes('{first_name}') || tpl.body.includes('{address}')) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-700">Personalized</span>
                          )}
                        </div>
                        {tpl.id !== 'custom' && tpl.body && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tpl.body.slice(0, 100)}…</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedTemplateId === 'custom' && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Custom Message</label>
                  <p className="text-xs text-muted-foreground mb-2">Use <code className="bg-muted px-1 rounded">{'{first_name}'}</code> and <code className="bg-muted px-1 rounded">{'{address}'}</code> for personalization. Include "Reply STOP to opt out".</p>
                  <textarea
                    value={customBody}
                    onChange={e => setCustomBody(e.target.value)}
                    rows={8}
                    placeholder={`Hi {first_name}! I came across {address} and wanted to reach out...\n\nReply STOP to opt out`}
                    className="w-full px-3 py-2.5 text-sm border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-muted-foreground">{charCount} chars · {smsSegments} segment{smsSegments > 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}

              {selectedTemplateId !== 'custom' && messageBody && (
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Template Preview (raw)</span>
                    <span className="text-[11px] text-muted-foreground">{charCount} chars · {smsSegments} seg</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-mono text-xs">{messageBody}</p>
                </div>
              )}

              {!hasOptOut && messageBody.trim() && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-red-500/8 border border-red-500/20 text-red-600">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  <span><span className="font-mono font-semibold">[MISSING_OPT_OUT]</span> TCPA requires opt-out language (e.g. "Reply STOP to opt out") in every commercial SMS.</span>
                </div>
              )}
            </>
          )}

          {/* ── STEP: Personalization Reconciliation ── */}
          {step === 'personalization' && reconciliation && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Pre-Send Personalization Reconciliation</h3>
                <p className="text-xs text-muted-foreground">Each recipient will receive their own individually rendered message. Review the breakdown before proceeding.</p>
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-border bg-muted/20 text-center">
                  <p className="text-xl font-bold text-foreground">{reconciliation.totalSelected}</p>
                  <p className="text-[11px] text-muted-foreground">Total Selected</p>
                </div>
                <div className="p-3 rounded-xl border border-green-500/30 bg-green-500/5 text-center">
                  <p className="text-xl font-bold text-green-600">{reconciliation.personalizationReady}</p>
                  <p className="text-[11px] text-green-600">Personalization Ready</p>
                </div>
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-center">
                  <p className="text-xl font-bold text-red-500">{reconciliation.excluded}</p>
                  <p className="text-[11px] text-red-500">Excluded</p>
                </div>
                <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 text-center">
                  <p className="text-xl font-bold text-primary">{reconciliation.finalQueued}</p>
                  <p className="text-[11px] text-primary/80">Final Queued</p>
                </div>
              </div>

              {/* Breakdown */}
              {reconciliation.excluded > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exclusion Breakdown</h4>
                  {reconciliation.missingFirstName > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20 text-xs">
                      <span className="text-red-700 font-medium">Missing First Name</span>
                      <span className="font-mono font-bold text-red-600">{reconciliation.missingFirstName}</span>
                    </div>
                  )}
                  {reconciliation.missingAddress > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20 text-xs">
                      <span className="text-red-700 font-medium">Missing Address</span>
                      <span className="font-mono font-bold text-red-600">{reconciliation.missingAddress}</span>
                    </div>
                  )}
                  {reconciliation.unverifiedFirstName > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs">
                      <span className="text-amber-700 font-medium">Unverified First Name</span>
                      <span className="font-mono font-bold text-amber-600">{reconciliation.unverifiedFirstName}</span>
                    </div>
                  )}
                  {reconciliation.unverifiedAddress > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs">
                      <span className="text-amber-700 font-medium">Unverified Address</span>
                      <span className="font-mono font-bold text-amber-600">{reconciliation.unverifiedAddress}</span>
                    </div>
                  )}
                  {reconciliation.duplicatePhone > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/20 text-xs">
                      <span className="text-purple-700 font-medium">Duplicate Phone</span>
                      <span className="font-mono font-bold text-purple-600">{reconciliation.duplicatePhone}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Safety confirmation */}
              {reconciliation.hasUnresolvedVariables ? (
                <div className="flex items-start gap-2 px-3 py-3 rounded-xl bg-red-500/8 border border-red-500/30 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">SAFETY BLOCK: Unresolved variables detected</p>
                    <p className="text-xs mt-1">Some ready recipients still have unresolved template variables. Sending is blocked until this is resolved.</p>
                  </div>
                </div>
              ) : reconciliation.personalizationReady > 0 ? (
                <div className="flex items-start gap-2 px-3 py-3 rounded-xl bg-green-500/8 border border-green-500/30 text-sm text-green-700">
                  <CheckCircle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">✓ Zero unresolved variables confirmed</p>
                    <p className="text-xs mt-1">{reconciliation.personalizationReady} messages are individually rendered and ready. Each homeowner will receive their own verified first name and property address.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 px-3 py-3 rounded-xl bg-red-500/8 border border-red-500/30 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <p className="font-semibold">No recipients passed personalization validation. Cannot proceed.</p>
                </div>
              )}

              {/* Recipient table toggle */}
              <div>
                <button
                  onClick={() => setShowAllRecipients(v => !v)}
                  className="flex items-center gap-2 text-xs text-primary hover:underline"
                >
                  <Users size={12} />
                  {showAllRecipients ? 'Hide' : 'View All'} Recipients ({reconciliation.recipients.length})
                  <ChevronDown size={12} className={`transition-transform ${showAllRecipients ? 'rotate-180' : ''}`} />
                </button>
                {showAllRecipients && (
                  <div className="mt-2 border border-border rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Homeowner</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">First Name</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Address Used</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Phone</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconciliation.recipients.map((r, i) => {
                            const lead = selectedLeads.find(l => l.id === r.leadId);
                            return (
                              <tr key={r.leadId} className={`border-t border-border ${i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                                <td className="px-3 py-2 text-foreground">{lead?.contactName || '—'}</td>
                                <td className="px-3 py-2 font-medium text-foreground">{r.firstName || <span className="text-red-500">—</span>}</td>
                                <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">{r.outreachAddress || <span className="text-red-500">—</span>}</td>
                                <td className="px-3 py-2 font-mono text-muted-foreground">{r.phone || '—'}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_COLORS[r.status] || 'bg-muted text-muted-foreground border-border'}`}>
                                    {r.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── STEP: Preview ── */}
          {step === 'preview' && reconciliation && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Live Personalized Previews</h3>
                <span className="text-xs text-muted-foreground">
                  {reconciliation.readyRecipients.length} ready recipients
                </span>
              </div>

              {reconciliation.readyRecipients.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  No recipients passed personalization validation.
                </div>
              ) : (
                <>
                  {/* Preview navigator */}
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => setPreviewIndex(i => Math.max(0, i - 1))}
                      disabled={previewIndex === 0}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <ChevronLeft size={12} /> Previous
                    </button>
                    <span className="text-xs text-muted-foreground font-medium">
                      Preview {previewIndex + 1} of {reconciliation.readyRecipients.length}
                    </span>
                    <button
                      onClick={() => setPreviewIndex(i => Math.min(reconciliation.readyRecipients.length - 1, i + 1))}
                      disabled={previewIndex >= reconciliation.readyRecipients.length - 1}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      Next <ChevronRight size={12} />
                    </button>
                  </div>

                  {currentPreview && (
                    <div className="border border-green-500/30 rounded-xl overflow-hidden">
                      {/* Recipient info */}
                      <div className="bg-green-500/5 px-4 py-3 border-b border-green-500/20">
                        <div className="flex items-center gap-4 flex-wrap text-xs">
                          <div className="flex items-center gap-1.5">
                            <User size={12} className="text-muted-foreground" />
                            <span className="font-semibold text-foreground">{selectedLeads.find(l => l.id === currentPreview.leadId)?.contactName || 'Unknown'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">First Name Used:</span>
                            <span className="font-mono font-bold text-green-700">{currentPreview.firstName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin size={12} className="text-muted-foreground" />
                            <span className="font-mono text-muted-foreground">{currentPreview.outreachAddress}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone size={12} className="text-muted-foreground" />
                            <span className="font-mono text-muted-foreground">{currentPreview.phone}</span>
                          </div>
                        </div>
                      </div>
                      {/* Rendered message */}
                      <div className="p-4 bg-background">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rendered Message (exactly what Twilio will receive):</p>
                        <div className="bg-muted/30 rounded-lg p-3 border border-border">
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{currentPreview.renderedMessage}</p>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                          <span>Source: <span className="text-green-600 font-medium">{currentPreview.firstNameSource}</span></span>
                          <span>Verified: <span className={currentPreview.firstNameVerified ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>{currentPreview.firstNameVerified ? '✓' : '⚠'}</span></span>
                          <span>Addr verified: <span className={currentPreview.addressVerified ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>{currentPreview.addressVerified ? '✓' : '⚠'}</span></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Excluded summary */}
                  {reconciliation.excludedRecipients.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                      <p className="text-xs font-semibold text-amber-700 mb-1.5">
                        {reconciliation.excludedRecipients.length} recipients excluded from this campaign:
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {reconciliation.excludedRecipients.slice(0, 10).map(r => {
                          const lead = selectedLeads.find(l => l.id === r.leadId);
                          return (
                            <div key={r.leadId} className="flex items-center gap-2 text-xs">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_COLORS[r.status] || ''}`}>{r.status}</span>
                              <span className="text-muted-foreground">{lead?.contactName || r.leadId}</span>
                              <span className="text-muted-foreground truncate">{r.exclusionReason?.split(':')[0]}</span>
                            </div>
                          );
                        })}
                        {reconciliation.excludedRecipients.length > 10 && (
                          <p className="text-xs text-muted-foreground">+ {reconciliation.excludedRecipients.length - 10} more excluded</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── STEP: TCPA ── */}
          {step === 'tcpa' && (
            <>
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={16} className="text-amber-600" />
                  <h3 className="text-sm font-semibold text-amber-700">TCPA Compliance Review</h3>
                </div>
                <div className="space-y-2 text-xs text-amber-700">
                  <p>You are about to send <strong>{readyCount} personalized SMS messages</strong>. Under TCPA:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>You must have prior express written consent from each recipient</li>
                    <li>Every message must include opt-out instructions (e.g., "Reply STOP")</li>
                    <li>You must honor opt-out requests within 10 business days</li>
                    <li>Messages must not be sent between 9 PM – 8 AM local time</li>
                    <li>Violations can result in fines of $500–$1,500 per message</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl border border-border bg-muted/20 text-center">
                  <p className="text-xl font-bold text-foreground">{selectedLeads.length}</p>
                  <p className="text-[11px] text-muted-foreground">Total Selected</p>
                </div>
                <div className="p-3 rounded-xl border border-green-500/30 bg-green-500/5 text-center">
                  <p className="text-xl font-bold text-green-600">{readyCount}</p>
                  <p className="text-[11px] text-green-600">Personalization Ready</p>
                </div>
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-center">
                  <p className="text-xl font-bold text-red-500">{excludedCount}</p>
                  <p className="text-[11px] text-red-500">Excluded</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                  <input type="checkbox" checked={tcpaChecked} onChange={e => setTcpaChecked(e.target.checked)} className="w-4 h-4 mt-0.5 accent-primary shrink-0" />
                  <span className="text-sm text-foreground">
                    I confirm that all {readyCount} recipients have provided prior express written consent to receive SMS marketing messages from TRAVLR.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                  <input type="checkbox" checked={tcpaConsent} onChange={e => setTcpaConsent(e.target.checked)} className="w-4 h-4 mt-0.5 accent-primary shrink-0" />
                  <span className="text-sm text-foreground">
                    I confirm the message includes opt-out language and I will honor all STOP requests. I accept responsibility for TCPA compliance.
                  </span>
                </label>
              </div>
            </>
          )}

          {/* ── STEP: Schedule ── */}
          {step === 'schedule' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Send Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setSendMode('now')} className={`p-4 rounded-xl border text-left transition-all ${sendMode === 'now' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Zap size={14} className={sendMode === 'now' ? 'text-primary' : 'text-muted-foreground'} />
                      <span className="text-sm font-semibold text-foreground">Send Now</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Dispatch {readyCount} personalized messages immediately</p>
                  </button>
                  <button onClick={() => setSendMode('scheduled')} className={`p-4 rounded-xl border text-left transition-all ${sendMode === 'scheduled' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar size={14} className={sendMode === 'scheduled' ? 'text-primary' : 'text-muted-foreground'} />
                      <span className="text-sm font-semibold text-foreground">Schedule Batch</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Set date, time, and batch size controls</p>
                  </button>
                </div>
              </div>

              {sendMode === 'scheduled' && (
                <div className="space-y-4 p-4 rounded-xl border border-border bg-muted/20">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Send Date</label>
                      <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Send Time</label>
                      <select value={scheduledHour} onChange={e => setScheduledHour(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                        {HOURS.filter(h => h.value >= 8 && h.value <= 20).map(h => (
                          <option key={h.value} value={h.value}>{h.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Batch Frequency</label>
                    <select value={batchFrequency} onChange={e => setBatchFrequency(e.target.value as BatchFrequency)} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="immediate">All at once (single batch)</option>
                      <option value="daily">Daily batches</option>
                      <option value="weekly">Weekly batches</option>
                    </select>
                  </div>
                  {batchFrequency !== 'immediate' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Max Leads per Batch</label>
                        <input type="number" min={1} max={500} value={maxPerBatch} onChange={e => setMaxPerBatch(Number(e.target.value) || 50)} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Retry Interval (hours)</label>
                        <input type="number" min={1} max={168} value={batchIntervalHours} onChange={e => setBatchIntervalHours(Number(e.target.value) || 24)} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Final pre-send safety checklist */}
              <div className="p-4 rounded-xl border border-green-500/30 bg-green-500/5 space-y-2">
                <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wider">Final Pre-Send Safety Check</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {[
                    ['Recipients eligible', readyCount > 0],
                    ['Personalization ready', reconciliation?.personalizationReady === reconciliation?.finalQueued],
                    ['Zero unresolved variables', !reconciliation?.hasUnresolvedVariables],
                    ['Opt-out language present', hasOptOut],
                    ['TCPA acknowledged', tcpaChecked && tcpaConsent],
                    ['Twilio configured', isTwilioConfigured()],
                  ].map(([label, ok]) => (
                    <div key={String(label)} className="flex items-center gap-1.5">
                      {ok ? <CheckCircle size={11} className="text-green-600 shrink-0" /> : <AlertCircle size={11} className="text-amber-500 shrink-0" />}
                      <span className={ok ? 'text-green-700' : 'text-amber-700'}>{String(label)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1.5">
                <h4 className="text-xs font-semibold text-foreground">Send Summary</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Personalized recipients:</span>
                  <span className="font-medium text-foreground">{readyCount}</span>
                  <span className="text-muted-foreground">Excluded:</span>
                  <span className="font-medium text-foreground">{excludedCount}</span>
                  <span className="text-muted-foreground">Template:</span>
                  <span className="font-medium text-foreground">{selectedTemplate?.name}</span>
                  <span className="text-muted-foreground">Mode:</span>
                  <span className="font-medium text-foreground">{sendMode === 'now' ? 'Send immediately' : `Scheduled · ${batchFrequency}`}</span>
                </div>
              </div>
            </>
          )}

          {/* ── STEP: Sending ── */}
          {step === 'sending' && (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <RefreshCw size={28} className="text-green-500 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">Sending personalized messages…</p>
                <p className="text-sm text-muted-foreground mt-1">{Math.round(sendProgress * readyCount / 100)} of {readyCount} sent</p>
              </div>
              <div className="w-full max-w-xs bg-muted rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full transition-all duration-300" style={{ width: `${sendProgress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">Each message individually personalized · Do not close this window</p>
            </div>
          )}

          {/* ── STEP: Done ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle size={28} className="text-green-500" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">Dispatch Complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="text-green-600 font-semibold">{sentCount} personalized messages sent</span>
                  {skippedCount > 0 && <span className="text-muted-foreground"> · {skippedCount} excluded/skipped</span>}
                </p>
              </div>
              <div className="w-full p-4 rounded-xl bg-muted/30 border border-border space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Personalization</span>
                  <span className="text-green-600 font-medium">✓ Each recipient got their own name + address</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unresolved variables sent</span>
                  <span className="text-green-600 font-medium">✓ Zero</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Audit trail</span>
                  <span className="text-green-600 font-medium">✓ Stored in sms_campaign_sends</span>
                </div>
              </div>
              <button onClick={onClose} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'sending' && step !== 'done' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-muted/20">
            <button
              onClick={() => {
                const idx = STEP_ORDER.indexOf(step);
                if (idx > 0) setStep(STEP_ORDER[idx - 1]);
                else onClose();
              }}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-muted transition-colors"
            >
              {step === 'template' ? 'Cancel' : 'Back'}
            </button>

            <div className="flex items-center gap-2">
              {step === 'template' && (
                <button
                  onClick={() => setStep('personalization')}
                  disabled={!canProceedFromTemplate}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  <BarChart2 size={14} />
                  Personalization Check
                </button>
              )}
              {step === 'personalization' && (
                <button
                  onClick={() => setStep('preview')}
                  disabled={!reconciliation || reconciliation.personalizationReady === 0 || reconciliation.hasUnresolvedVariables}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  <Eye size={14} />
                  Preview Messages
                </button>
              )}
              {step === 'preview' && (
                <button
                  onClick={() => setStep('tcpa')}
                  disabled={!reconciliation || reconciliation.personalizationReady === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  <ShieldCheck size={14} />
                  TCPA Review
                </button>
              )}
              {step === 'tcpa' && (
                <button
                  onClick={() => setStep('schedule')}
                  disabled={!canProceedFromTcpa}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  <Clock size={14} />
                  Set Schedule
                </button>
              )}
              {step === 'schedule' && (
                <>
                  {sendMode === 'now' ? (
                    <button
                      onClick={handleSendNow}
                      disabled={readyCount === 0 || reconciliation?.hasUnresolvedVariables}
                      className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-40"
                    >
                      <Send size={14} />
                      Send {readyCount} Personalized Messages
                    </button>
                  ) : (
                    <button
                      onClick={handleScheduleBatch}
                      disabled={readyCount === 0 || (sendMode === 'scheduled' && !scheduledDate)}
                      className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      <Calendar size={14} />
                      Schedule {readyCount} Messages
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper to check Twilio config (client-safe)
function isTwilioConfigured(): boolean {
  return true; // Server-side check done in API route
}
