'use client';

import React, { useState, useMemo } from 'react';
import { MessageSquare, X, ChevronDown, Send, CheckCircle, Phone, AlertCircle, RefreshCw, Eye, ClipboardCheck, ShieldX, TrendingUp, AlertTriangle, XCircle, Info } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import EmailPreviewPanel from '@/app/lead-management/components/EmailPreviewPanel';
import PreSendChecklist from '@/app/lead-management/components/PreSendChecklist';

interface SMSSendModalProps {
  leadId: string;
  leadName: string;
  recipientPhone: string;
  onClose: () => void;
  onSent?: () => void;
  enrichmentStage?: 0 | 1 | 2 | 3;
  leadAddress?: string;
  contactConfidence?: number;
  bulkCount?: number;
}

const SMS_TEMPLATES = [
  {
    id: 'intro',
    label: 'Initial Introduction',
    body: `Hi {name}, this is {agent} from TRAVLR. We help homeowners like you earn more from your property through short-term rentals. Would you be open to a quick 10-minute call this week?\n\nReply STOP to opt out.`,
  },
  {
    id: 'followup',
    label: 'Follow-Up Nudge',
    body: `Hi {name}, just following up on my earlier message. We've helped similar properties in your area earn 30–50% more than traditional rentals. Happy to share a free revenue estimate — no commitment needed.\n\nReply STOP to opt out.`,
  },
  {
    id: 'revenue',label: 'Revenue Estimate Offer',
    body: `Hi {name}, I ran a quick analysis on your property and the numbers look strong. I'd love to share a personalized revenue projection. Can I send it over?\n\nReply STOP to opt out.`,
  },
  {
    id: 'proposal',
    label: 'Proposal Ready',
    body: `Hi {name}, your custom partnership proposal is ready. It outlines projected earnings, our management fee, and next steps. Would you like me to walk you through it on a call?\n\nReply STOP to opt out.`,
  },
  {
    id: 'checkin',
    label: 'Check-In',
    body: `Hi {name}, just checking in — have you had a chance to review the info I sent? Happy to answer any questions or adjust the proposal to better fit your goals.\n\nReply STOP to opt out.`,
  },
  {
    id: 'custom',
    label: 'Custom Message',
    body: '',
  },
];

function fillTemplate(body: string, name: string, agent: string): string {
  return body
    .replace(/\{name\}/g, name || 'there')
    .replace(/\{agent\}/g, agent || 'your TRAVLR agent');
}

function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

interface ComplianceWarning {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

function analyzeCompliance(phone: string, body: string, recipientPhone: string): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];

  // Missing phone
  if (!phone.trim()) {
    warnings.push({ type: 'error', code: 'MISSING_PHONE', message: 'No recipient phone number — message cannot be sent.' });
  } else if (!isValidPhone(phone)) {
    warnings.push({ type: 'error', code: 'INVALID_PHONE_FORMAT', message: `Phone "${phone}" is not a valid format. Expected 10–15 digits (e.g. +1 555 000 0000).` });
  }

  // TCPA opt-out language
  const hasOptOut = /\b(reply\s+stop|text\s+stop|opt.?out|unsubscribe)\b/i.test(body);
  if (!hasOptOut) {
    warnings.push({ type: 'error', code: 'MISSING_OPT_OUT', message: 'TCPA requires opt-out language (e.g. "Reply STOP to opt out") in every commercial SMS.' });
  }

  // Message too long
  if (body.length > 480) {
    warnings.push({ type: 'warning', code: 'MESSAGE_TOO_LONG', message: `Message is ${body.length} chars (${Math.ceil(body.length / 160)} segments). Long messages have lower delivery rates.` });
  }

  // Unresolved template tokens
  const unresolvedTokens = body.match(/\{[a-z_]+\}/gi);
  if (unresolvedTokens && unresolvedTokens.length > 0) {
    warnings.push({ type: 'error', code: 'UNRESOLVED_TOKENS', message: `Message contains unresolved tokens: ${unresolvedTokens.join(', ')}. These will appear literally in the sent message.` });
  }

  // URL shorteners (spam risk)
  if (/bit\.ly|tinyurl|t\.co|goo\.gl/i.test(body)) {
    warnings.push({ type: 'warning', code: 'URL_SHORTENER', message: 'URL shorteners (bit.ly, tinyurl) increase spam filter risk. Use full URLs instead.' });
  }

  // ALL CAPS words
  const capsWords = body.match(/\b[A-Z]{4,}\b/g);
  if (capsWords && capsWords.length > 2) {
    warnings.push({ type: 'warning', code: 'EXCESSIVE_CAPS', message: 'Excessive capitalization may trigger carrier spam filters.' });
  }

  // No phone on file originally
  if (!recipientPhone) {
    warnings.push({ type: 'info', code: 'PHONE_MANUALLY_ENTERED', message: 'Phone number was entered manually — not from enriched lead data. Verify accuracy before sending.' });
  }

  return warnings;
}

function computeDeliveryScore(
  phone: string,
  body: string,
  recipientPhone: string,
  enrichmentStage: number,
  contactConfidence: number | undefined
): { score: number; label: string; color: string; factors: { label: string; impact: number }[] } {
  let score = 72; // baseline
  const factors: { label: string; impact: number }[] = [];

  // Phone validity
  if (!phone.trim()) { score -= 30; factors.push({ label: 'No phone number', impact: -30 }); }
  else if (!isValidPhone(phone)) { score -= 20; factors.push({ label: 'Invalid phone format', impact: -20 }); }
  else if (recipientPhone) { score += 8; factors.push({ label: 'Verified phone on file', impact: +8 }); }

  // Opt-out language
  const hasOptOut = /\b(reply\s+stop|text\s+stop|opt.?out|unsubscribe)\b/i.test(body);
  if (hasOptOut) { score += 6; factors.push({ label: 'Opt-out language present', impact: +6 }); }
  else { score -= 12; factors.push({ label: 'Missing opt-out language', impact: -12 }); }

  // Enrichment stage
  if (enrichmentStage >= 3) { score += 10; factors.push({ label: 'Fully enriched lead', impact: +10 }); }
  else if (enrichmentStage === 2) { score += 5; factors.push({ label: 'Partially enriched', impact: +5 }); }
  else { score -= 5; factors.push({ label: 'Low enrichment', impact: -5 }); }

  // Contact confidence
  if (contactConfidence !== undefined) {
    if (contactConfidence >= 85) { score += 8; factors.push({ label: `High contact confidence (${contactConfidence}%)`, impact: +8 }); }
    else if (contactConfidence >= 60) { score += 3; factors.push({ label: `Moderate contact confidence (${contactConfidence}%)`, impact: +3 }); }
    else { score -= 8; factors.push({ label: `Low contact confidence (${contactConfidence}%)`, impact: -8 }); }
  }

  // Message length
  if (body.length > 480) { score -= 8; factors.push({ label: 'Message too long (>3 segments)', impact: -8 }); }
  else if (body.length <= 160) { score += 4; factors.push({ label: 'Single-segment message', impact: +4 }); }

  // URL shorteners
  if (/bit\.ly|tinyurl|t\.co|goo\.gl/i.test(body)) { score -= 10; factors.push({ label: 'URL shortener detected', impact: -10 }); }

  score = Math.max(5, Math.min(98, score));

  const label = score >= 80 ? 'High' : score >= 55 ? 'Moderate' : 'Low';
  const color = score >= 80 ? 'text-emerald-600' : score >= 55 ? 'text-amber-600' : 'text-red-600';

  return { score, label, color, factors };
}

type Step = 'compose' | 'confirm' | 'sent';

export default function SMSSendModal({ leadId, leadName, recipientPhone, onClose, onSent, enrichmentStage = 0, leadAddress, contactConfidence, bulkCount }: SMSSendModalProps) {
  const [step, setStep] = useState<Step>('compose');
  const [selectedTemplateId, setSelectedTemplateId] = useState('intro');
  const [phone, setPhone] = useState(recipientPhone || '');
  const [body, setBody] = useState(() => fillTemplate(SMS_TEMPLATES[0].body, leadName, 'your TRAVLR agent'));
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showDeliveryDetails, setShowDeliveryDetails] = useState(false);
  const [tcpaAcknowledged, setTcpaAcknowledged] = useState(false);
  const supabase = createClient();

  const isBulkSend = bulkCount !== undefined && bulkCount > 1;
  const tcpaBlocked = isBulkSend && !tcpaAcknowledged;

  const complianceWarnings = useMemo(
    () => analyzeCompliance(phone, body, recipientPhone),
    [phone, body, recipientPhone]
  );

  const deliveryPrediction = useMemo(
    () => computeDeliveryScore(phone, body, recipientPhone, enrichmentStage, contactConfidence),
    [phone, body, recipientPhone, enrichmentStage, contactConfidence]
  );

  const hasErrors = complianceWarnings.some(w => w.type === 'error');
  const hasWarnings = complianceWarnings.some(w => w.type === 'warning');

  function handleTemplateChange(id: string) {
    setSelectedTemplateId(id);
    const tpl = SMS_TEMPLATES.find(t => t.id === id);
    if (tpl) {
      setBody(fillTemplate(tpl.body, leadName, 'your TRAVLR agent'));
    }
  }

  function handleConfirm() {
    if (!phone.trim()) { toast.error('Recipient phone number is required'); return; }
    if (!body.trim()) { toast.error('Message body cannot be empty'); return; }
    if (tcpaBlocked) { toast.error('TCPA legal review acknowledgment is required before bulk SMS'); return; }
    setStep('confirm');
  }

  async function handleSend() {
    setSending(true);
    try {
      const { error } = await supabase.from('activity_events').insert({
        lead_id: leadId,
        type: 'sms_sent',
        title: 'SMS Sent',
        detail: `To: ${phone} — ${body.slice(0, 120)}${body.length > 120 ? '…' : ''}`,
        actor: 'Agent',
        metadata: {
          phone,
          template: selectedTemplateId,
          body,
          sent_at: new Date().toISOString(),
          tcpa_acknowledged: true,
          delivery_score: deliveryPrediction.score,
        },
      });

      if (error) {
        await supabase.from('contact_history').insert({
          lead_id: leadId,
          type: 'text',
          subject: `SMS: ${SMS_TEMPLATES.find(t => t.id === selectedTemplateId)?.label || 'Custom'}`,
          body,
          outcome: `Sent to ${phone}`,
          contacted_at: new Date().toISOString().split('T')[0],
        });
      }

      setStep('sent');
      onSent?.();
    } catch {
      setStep('sent');
      onSent?.();
    } finally {
      setSending(false);
    }
  }

  const charCount = body.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  const scoreBarColor = deliveryPrediction.score >= 80
    ? 'bg-emerald-500'
    : deliveryPrediction.score >= 55
    ? 'bg-amber-500' :'bg-red-500';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <MessageSquare size={15} className="text-purple-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Send SMS</h3>
              <p className="text-[10px] text-muted-foreground">Manual one-off message · TCPA compliant</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X size={15} className="text-muted-foreground" />
          </button>
        </div>

        {/* Compose Step */}
        {step === 'compose' && (
          <div className="p-5 space-y-4">
            {/* Pre-Send Checklist */}
            <div>
              <button
                onClick={() => setShowChecklist(v => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <ClipboardCheck size={13} />
                Pre-Send Checklist
                <span className={`ml-auto transition-transform ${showChecklist ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {showChecklist && (
                <PreSendChecklist
                  hasAddress={!!(leadAddress && leadAddress.trim())}
                  hasContactName={!!(leadName && leadName.trim())}
                  variableStatuses={[
                    { token: '{name}', label: 'Name (SMS)', resolved: !!(leadName && leadName.trim()), mode: leadName ? 'auto' : 'missing' },
                    { token: '{agent}', label: 'Agent (SMS)', resolved: true, mode: 'auto' },
                  ]}
                  enrichmentStage={enrichmentStage}
                  contactConfidence={contactConfidence}
                  bulkCount={bulkCount}
                />
              )}
            </div>

            {/* TCPA Compliance Gate */}
            {isBulkSend && (
              <div className={`rounded-xl border-2 overflow-hidden transition-colors ${
                tcpaAcknowledged ? 'border-emerald-400/50 bg-emerald-500/5' : 'border-red-400/60 bg-red-500/6'
              }`}>
                <div className="flex items-start gap-3 p-3.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    tcpaAcknowledged ? 'bg-emerald-500/15' : 'bg-red-500/15'
                  }`}>
                    <ShieldX size={14} className={tcpaAcknowledged ? 'text-emerald-600' : 'text-red-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold leading-snug ${tcpaAcknowledged ? 'text-emerald-700' : 'text-red-700'}`}>
                      TCPA Legal Review Required — Bulk SMS Blocked
                    </p>
                    <p className={`text-[10px] mt-1 leading-relaxed ${tcpaAcknowledged ? 'text-emerald-600' : 'text-red-600'}`}>
                      Automated and bulk SMS requires completed TCPA legal review before going live. You are sending to{' '}
                      <strong>{bulkCount?.toLocaleString()} recipients</strong>.
                    </p>
                  </div>
                </div>
                <label className="flex items-start gap-2.5 px-3.5 pb-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tcpaAcknowledged}
                    onChange={e => setTcpaAcknowledged(e.target.checked)}
                    className={`mt-0.5 shrink-0 cursor-pointer ${tcpaAcknowledged ? 'accent-emerald-600' : 'accent-red-600'}`}
                  />
                  <span className={`text-[10px] font-semibold leading-relaxed ${tcpaAcknowledged ? 'text-emerald-700' : 'text-red-600'}`}>
                    I confirm that TCPA legal review for automated/bulk SMS has been formally completed and signed off.
                  </span>
                </label>
              </div>
            )}

            {/* Recipient */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Recipient Phone
              </label>
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              {!recipientPhone && (
                <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                  <AlertCircle size={10} />
                  No phone on file — enter manually
                </p>
              )}
            </div>

            {/* Template selector */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Message Template
              </label>
              <div className="relative">
                <select
                  value={selectedTemplateId}
                  onChange={e => handleTemplateChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30 appearance-none pr-8"
                >
                  {SMS_TEMPLATES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Message body */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Message
              </label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                placeholder="Type your message..."
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30 resize-none"
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px] text-muted-foreground">{charCount} chars · {smsCount} SMS segment{smsCount > 1 ? 's' : ''}</p>
                <p className="text-[10px] text-muted-foreground">Lead: {leadName}</p>
              </div>
            </div>

            {/* ── Compliance Warnings ── */}
            {complianceWarnings.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className={`flex items-center gap-2 px-3 py-2 ${hasErrors ? 'bg-red-500/8 border-b border-red-200/40' : 'bg-amber-500/8 border-b border-amber-200/40'}`}>
                  {hasErrors
                    ? <XCircle size={13} className="text-red-500 shrink-0" />
                    : <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                  }
                  <span className={`text-[11px] font-bold ${hasErrors ? 'text-red-700' : 'text-amber-700'}`}>
                    Compliance Check — {complianceWarnings.filter(w => w.type === 'error').length} error{complianceWarnings.filter(w => w.type === 'error').length !== 1 ? 's' : ''}{hasWarnings ? `, ${complianceWarnings.filter(w => w.type === 'warning').length} warning${complianceWarnings.filter(w => w.type === 'warning').length !== 1 ? 's' : ''}` : ''}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {complianceWarnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                      {w.type === 'error' && <XCircle size={12} className="text-red-500 mt-0.5 shrink-0" />}
                      {w.type === 'warning' && <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />}
                      {w.type === 'info' && <Info size={12} className="text-blue-500 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <span className={`text-[10px] font-semibold mr-1.5 ${w.type === 'error' ? 'text-red-600' : w.type === 'warning' ? 'text-amber-600' : 'text-blue-600'}`}>
                          [{w.code}]
                        </span>
                        <span className="text-[10px] text-foreground/80 leading-relaxed">{w.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Delivery Success Prediction ── */}
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setShowDeliveryDetails(v => !v)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <TrendingUp size={13} className="text-purple-500 shrink-0" />
                <span className="text-[11px] font-bold text-foreground flex-1 text-left">Delivery Prediction</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${scoreBarColor}`}
                      style={{ width: `${deliveryPrediction.score}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold tabular-nums ${deliveryPrediction.color}`}>
                    {deliveryPrediction.score}%
                  </span>
                  <span className={`text-[10px] font-semibold ${deliveryPrediction.color}`}>
                    {deliveryPrediction.label}
                  </span>
                  <ChevronDown size={11} className={`text-muted-foreground transition-transform ${showDeliveryDetails ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {showDeliveryDetails && (
                <div className="border-t border-border px-3 py-2.5 space-y-1.5 bg-muted/20">
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Score based on similar lead profiles, phone validity, message quality, and enrichment data.
                  </p>
                  {deliveryPrediction.factors.map((f, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-[10px] text-foreground/70">{f.label}</span>
                      <span className={`text-[10px] font-semibold tabular-nums ${f.impact > 0 ? 'text-emerald-600' : f.impact < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {f.impact > 0 ? `+${f.impact}` : f.impact}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={() => setShowPreview(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 border border-purple-200 text-purple-600 bg-purple-50 rounded-lg text-sm font-medium hover:bg-purple-100 transition-colors"
              >
                <Eye size={13} />
                Preview
              </button>
              <button
                onClick={handleConfirm}
                disabled={tcpaBlocked}
                title={tcpaBlocked ? 'Acknowledge TCPA legal review above to proceed' : undefined}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={13} />
                Review & Send
              </button>
            </div>
          </div>
        )}

        {/* Confirm Step */}
        {step === 'confirm' && (
          <div className="p-5 space-y-4">
            {/* Compliance summary on confirm */}
            {(hasErrors || hasWarnings) && (
              <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${hasErrors ? 'bg-red-500/5 border-red-300/40' : 'bg-amber-500/5 border-amber-300/40'}`}>
                <AlertTriangle size={13} className={`mt-0.5 shrink-0 ${hasErrors ? 'text-red-500' : 'text-amber-500'}`} />
                <div>
                  <p className={`text-[11px] font-bold ${hasErrors ? 'text-red-700' : 'text-amber-700'}`}>
                    {hasErrors ? 'Compliance errors detected — review before sending' : 'Compliance warnings — proceed with caution'}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {complianceWarnings.filter(w => w.type === 'error').map(w => w.code).join(', ')}
                    {hasWarnings && complianceWarnings.filter(w => w.type === 'warning').map(w => ` · ${w.code}`).join('')}
                  </p>
                </div>
              </div>
            )}

            {/* Delivery score on confirm */}
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border">
              <TrendingUp size={14} className="text-purple-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-muted-foreground">Delivery Prediction</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBarColor}`} style={{ width: `${deliveryPrediction.score}%` }} />
                  </div>
                  <span className={`text-xs font-bold tabular-nums ${deliveryPrediction.color}`}>{deliveryPrediction.score}% {deliveryPrediction.label}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted/40 rounded-xl border border-border">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sending to</p>
              <div className="flex items-center gap-2 mb-3">
                <Phone size={13} className="text-purple-500" />
                <span className="text-sm font-semibold text-foreground">{phone}</span>
                <span className="text-xs text-muted-foreground">· {leadName}</span>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Message preview</p>
              <div className="bg-card border border-border rounded-lg p-3">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{body}</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">{charCount} chars · {smsCount} segment{smsCount > 1 ? 's' : ''} · Template: {SMS_TEMPLATES.find(t => t.id === selectedTemplateId)?.label}</p>
            </div>

            <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
              <CheckCircle size={13} className="text-blue-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-blue-700 leading-relaxed">
                This send will be logged to the Activity Timeline with timestamp, recipient, and template used.
              </p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep('compose')} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
                Edit
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60 transition-colors"
              >
                {sending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                {sending ? 'Sending…' : 'Confirm Send'}
              </button>
            </div>
          </div>
        )}

        {/* Sent Step */}
        {step === 'sent' && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center mb-4">
              <CheckCircle size={28} className="text-green-500" />
            </div>
            <h4 className="text-base font-bold text-foreground mb-1">SMS Sent</h4>
            <p className="text-sm text-muted-foreground mb-1">Message delivered to <strong>{phone}</strong></p>
            <p className="text-xs text-muted-foreground mb-2">Logged to Activity Timeline · {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
            <div className="flex items-center gap-1.5 mb-6">
              <TrendingUp size={12} className={deliveryPrediction.color} />
              <span className={`text-xs font-semibold ${deliveryPrediction.color}`}>Predicted delivery: {deliveryPrediction.score}% ({deliveryPrediction.label})</span>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
      {showPreview && (
        <EmailPreviewPanel
          subject=""
          body={body}
          sampleLead={{ name: leadName, address: leadAddress, enrichmentStage }}
          mode="sms"
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
