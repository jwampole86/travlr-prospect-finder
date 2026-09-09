'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FileText, User, Plus, Trash2, ChevronDown, AlertCircle, Send, Shield, X, Info, DollarSign, Home, Calendar, Loader2 } from 'lucide-react';
import type { Lead } from '@/data/mockLeads';
import type { PrefillData, SignerInfo } from '@/lib/services/docusignService';

interface SigningPortalProps {
  lead: Lead;
  onClose: () => void;
  onEnvelopeCreated: (sessionId: string, envelopeId: string) => void;
}

interface SignerForm {
  id: string;
  name: string;
  email: string;
}

const PAYOUT_OPTIONS = ['Monthly', 'Bi-Weekly'];
const DISPUTE_OPTIONS = ['Mediation', 'Arbitration', 'Litigation'];

export default function SigningPortal({ lead, onClose, onEnvelopeCreated }: SigningPortalProps) {
  const [step, setStep] = useState<'review' | 'signers' | 'confirm'>('review');
  const [signers, setSigners] = useState<SignerForm[]>([
    { id: '1', name: lead.contactName ?? '', email: lead.contactEmail ?? '' },
  ]);
  const [prefill, setPrefill] = useState<PrefillData>({
    homeownerName: lead.contactName ?? '',
    homeownerEmail: lead.contactEmail ?? '',
    homeownerPhone: lead.contactPhone ?? '',
    homeownerMailingAddress: lead.address ?? '',
    propertyAddress: lead.address ?? '',
    propertyType: lead.priceType === 'rent' ? 'Residential Rental' : 'Residential',
    beds: String(lead.beds ?? ''),
    baths: String(lead.baths ?? ''),
    portfolio: '',
    zone: lead.state ?? '',
    // Deal terms — must be entered by agent from Proposal stage
    managementFeePercent: '',
    termLengthMonths: '',
    renewalNoticePeriod: '60',
    onboardingTimeline: '30 days',
    maintenanceApprovalThreshold: '500',
    payoutSchedule: 'Monthly',
    personalUseNoticePeriod: '14',
    blackoutNightCap: '',
    terminationNoticeConvenience: '60',
    terminationNoticeCause: '30',
    postTerminationHonorWindow: '30',
    finalPayoutWindow: '30',
    listingRemovalWindow: '7',
    disputeResolutionMethod: 'Mediation',
    governingState: lead.state ?? '',
  });
  const [agentNotes, setAgentNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingTerms, setMissingTerms] = useState<string[]>([]);

  // Validate required deal terms
  useEffect(() => {
    const missing: string[] = [];
    if (!prefill.managementFeePercent) missing.push('Management Fee %');
    if (!prefill.termLengthMonths) missing.push('Term Length (months)');
    if (!prefill.payoutSchedule) missing.push('Payout Schedule');
    setMissingTerms(missing);
  }, [prefill.managementFeePercent, prefill.termLengthMonths, prefill.payoutSchedule]);

  function addSigner() {
    setSigners(prev => [...prev, { id: String(prev.length + 1), name: '', email: '' }]);
  }

  function removeSigner(id: string) {
    setSigners(prev => prev.filter(s => s.id !== id));
  }

  function updateSigner(id: string, field: 'name' | 'email', value: string) {
    setSigners(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  function updatePrefill(field: keyof PrefillData, value: string) {
    setPrefill(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const signerPayload: SignerInfo[] = signers.map((s, i) => ({
        name: s.name,
        email: s.email,
        clientUserId: `${lead.id}_signer_${s.id}_${Date.now()}`,
        recipientId: String(i + 1),
        order: i + 1,
      }));

      const res = await fetch('/api/docusign/create-envelope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          leadAddress: lead.address,
          leadState: lead.state,
          signers: signerPayload,
          prefill,
          agentNotes,
        }),
      });

      const data = await res.json() as { sessionId?: string; envelopeId?: string; error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Failed to create signing session');
      }

      onEnvelopeCreated(data.sessionId!, data.envelopeId!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const canProceedFromReview = missingTerms.length === 0;
  const canProceedFromSigners = signers.every(s => s.name.trim() && s.email.trim() && s.email.includes('@'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Initiate Partnership Agreement</h2>
              <p className="text-xs text-muted-foreground">{lead.address}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-all">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-border shrink-0">
          {(['review', 'signers', 'confirm'] as const).map((s, i) => (
            <React.Fragment key={s}>
              <button
                onClick={() => {
                  if (s === 'signers' && !canProceedFromReview) return;
                  if (s === 'confirm' && (!canProceedFromReview || !canProceedFromSigners)) return;
                  setStep(s);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  step === s
                    ? 'bg-primary text-white' :'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === s ? 'bg-white/20' : 'bg-muted'
                }`}>{i + 1}</span>
                {s === 'review' ? 'Pre-Fill Review' : s === 'signers' ? 'Signers' : 'Confirm & Send'}
              </button>
              {i < 2 && <div className="w-4 h-px bg-border mx-1" />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Step 1: Pre-Fill Review ── */}
          {step === 'review' && (
            <div className="space-y-5">
              {missingTerms.length > 0 && (
                <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-600">Deal terms required before sending</p>
                    <p className="text-xs text-amber-600/80 mt-0.5">
                      Fill in: {missingTerms.join(', ')}. These must come from the Proposal stage — never defaulted silently.
                    </p>
                  </div>
                </div>
              )}

              {/* Homeowner Info (auto-filled from lead) */}
              <Section icon={<User size={14} />} title="Homeowner Info" subtitle="Auto-filled from lead record">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Full Name" value={prefill.homeownerName ?? ''} onChange={v => updatePrefill('homeownerName', v)} />
                  <Field label="Email" value={prefill.homeownerEmail ?? ''} onChange={v => updatePrefill('homeownerEmail', v)} />
                  <Field label="Phone" value={prefill.homeownerPhone ?? ''} onChange={v => updatePrefill('homeownerPhone', v)} />
                  <Field label="Mailing Address" value={prefill.homeownerMailingAddress ?? ''} onChange={v => updatePrefill('homeownerMailingAddress', v)} />
                </div>
              </Section>

              {/* Property Info */}
              <Section icon={<Home size={14} />} title="Property" subtitle="Auto-filled from lead record">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Property Address" value={prefill.propertyAddress ?? ''} onChange={v => updatePrefill('propertyAddress', v)} />
                  <Field label="Property Type" value={prefill.propertyType ?? ''} onChange={v => updatePrefill('propertyType', v)} />
                  <Field label="Beds" value={prefill.beds ?? ''} onChange={v => updatePrefill('beds', v)} />
                  <Field label="Baths" value={prefill.baths ?? ''} onChange={v => updatePrefill('baths', v)} />
                  <Field label="Portfolio" value={prefill.portfolio ?? ''} onChange={v => updatePrefill('portfolio', v)} />
                  <Field label="Zone / State" value={prefill.zone ?? ''} onChange={v => updatePrefill('zone', v)} />
                </div>
              </Section>

              {/* Deal Terms — must come from Proposal stage */}
              <Section icon={<DollarSign size={14} />} title="Deal Terms" subtitle="From Proposal stage — required" required>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Management Fee %"
                    value={prefill.managementFeePercent ?? ''}
                    onChange={v => updatePrefill('managementFeePercent', v)}
                    placeholder="e.g. 20"
                    required
                    error={!prefill.managementFeePercent}
                  />
                  <Field
                    label="Term Length (months)"
                    value={prefill.termLengthMonths ?? ''}
                    onChange={v => updatePrefill('termLengthMonths', v)}
                    placeholder="e.g. 12"
                    required
                    error={!prefill.termLengthMonths}
                  />
                  <SelectField
                    label="Payout Schedule"
                    value={prefill.payoutSchedule ?? ''}
                    options={PAYOUT_OPTIONS}
                    onChange={v => updatePrefill('payoutSchedule', v)}
                    required
                    error={!prefill.payoutSchedule}
                  />
                  <Field label="Maintenance Approval Threshold ($)" value={prefill.maintenanceApprovalThreshold ?? ''} onChange={v => updatePrefill('maintenanceApprovalThreshold', v)} placeholder="e.g. 500" />
                  <Field label="Renewal Notice Period (days)" value={prefill.renewalNoticePeriod ?? ''} onChange={v => updatePrefill('renewalNoticePeriod', v)} placeholder="e.g. 60" />
                  <Field label="Onboarding Timeline" value={prefill.onboardingTimeline ?? ''} onChange={v => updatePrefill('onboardingTimeline', v)} placeholder="e.g. 30 days" />
                </div>
              </Section>

              {/* Personal Use & Termination */}
              <Section icon={<Calendar size={14} />} title="Personal Use & Termination">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Personal Use Notice (days)" value={prefill.personalUseNoticePeriod ?? ''} onChange={v => updatePrefill('personalUseNoticePeriod', v)} placeholder="e.g. 14" />
                  <Field label="Blackout Night Cap (nights/yr)" value={prefill.blackoutNightCap ?? ''} onChange={v => updatePrefill('blackoutNightCap', v)} placeholder="e.g. 30 or leave blank" />
                  <Field label="Termination Notice (Convenience, days)" value={prefill.terminationNoticeConvenience ?? ''} onChange={v => updatePrefill('terminationNoticeConvenience', v)} placeholder="e.g. 60" />
                  <Field label="Termination Notice (Cause, days)" value={prefill.terminationNoticeCause ?? ''} onChange={v => updatePrefill('terminationNoticeCause', v)} placeholder="e.g. 30" />
                  <Field label="Post-Termination Honor Window (days)" value={prefill.postTerminationHonorWindow ?? ''} onChange={v => updatePrefill('postTerminationHonorWindow', v)} placeholder="e.g. 30" />
                  <Field label="Final Payout Window (days)" value={prefill.finalPayoutWindow ?? ''} onChange={v => updatePrefill('finalPayoutWindow', v)} placeholder="e.g. 30" />
                  <Field label="Listing Removal Window (days)" value={prefill.listingRemovalWindow ?? ''} onChange={v => updatePrefill('listingRemovalWindow', v)} placeholder="e.g. 7" />
                </div>
              </Section>

              {/* Dispute Resolution */}
              <Section icon={<Shield size={14} />} title="Dispute Resolution">
                <div className="grid grid-cols-2 gap-3">
                  <SelectField
                    label="Dispute Resolution Method"
                    value={prefill.disputeResolutionMethod ?? ''}
                    options={DISPUTE_OPTIONS}
                    onChange={v => updatePrefill('disputeResolutionMethod', v)}
                  />
                  <Field label="Governing State" value={prefill.governingState ?? ''} onChange={v => updatePrefill('governingState', v)} placeholder="e.g. Texas" />
                </div>
              </Section>

              {/* Agent Notes */}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Agent Notes (internal)</label>
                <textarea
                  value={agentNotes}
                  onChange={e => setAgentNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes for this signing session..."
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Signers ── */}
          {step === 'signers' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-primary/5 border border-primary/15 rounded-xl">
                <Info size={14} className="text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-primary/80">
                  Per Section 16, all co-owners must sign. Each signer gets their own embedded signing session.
                  The agreement is not fully executed until all required signers complete.
                </p>
              </div>

              {signers.map((signer, i) => (
                <div key={signer.id} className="bg-muted/40 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-foreground">Homeowner {i + 1}</span>
                    {signers.length > 1 && (
                      <button
                        onClick={() => removeSigner(signer.id)}
                        className="p-1 rounded hover:bg-danger/10 transition-all"
                      >
                        <Trash2 size={13} className="text-danger" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-foreground block mb-1">Full Name *</label>
                      <input
                        value={signer.name}
                        onChange={e => updateSigner(signer.id, 'name', e.target.value)}
                        placeholder="Jane Smith"
                        className={`w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                          !signer.name.trim() ? 'border-amber-400' : 'border-border'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground block mb-1">Email Address *</label>
                      <input
                        value={signer.email}
                        onChange={e => updateSigner(signer.id, 'email', e.target.value)}
                        placeholder="jane@example.com"
                        type="email"
                        className={`w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                          signer.email && !signer.email.includes('@') ? 'border-red-400' : !signer.email ? 'border-amber-400' : 'border-border'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={addSigner}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary border border-primary/30 rounded-xl hover:bg-primary/5 transition-all w-full justify-center"
              >
                <Plus size={14} />
                Add Co-Owner Signer
              </button>
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Review Before Sending</h3>
                <div className="space-y-2">
                  <SummaryRow label="Property" value={prefill.propertyAddress ?? lead.address} />
                  <SummaryRow label="Management Fee" value={`${prefill.managementFeePercent}%`} />
                  <SummaryRow label="Term Length" value={`${prefill.termLengthMonths} months`} />
                  <SummaryRow label="Payout Schedule" value={prefill.payoutSchedule ?? ''} />
                  <SummaryRow label="Maintenance Threshold" value={`$${prefill.maintenanceApprovalThreshold}`} />
                  <SummaryRow label="Governing State" value={prefill.governingState ?? ''} />
                </div>
              </div>

              <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Signers ({signers.length})</h3>
                {signers.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <User size={13} className="text-muted-foreground" />
                    <span className="text-foreground font-medium">{s.name}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{s.email}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <Shield size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-xs text-emerald-700">
                  DocuSign handles all legal e-signature infrastructure — consent capture, tamper-evident sealing,
                  audit trail, and certificate of completion. The homeowner will sign within TRAVLR's UI.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl">
                  <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                  <p className="text-xs text-danger">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={() => {
              if (step === 'review') onClose();
              else if (step === 'signers') setStep('review');
              else setStep('signers');
            }}
            className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-all"
          >
            {step === 'review' ? 'Cancel' : 'Back'}
          </button>

          {step === 'review' && (
            <button
              onClick={() => setStep('signers')}
              disabled={!canProceedFromReview}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next: Signers
              <ChevronDown size={14} className="rotate-[-90deg]" />
            </button>
          )}

          {step === 'signers' && (
            <button
              onClick={() => setStep('confirm')}
              disabled={!canProceedFromSigners}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Review & Confirm
              <ChevronDown size={14} className="rotate-[-90deg]" />
            </button>
          )}

          {step === 'confirm' && (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {loading ? 'Sending…' : 'Send for Signing'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  icon, title, subtitle, required, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {required && <span className="text-xs text-danger font-medium">*required</span>}
        {subtitle && <span className="text-xs text-muted-foreground">— {subtitle}</span>}
      </div>
      <div className="bg-muted/30 border border-border rounded-xl p-4">
        {children}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, required, error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-foreground block mb-1">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 ${
          error ? 'border-amber-400 bg-amber-500/5' : 'border-border'
        }`}
      />
    </div>
  );
}

function SelectField({
  label, value, options, onChange, required, error,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  required?: boolean;
  error?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-foreground block mb-1">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 ${
          error ? 'border-amber-400' : 'border-border'
        }`}
      >
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value || '—'}</span>
    </div>
  );
}
