'use client';

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import {
  FileText, Send, CheckCircle, Loader2, ChevronDown, ChevronUp,
  DollarSign, Calendar, Briefcase, User, Plus, X, Copy, Eye,
  AlertTriangle, RefreshCw, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BenefitItem {
  id: string;
  label: string;
  included: boolean;
}

interface OfferLetterForm {
  candidateName: string;
  candidateEmail: string;
  roleTitle: string;
  department: string;
  salary: string;
  salaryType: 'annual' | 'hourly';
  startDate: string;
  reportingTo: string;
  workLocation: string;
  offerExpiryDate: string;
  additionalNotes: string;
}

interface GeneratedLetter {
  html: string;
  plain: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  'Homeowner Outreach Agent',
  'Guest Experience Manager',
  'Homeowner Success Manager',
  'Head of Property Operations',
  'Property Coordinator',
  'Revenue Manager',
  'Operations Analyst',
  'Marketing Specialist',
  'Customer Support Specialist',
];

const DEFAULT_BENEFITS: BenefitItem[] = [
  { id: 'health', label: 'Health Insurance (Medical, Dental, Vision)', included: true },
  { id: 'pto', label: '15 Days Paid Time Off (PTO)', included: true },
  { id: '401k', label: '401(k) with 4% Company Match', included: true },
  { id: 'remote', label: 'Remote Work Flexibility', included: true },
  { id: 'equipment', label: 'Home Office Equipment Stipend ($500)', included: false },
  { id: 'learning', label: 'Annual Learning & Development Budget ($1,000)', included: false },
  { id: 'wellness', label: 'Wellness Reimbursement ($50/mo)', included: false },
  { id: 'parental', label: 'Parental Leave (12 weeks paid)', included: false },
];

// ─── Offer Letter Generator ────────────────────────────────────────────────────

function generateOfferLetterHTML(form: OfferLetterForm, benefits: BenefitItem[]): GeneratedLetter {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const startFormatted = form.startDate
    ? new Date(form.startDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '[Start Date]';
  const expiryFormatted = form.offerExpiryDate
    ? new Date(form.offerExpiryDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '[Expiry Date]';
  const salaryDisplay = form.salary
    ? `$${Number(form.salary.replace(/,/g, '')).toLocaleString()} ${form.salaryType === 'annual' ? 'per year' : 'per hour'}`
    : '[Compensation]';
  const includedBenefits = benefits.filter(b => b.included);

  const html = `
<div style="font-family: Georgia, serif; max-width: 680px; margin: 0 auto; padding: 48px; color: #1a1a1a; line-height: 1.7;">
  <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #e5e7eb;">
    <div style="width: 48px; height: 48px; background: #111827; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
      <span style="color: white; font-size: 20px; font-weight: bold;">T</span>
    </div>
    <div>
      <div style="font-size: 20px; font-weight: 700; color: #111827; letter-spacing: -0.5px;">TRAVLR Inc.</div>
      <div style="font-size: 13px; color: #6b7280;">Short-Term Rental Management</div>
    </div>
  </div>

  <p style="color: #6b7280; font-size: 14px; margin-bottom: 32px;">${today}</p>

  <p style="font-size: 16px; margin-bottom: 8px;">Dear <strong>${form.candidateName || '[Candidate Name]'}</strong>,</p>

  <p style="margin-bottom: 20px;">We are thrilled to extend this offer of employment to you for the position of <strong>${form.roleTitle || '[Role Title]'}</strong>${form.department ? ` within our <strong>${form.department}</strong> team` : ''}. After a thorough interview process, we are confident that your skills and experience make you an excellent fit for TRAVLR.</p>

  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin: 28px 0;">
    <h3 style="font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; margin: 0 0 16px 0;">Offer Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 40%;">Position</td><td style="padding: 6px 0; font-size: 14px; font-weight: 600;">${form.roleTitle || '—'}</td></tr>
      ${form.department ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Department</td><td style="padding: 6px 0; font-size: 14px; font-weight: 600;">${form.department}</td></tr>` : ''}
      <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Compensation</td><td style="padding: 6px 0; font-size: 14px; font-weight: 600; color: #059669;">${salaryDisplay}</td></tr>
      <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Start Date</td><td style="padding: 6px 0; font-size: 14px; font-weight: 600;">${startFormatted}</td></tr>
      ${form.reportingTo ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Reports To</td><td style="padding: 6px 0; font-size: 14px; font-weight: 600;">${form.reportingTo}</td></tr>` : ''}
      ${form.workLocation ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Work Location</td><td style="padding: 6px 0; font-size: 14px; font-weight: 600;">${form.workLocation}</td></tr>` : ''}
    </table>
  </div>

  ${includedBenefits.length > 0 ? `
  <h3 style="font-size: 15px; font-weight: 700; color: #111827; margin: 28px 0 12px 0;">Benefits Package</h3>
  <p style="margin-bottom: 12px; color: #374151;">As a full-time member of the TRAVLR team, you will be eligible for the following benefits:</p>
  <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #374151;">
    ${includedBenefits.map(b => `<li style="margin-bottom: 6px; font-size: 14px;">${b.label}</li>`).join('')}
  </ul>
  ` : ''}

  <p style="margin-bottom: 16px;">This offer is contingent upon successful completion of a background check and your execution of TRAVLR's standard confidentiality and intellectual property agreement.</p>

  ${form.additionalNotes ? `<p style="margin-bottom: 16px; padding: 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 14px; color: #92400e;">${form.additionalNotes}</p>` : ''}

  <p style="margin-bottom: 8px;">Please indicate your acceptance of this offer by signing and returning this letter by <strong>${expiryFormatted}</strong>.</p>

  <p style="margin-bottom: 32px;">We look forward to welcoming you to the TRAVLR family. If you have any questions, please don't hesitate to reach out.</p>

  <p style="margin-bottom: 4px;">Warm regards,</p>
  <p style="font-weight: 700; margin-bottom: 2px;">Jennifer Wampole</p>
  <p style="color: #6b7280; font-size: 14px; margin-bottom: 40px;">Head of People Operations · TRAVLR Inc.</p>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 32px; margin-top: 32px;">
    <p style="font-size: 13px; color: #6b7280; margin-bottom: 24px;">By signing below, I, <strong>${form.candidateName || '[Candidate Name]'}</strong>, accept the terms of this offer of employment.</p>
    <div style="display: flex; gap: 48px;">
      <div>
        <div style="border-bottom: 1px solid #374151; width: 200px; margin-bottom: 6px; height: 32px;"></div>
        <p style="font-size: 12px; color: #6b7280;">Candidate Signature</p>
      </div>
      <div>
        <div style="border-bottom: 1px solid #374151; width: 160px; margin-bottom: 6px; height: 32px;"></div>
        <p style="font-size: 12px; color: #6b7280;">Date</p>
      </div>
    </div>
  </div>
</div>
  `.trim();

  const plain = `OFFER OF EMPLOYMENT — TRAVLR Inc.\n${today}\n\nDear ${form.candidateName || '[Candidate Name]'},\n\nWe are thrilled to extend this offer for the position of ${form.roleTitle || '[Role Title]'}${form.department ? ` in our ${form.department} team` : ''}.\n\nOFFER DETAILS\nPosition: ${form.roleTitle || '—'}\nCompensation: ${salaryDisplay}\nStart Date: ${startFormatted}\n${form.reportingTo ? `Reports To: ${form.reportingTo}\n` : ''}${form.workLocation ? `Work Location: ${form.workLocation}\n` : ''}\n${includedBenefits.length > 0 ? `BENEFITS\n${includedBenefits.map(b => `• ${b.label}`).join('\n')}\n\n` : ''}Please accept by ${expiryFormatted}.\n\nWarm regards,\nJennifer Wampole\nHead of People Operations · TRAVLR Inc.`;

  return { html, plain };
}

// ─── DocuSign Send ────────────────────────────────────────────────────────────

async function sendViaDocuSign(form: OfferLetterForm, letterHtml: string): Promise<{ envelopeId: string }> {
  const res = await fetch('/api/docusign/create-envelope', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leadId: `offer-${Date.now()}`,
      leadAddress: `Offer Letter — ${form.candidateName}`,
      signers: [
        {
          name: form.candidateName,
          email: form.candidateEmail,
          clientUserId: `candidate-${Date.now()}`,
          recipientId: '1',
          order: 1,
        },
      ],
      prefill: {
        homeownerName: form.candidateName,
        homeownerEmail: form.candidateEmail,
        propertyAddress: `${form.roleTitle} — TRAVLR Inc.`,
        managementFeePercent: form.salary,
        termLengthMonths: '12',
        payoutSchedule: form.salaryType === 'annual' ? 'Bi-weekly' : 'Weekly',
      },
      agentNotes: `Offer Letter for ${form.roleTitle}. Start: ${form.startDate}. ${form.additionalNotes || ''}`.trim(),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'DocuSign send failed');
  }

  return res.json();
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function LetterPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">Letter Preview</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div
            className="bg-white border border-gray-200 rounded-xl overflow-hidden"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Inner (uses useSearchParams) ───────────────────────────────────

function OfferLettersInner() {
  const searchParams = useSearchParams();

  const [form, setForm] = useState<OfferLetterForm>({
    candidateName: '',
    candidateEmail: '',
    roleTitle: '',
    department: '',
    salary: '',
    salaryType: 'annual',
    startDate: '',
    reportingTo: '',
    workLocation: 'Remote',
    offerExpiryDate: '',
    additionalNotes: '',
  });
  const [benefits, setBenefits] = useState<BenefitItem[]>(DEFAULT_BENEFITS);
  const [customBenefit, setCustomBenefit] = useState('');
  const [showBenefits, setShowBenefits] = useState(true);
  const [generated, setGenerated] = useState<GeneratedLetter | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ envelopeId: string } | null>(null);
  const [prefillBanner, setPrefillBanner] = useState('');

  // Pre-fill from URL params (coming from Interview Mode)
  useEffect(() => {
    const candidateName = searchParams.get('candidateName');
    const roleTitle = searchParams.get('roleTitle');
    const salary = searchParams.get('salary');
    const salaryType = searchParams.get('salaryType') as 'annual' | 'hourly' | null;
    const score = searchParams.get('score');
    const benefitsParam = searchParams.get('benefits');
    const source = searchParams.get('source');

    if (source === 'interview' && (candidateName || roleTitle)) {
      setForm(prev => ({
        ...prev,
        candidateName: candidateName || prev.candidateName,
        roleTitle: roleTitle || prev.roleTitle,
        salary: salary || prev.salary,
        salaryType: salaryType || prev.salaryType,
      }));

      if (benefitsParam) {
        const enabledIds = benefitsParam.split(',');
        setBenefits(prev => prev.map(b => ({ ...b, included: enabledIds.includes(b.id) })));
      }

      const parts: string[] = [];
      if (candidateName) parts.push(candidateName);
      if (roleTitle) parts.push(roleTitle);
      if (score) parts.push(`Score: ${score}`);
      if (parts.length > 0) {
        setPrefillBanner(`Pre-filled from interview: ${parts.join(' · ')}`);
      }
    }
  }, [searchParams]);

  const updateForm = (key: keyof OfferLetterForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setGenerated(null);
    setSent(null);
  };

  const toggleBenefit = (id: string) => {
    setBenefits(prev => prev.map(b => b.id === id ? { ...b, included: !b.included } : b));
    setGenerated(null);
  };

  const addCustomBenefit = () => {
    if (!customBenefit.trim()) return;
    setBenefits(prev => [...prev, { id: `custom-${Date.now()}`, label: customBenefit.trim(), included: true }]);
    setCustomBenefit('');
    setGenerated(null);
  };

  const removeCustomBenefit = (id: string) => {
    setBenefits(prev => prev.filter(b => b.id !== id));
    setGenerated(null);
  };

  const handleGenerate = useCallback(() => {
    if (!form.candidateName.trim() || !form.roleTitle.trim()) {
      toast.error('Candidate name and role title are required');
      return;
    }
    const letter = generateOfferLetterHTML(form, benefits);
    setGenerated(letter);
    toast.success('Offer letter generated');
  }, [form, benefits]);

  const handleCopyText = () => {
    if (!generated) return;
    navigator.clipboard.writeText(generated.plain).then(() => toast.success('Copied to clipboard'));
  };

  const handleSendDocuSign = async () => {
    if (!generated) { toast.error('Generate the letter first'); return; }
    if (!form.candidateEmail.trim()) { toast.error('Candidate email is required for DocuSign'); return; }

    setSending(true);
    try {
      const result = await sendViaDocuSign(form, generated.html);
      setSent(result);
      toast.success('Offer letter sent via DocuSign!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const isFormValid = form.candidateName.trim() && form.roleTitle.trim();

  return (
    <div className="min-h-screen bg-gray-50">
      {showPreview && generated && (
        <LetterPreviewModal html={generated.html} onClose={() => setShowPreview(false)} />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Offer Letters</h1>
              <p className="text-xs text-gray-500">Generate and send customized offer letters to hired candidates</p>
            </div>
          </div>
          <Link
            href="/candidate-profiles"
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            <User className="w-3.5 h-3.5" />
            Candidate Profiles
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Pre-fill banner from interview */}
        {prefillBanner && (
          <div className="mb-5 flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800 font-medium flex-1">{prefillBanner}</p>
            <button onClick={() => setPrefillBanner('')} className="p-1 rounded-lg hover:bg-green-100 transition-colors">
              <X className="w-3.5 h-3.5 text-green-500" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Left: Form ── */}
          <div className="lg:col-span-3 space-y-5">

            {/* Candidate Info */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-bold text-gray-900">Candidate Information</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.candidateName}
                    onChange={e => updateForm('candidateName', e.target.value)}
                    placeholder="Alex Johnson"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={form.candidateEmail}
                    onChange={e => updateForm('candidateEmail', e.target.value)}
                    placeholder="alex@email.com"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* Role & Compensation */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-bold text-gray-900">Role & Compensation</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Role Title <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.roleTitle}
                    onChange={e => updateForm('roleTitle', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  >
                    <option value="">Select a role…</option>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {form.roleTitle && !ROLE_OPTIONS.includes(form.roleTitle) && (
                    <p className="text-xs text-gray-500 mt-1.5 px-1">
                      Pre-filled: <span className="font-semibold text-gray-700">{form.roleTitle}</span>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Department</label>
                    <input
                      type="text"
                      value={form.department}
                      onChange={e => updateForm('department', e.target.value)}
                      placeholder="Operations"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Reports To</label>
                    <input
                      type="text"
                      value={form.reportingTo}
                      onChange={e => updateForm('reportingTo', e.target.value)}
                      placeholder="Jennifer Wampole"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                      <DollarSign className="w-3 h-3 inline mr-0.5" />Salary
                    </label>
                    <input
                      type="text"
                      value={form.salary}
                      onChange={e => updateForm('salary', e.target.value)}
                      placeholder="65,000"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Type</label>
                    <select
                      value={form.salaryType}
                      onChange={e => updateForm('salaryType', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                    >
                      <option value="annual">Annual</option>
                      <option value="hourly">Hourly</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Dates & Location */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-bold text-gray-900">Dates & Location</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={e => updateForm('startDate', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Offer Expires</label>
                  <input
                    type="date"
                    value={form.offerExpiryDate}
                    onChange={e => updateForm('offerExpiryDate', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Work Location</label>
                  <select
                    value={form.workLocation}
                    onChange={e => updateForm('workLocation', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  >
                    <option value="Remote">Remote</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="On-site">On-site</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <button
                onClick={() => setShowBenefits(x => !x)}
                className="w-full flex items-center justify-between mb-1"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-500" />
                  <h2 className="text-sm font-bold text-gray-900">Benefits Package</h2>
                  <span className="text-xs text-gray-400">({benefits.filter(b => b.included).length} included)</span>
                </div>
                {showBenefits ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {showBenefits && (
                <div className="mt-4 space-y-2">
                  {benefits.map(benefit => (
                    <label key={benefit.id} className="flex items-center gap-3 cursor-pointer group">
                      <div
                        onClick={() => toggleBenefit(benefit.id)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          benefit.included ? 'bg-gray-900 border-gray-900' : 'border-gray-300 group-hover:border-gray-400'
                        }`}
                      >
                        {benefit.included && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                      <span className={`text-sm flex-1 ${benefit.included ? 'text-gray-900' : 'text-gray-400'}`}>
                        {benefit.label}
                      </span>
                      {benefit.id.startsWith('custom-') && (
                        <button
                          onClick={() => removeCustomBenefit(benefit.id)}
                          className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </label>
                  ))}

                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <input
                      type="text"
                      value={customBenefit}
                      onChange={e => setCustomBenefit(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCustomBenefit()}
                      placeholder="Add custom benefit…"
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <button
                      onClick={addCustomBenefit}
                      className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <Plus className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Additional Notes */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Additional Notes (Optional)</label>
              <textarea
                value={form.additionalNotes}
                onChange={e => updateForm('additionalNotes', e.target.value)}
                rows={3}
                placeholder="Any special terms, conditions, or notes to include in the letter…"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            </div>
          </div>

          {/* ── Right: Actions & Status ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Generate */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 sticky top-4">
              <h2 className="text-sm font-bold text-gray-900 mb-4">Generate & Send</h2>

              <button
                onClick={handleGenerate}
                disabled={!isFormValid}
                className="w-full py-3 px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed mb-3"
              >
                <RefreshCw className="w-4 h-4" />
                {generated ? 'Regenerate Letter' : 'Generate Offer Letter'}
              </button>

              {generated && (
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPreview(true)}
                      className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" />
                      Preview
                    </button>
                    <button
                      onClick={handleCopyText}
                      className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Text
                    </button>
                  </div>

                  <div className="border-t border-gray-100 pt-3">
                    {!sent ? (
                      <button
                        onClick={handleSendDocuSign}
                        disabled={sending || !form.candidateEmail.trim()}
                        className="w-full py-3 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sending ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Sending via DocuSign…</>
                        ) : (
                          <><Send className="w-4 h-4" /> Send via DocuSign</>
                        )}
                      </button>
                    ) : (
                      <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-green-800">Sent via DocuSign!</p>
                          <p className="text-xs text-green-600 mt-0.5">Envelope ID: {sent.envelopeId}</p>
                          <p className="text-xs text-green-600">{form.candidateName} will receive an email to sign.</p>
                        </div>
                      </div>
                    )}

                    {!form.candidateEmail.trim() && !sent && (
                      <p className="flex items-center gap-1.5 text-xs text-amber-600 mt-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Add candidate email to enable DocuSign
                      </p>
                    )}
                  </div>
                </div>
              )}

              {!isFormValid && (
                <p className="text-xs text-gray-400 text-center mt-2">Fill in candidate name and role to generate</p>
              )}
            </div>

            {/* DocuSign info */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <div className="flex items-start gap-2.5">
                <Send className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-blue-800 mb-1">DocuSign Integration</p>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    One-click sending routes the offer letter through DocuSign for legally binding e-signature. The candidate receives an email with a signing link.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Links</p>
              <div className="space-y-1.5">
                {[
                  { href: '/candidate-profiles', label: 'Candidate Profiles', icon: User },
                  { href: '/teleprompter/interview', label: 'Interview Mode', icon: Briefcase },
                  { href: '/hiring-analytics', label: 'Hiring Analytics', icon: FileText },
                  { href: '/candidate-sequences', label: 'Candidate Sequences', icon: Send },
                ].map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-600 hover:text-gray-900"
                  >
                    <link.icon className="w-3.5 h-3.5 text-gray-400" />
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OfferLettersPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    }>
      <OfferLettersInner />
    </Suspense>
  );
}
