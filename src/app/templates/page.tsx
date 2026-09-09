'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Mail, MessageSquare, Plus, Edit2, Trash2, Eye, Copy, Search,
  AlertTriangle, CheckCircle2, X, Save, Loader2, ChevronDown,
  Variable, FileText, ShieldAlert, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { resolveLocalBlurb } from '@/lib/localBlurbs';
import { SMS_TEMPLATE_SEEDS, resolveSMSTemplate, type SMSTemplateSeed,  } from '@/lib/smsTemplateSeeds';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateType = 'email' | 'sms';

interface Template {
  id: string;
  name: string;
  type: TemplateType;
  subject?: string;
  body: string;
  category: string;
  tag?: string;
  variables: string[];
  created_at?: string;
  updated_at?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMAIL_VARIABLES = [
  { key: '{{first_name}}', label: 'First Name' },
  { key: '{{last_name}}', label: 'Last Name' },
  { key: '{{address}}', label: 'Property Address' },
  { key: '{{city}}', label: 'City' },
  { key: '{{agent_name}}', label: 'Agent Name' },
  { key: '{{company_name}}', label: 'Company Name' },
  { key: '{{prospect_score}}', label: 'Prospect Score' },
  { key: '{{estimated_revenue}}', label: 'Est. Monthly Revenue' },
  { key: '{{unsubscribe_link}}', label: 'Unsubscribe Link' },
];

const SMS_VARIABLES = [
  { key: '{{senderName}}', label: 'Sender Name (auto)' },
  { key: '{{contactName}}', label: 'Contact Name (auto / "there")' },
  { key: '{{address}}', label: 'Property Address (required)' },
  { key: '{{localBlurb}}', label: 'Local Market Blurb (auto)' },
  { key: '{{proposedRent}}', label: 'Proposed Rent (manual)' },
  { key: '{{leaseTerm}}', label: 'Lease Term (manual)' },
  { key: '{{proposedStartDate}}', label: 'Proposed Start Date (manual)' },
  { key: '{{opt_out}}', label: 'Opt-Out Text (TCPA)' },
];

const CATEGORIES = ['Initial Outreach', 'Follow-Up', 'Proposal', 'Closing', 'Nurture', 'Re-engagement', 'Other'];

const TCPA_REQUIRED_PHRASES = ['reply stop', 'text stop', 'opt out', 'unsubscribe', 'opt-out'];

/** Variables that are auto-resolved (not manual) */
const SMS_AUTO_VARS = new Set(['{{senderName}}', '{{contactName}}', '{{address}}', '{{localBlurb}}']);

/** Variables that block send on proposal templates */
const SMS_PROPOSAL_BLOCKING_VARS = ['{{proposedRent}}', '{{leaseTerm}}', '{{proposedStartDate}}'];

function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{[^}]+\}\}/g) ?? [];
  return [...new Set(matches)];
}

function checkTCPA(body: string): { compliant: boolean; missing: string[] } {
  const lower = body.toLowerCase();
  const found = TCPA_REQUIRED_PHRASES.some((p) => lower.includes(p));
  return {
    compliant: found,
    missing: found ? [] : ['Opt-out instruction (e.g. "Reply STOP to opt out")'],
  };
}

function detectDuplicates(templates: Template[], current: { name: string; body: string; id?: string }): string[] {
  const warnings: string[] = [];
  for (const t of templates) {
    if (t.id === current.id) continue;
    if (t.name.trim().toLowerCase() === current.name.trim().toLowerCase()) {
      warnings.push(`Name matches existing template: "${t.name}"`);
    }
    if (current.body.length > 20 && t.body.trim() === current.body.trim()) {
      warnings.push(`Body is identical to: "${t.name}"`);
    }
  }
  return warnings;
}

/** Detect if a template body contains proposal-only variables */
function isProposalTemplate(body: string): boolean {
  return SMS_PROPOSAL_BLOCKING_VARS.some((v) => body.includes(v));
}

// ─── SMS Variable Resolution Panel ───────────────────────────────────────────

interface SMSResolutionPanelProps {
  template: Template;
  senderName: string;
  onClose: () => void;
}

function SMSResolutionPanel({ template, senderName, onClose }: SMSResolutionPanelProps) {
  const [contactName, setContactName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [proposedRent, setProposedRent] = useState('');
  const [leaseTerm, setLeaseTerm] = useState('');
  const [proposedStartDate, setProposedStartDate] = useState('');
  const [resolved, setResolved] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const hasProposalVars = isProposalTemplate(template.body);

  // Find the matching seed for this template to get blockingVars
  const seed: SMSTemplateSeed | undefined = SMS_TEMPLATE_SEEDS.find(
    (s) => s.name === template.name || s.body.slice(0, 40) === template.body.slice(0, 40)
  );

  function handleResolve() {
    const { blurb, needsFlag } = resolveLocalBlurb(city || undefined, state || undefined);

    let result = resolveSMSTemplate(
      seed ?? {
        name: template.name,
        body: template.body,
        category: template.category,
        tag: (template.tag as SMSTemplateSeed['tag']) ?? 'outreach',
        requiredVars: extractVariables(template.body),
        blockingVars: ['{{senderName}}', '{{address}}',
          ...(hasProposalVars ? SMS_PROPOSAL_BLOCKING_VARS : [])],
      },
      {
        senderName: senderName || null,
        contactName: contactName || null,
        address: address || null,
        localBlurb: blurb,
        proposedRent: proposedRent || null,
        leaseTerm: leaseTerm || null,
        proposedStartDate: proposedStartDate || null,
      }
    );

    setErrors(result.blockingErrors);
    setWarnings([
      ...(result.usedContactFallback ? ['Contact name not provided — using "there" as fallback.'] : []),
      ...(needsFlag || result.usedNeutralBlurb ? ['No local market entry found — using neutral expansion language. Flag this record to add a proper local blurb.'] : []),
    ]);
    setResolved(result.resolvedBody);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-green-500" />
            <h3 className="text-sm font-bold text-foreground">Resolve &amp; Preview — {template.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Auto-resolved notice */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/8 border border-primary/20 text-xs text-primary">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              <strong>Sender name</strong> is auto-resolved from your account profile.
              <strong> Contact name</strong> falls back to "there" if blank.
              <strong> Local blurb</strong> is matched by city → state → neutral fallback.
            </span>
          </div>

          {/* Sender name (read-only) */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Sender Name <span className="text-muted-foreground">(from your profile)</span></label>
            <div className={`px-3 py-2 rounded-lg border text-sm ${senderName ? 'border-success/40 bg-success/5 text-foreground' : 'border-danger/40 bg-danger/5 text-danger'}`}>
              {senderName || <span className="italic">Missing — add a first name to your account profile</span>}
            </div>
          </div>

          {/* Contact name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Contact Name <span className="text-muted-foreground">(optional — falls back to "there")</span></label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Sarah"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Address */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Property Address <span className="text-danger">*</span></label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Example Lane, Aspen, CO"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* City + State for local blurb */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">City <span className="text-muted-foreground">(for local blurb)</span></label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Aspen"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">State <span className="text-muted-foreground">(2-letter)</span></label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="e.g. CO"
                maxLength={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 uppercase"
              />
            </div>
          </div>

          {/* Proposal-only fields */}
          {hasProposalVars && (
            <div className="space-y-3 p-3 rounded-lg border border-warning/30 bg-warning/5">
              <p className="text-xs font-semibold text-warning flex items-center gap-1.5">
                <ShieldAlert size={12} />
                Proposal fields — required before sending
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Proposed Rent <span className="text-danger">*</span></label>
                <input
                  value={proposedRent}
                  onChange={(e) => setProposedRent(e.target.value)}
                  placeholder="e.g. $8,500"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Lease Term <span className="text-danger">*</span></label>
                <input
                  value={leaseTerm}
                  onChange={(e) => setLeaseTerm(e.target.value)}
                  placeholder="e.g. 12 months"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Proposed Start Date <span className="text-danger">*</span></label>
                <input
                  value={proposedStartDate}
                  onChange={(e) => setProposedStartDate(e.target.value)}
                  placeholder="e.g. October 1, 2026"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          )}

          {/* Resolve button */}
          <button
            onClick={handleResolve}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Resolve &amp; Preview
          </button>

          {/* Blocking errors */}
          {errors.length > 0 && (
            <div className="space-y-2">
              {errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-danger/8 border border-danger/25 text-danger text-xs">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-warning/8 border border-warning/25 text-warning text-xs">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Resolved preview */}
          {resolved && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-success">
                <CheckCircle2 size={13} />
                All required variables resolved — ready to send
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm text-foreground whitespace-pre-wrap leading-relaxed font-mono">
                {resolved}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {resolved.length} chars · {Math.ceil(resolved.length / 160)} SMS segment{Math.ceil(resolved.length / 160) !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const sampleValues: Record<string, string> = {
    '{{first_name}}': 'Sarah',
    '{{last_name}}': 'Johnson',
    '{{address}}': '123 Example Lane, Aspen, CO',
    '{{city}}': 'Aspen',
    '{{agent_name}}': 'Jen',
    '{{company_name}}': 'TRAVLR',
    '{{prospect_score}}': '82',
    '{{estimated_revenue}}': '$4,200',
    '{{unsubscribe_link}}': 'https://staytravlr.com/unsubscribe',
    '{{opt_out}}': 'Reply STOP to opt out',
    // SMS-specific
    '{{senderName}}': 'Jen',
    '{{contactName}}': 'Sarah',
    '{{localBlurb}}': "we've built our Colorado presence right here in Aspen since launching our subsidiary in early 2025",
    '{{proposedRent}}': '$8,500',
    '{{leaseTerm}}': '12 months',
    '{{proposedStartDate}}': 'October 1, 2026',
  };

  function renderPreview(text: string) {
    let result = text;
    for (const [key, val] of Object.entries(sampleValues)) {
      result = result.replaceAll(key, `<span class="bg-amber-100 text-amber-800 px-0.5 rounded text-xs font-medium">${val}</span>`);
    }
    return result;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Eye size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">Preview — {template.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${template.type === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
              {template.type}
            </span>
            <span className="text-xs text-muted-foreground">{template.category}</span>
            {template.tag && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                {template.tag}
              </span>
            )}
          </div>
          {template.subject && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Subject</p>
              <p className="text-sm font-medium text-foreground bg-muted/40 px-3 py-2 rounded-lg"
                dangerouslySetInnerHTML={{ __html: renderPreview(template.subject) }} />
            </div>
          )}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Body</p>
            <div className="text-sm text-foreground bg-muted/40 px-3 py-3 rounded-lg whitespace-pre-wrap leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderPreview(template.body) }} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            <span className="bg-amber-100 text-amber-800 px-0.5 rounded text-xs font-medium">highlighted</span> values are sample data substituted for variables.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Template Editor ──────────────────────────────────────────────────────────

interface EditorProps {
  template: Template | null;
  allTemplates: Template[];
  onSave: (t: Omit<Template, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => Promise<void>;
  onCancel: () => void;
}

function TemplateEditor({ template, allTemplates, onSave, onCancel }: EditorProps) {
  const [type, setType] = useState<TemplateType>(template?.type ?? 'email');
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [category, setCategory] = useState(template?.category ?? 'Initial Outreach');
  const [saving, setSaving] = useState(false);
  const [varMenuOpen, setVarMenuOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const variables = extractVariables((subject ?? '') + ' ' + body);
  const tcpa = type === 'sms' ? checkTCPA(body) : { compliant: true, missing: [] };
  const duplicates = detectDuplicates(allTemplates, { name, body, id: template?.id });
  const smsCharCount = body.length;
  const smsSegments = Math.ceil(smsCharCount / 160) || 1;

  function insertVariable(varKey: string) {
    const ta = bodyRef.current;
    if (!ta) { setBody((b) => b + varKey); return; }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const newBody = body.slice(0, start) + varKey + body.slice(end);
    setBody(newBody);
    setVarMenuOpen(false);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + varKey.length, start + varKey.length);
    }, 0);
  }

  async function handleSubmit() {
    if (!name.trim() || !body.trim()) { toast.error('Name and body are required'); return; }
    setSaving(true);
    await onSave({ id: template?.id, type, name: name.trim(), subject: subject.trim(), body: body.trim(), category, variables });
    setSaving(false);
  }

  const varList = type === 'email' ? EMAIL_VARIABLES : SMS_VARIABLES;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
      {/* Type toggle */}
      <div className="flex items-center gap-2">
        {(['email', 'sms'] as TemplateType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {t === 'email' ? <Mail size={14} /> : <MessageSquare size={14} />}
            {t === 'email' ? 'Email' : 'SMS'}
          </button>
        ))}
      </div>

      {/* SMS variable resolution info */}
      {type === 'sms' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/8 border border-primary/20 text-xs text-primary">
          <Info size={13} className="shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">SMS Variable Resolution Rules</p>
            <p><code className="font-mono bg-primary/10 px-0.5 rounded">{'{{senderName}}'}</code> — auto from your profile · <code className="font-mono bg-primary/10 px-0.5 rounded">{'{{contactName}}'}</code> — auto, falls back to "there" · <code className="font-mono bg-primary/10 px-0.5 rounded">{'{{address}}'}</code> — required, blocks send · <code className="font-mono bg-primary/10 px-0.5 rounded">{'{{localBlurb}}'}</code> — city→state→neutral</p>
            <p>Proposal variables (<code className="font-mono bg-primary/10 px-0.5 rounded">{'{{proposedRent}}'}</code>, <code className="font-mono bg-primary/10 px-0.5 rounded">{'{{leaseTerm}}'}</code>, <code className="font-mono bg-primary/10 px-0.5 rounded">{'{{proposedStartDate}}'}</code>) must be entered manually and block send if missing.</p>
          </div>
        </div>
      )}

      {/* Warnings */}
      {type === 'sms' && !tcpa.compliant && body.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/8 border border-danger/25 text-danger text-xs">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">TCPA Compliance Warning</p>
            <p className="mt-0.5">SMS templates must include an opt-out instruction. Missing: {tcpa.missing.join(', ')}.</p>
            <p className="mt-0.5 text-[11px] opacity-80">Example: "Reply STOP to opt out." — required by TCPA regulations.</p>
          </div>
        </div>
      )}
      {duplicates.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/8 border border-warning/25 text-warning text-xs">
          <Copy size={13} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Duplicate Detected</p>
            {duplicates.map((d, i) => <p key={i} className="mt-0.5">{d}</p>)}
          </div>
        </div>
      )}

      {/* Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Template Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. SMS — Initial Outreach"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {type === 'email' && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Subject Line</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Your property at {{address}} — STR opportunity"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">Body *</label>
          <div className="flex items-center gap-2">
            {type === 'sms' && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${smsCharCount > 320 ? 'bg-danger/15 text-danger' : smsCharCount > 160 ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'}`}>
                {smsCharCount} chars · {smsSegments} segment{smsSegments !== 1 ? 's' : ''}
              </span>
            )}
            <div className="relative">
              <button
                onClick={() => setVarMenuOpen((v) => !v)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-border rounded-md hover:bg-muted transition-colors text-muted-foreground"
              >
                <Variable size={11} />
                Insert Variable
                <ChevronDown size={10} className={`transition-transform ${varMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {varMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-60 bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                  {varList.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVariable(v.key)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2"
                    >
                      <span className="text-foreground">{v.label}</span>
                      <code className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded shrink-0">{v.key}</code>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={type === 'sms' ? 5 : 10}
          placeholder={
            type === 'sms' ?'Hi {{contactName}}, this is {{senderName}} with TRAVLR Vacation Homes. I came across {{address}} and wanted to reach out. {{localBlurb}}. Would you be open to a quick call?' :'Hi {{first_name}},\n\nI noticed your property at {{address}} and wanted to reach out about a short-term rental opportunity...\n\nBest,\n{{agent_name}}'
          }
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono"
        />
      </div>

      {/* Detected variables */}
      {variables.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Variables detected:</span>
          {variables.map((v) => (
            <span
              key={v}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                type === 'sms' && SMS_AUTO_VARS.has(v)
                  ? 'bg-success/10 text-success'
                  : type === 'sms' && SMS_PROPOSAL_BLOCKING_VARS.includes(v)
                  ? 'bg-warning/10 text-warning' :'bg-primary/10 text-primary'
              }`}
            >
              {v}
            </span>
          ))}
          {type === 'sms' && variables.length > 0 && (
            <span className="text-[10px] text-muted-foreground ml-1">
              <span className="text-success">■</span> auto &nbsp;
              <span className="text-warning">■</span> manual/blocking
            </span>
          )}
        </div>
      )}

      {/* TCPA compliant badge */}
      {type === 'sms' && tcpa.compliant && body.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-success">
          <CheckCircle2 size={13} />
          TCPA opt-out instruction detected — compliant
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !name.trim() || !body.trim()}
          className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? 'Saving…' : template ? 'Update Template' : 'Save Template'}
        </button>
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onDelete,
  onPreview,
  onResolve,
}: {
  template: Template;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onResolve?: () => void;
}) {
  const tcpa = template.type === 'sms' ? checkTCPA(template.body) : { compliant: true, missing: [] };
  const vars = extractVariables((template.subject ?? '') + ' ' + template.body);

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${template.type === 'email' ? 'bg-blue-500/10' : 'bg-green-500/10'}`}>
            {template.type === 'email' ? <Mail size={13} className="text-blue-500" /> : <MessageSquare size={13} className="text-green-500" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{template.name}</p>
            <p className="text-[10px] text-muted-foreground">{template.category}{template.tag ? ` · ${template.tag}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {template.type === 'sms' && onResolve && (
            <button onClick={onResolve} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-green-500" title="Resolve &amp; Preview SMS">
              <ShieldAlert size={13} />
            </button>
          )}
          <button onClick={onPreview} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Preview"><Eye size={13} /></button>
          <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Edit"><Edit2 size={13} /></button>
          <button onClick={onDelete} className="p-1.5 rounded-md hover:bg-danger/10 transition-colors text-muted-foreground hover:text-danger" title="Delete"><Trash2 size={13} /></button>
        </div>
      </div>

      {template.subject && (
        <p className="text-xs text-muted-foreground mb-1.5 truncate">
          <span className="font-medium text-foreground">Subj:</span> {template.subject}
        </p>
      )}
      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{template.body}</p>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {template.type === 'sms' && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${tcpa.compliant ? 'bg-success/10 text-success border-success/20' : 'bg-danger/10 text-danger border-danger/20'}`}>
            {tcpa.compliant ? '✓ TCPA' : '⚠ TCPA'}
          </span>
        )}
        {vars.slice(0, 3).map((v) => (
          <span key={v} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            template.type === 'sms' && SMS_AUTO_VARS.has(v) ? 'bg-success/10 text-success' :
            template.type === 'sms' && SMS_PROPOSAL_BLOCKING_VARS.includes(v) ? 'bg-warning/10 text-warning' :
            'bg-muted text-muted-foreground'
          }`}>{v}</span>
        ))}
        {vars.length > 3 && <span className="text-[10px] text-muted-foreground">+{vars.length - 3} more</span>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [resolveTemplate, setResolveTemplate] = useState<Template | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'email' | 'sms'>('all');
  const supabase = createClient();
  const { user } = useAuth();

  // Resolve sender name from user profile — never persisted across sessions
  const senderName: string = (() => {
    if (!user) return '';
    const meta = (user as any).user_metadata ?? {};
    return (meta.first_name as string | undefined)?.trim()
      || (meta.full_name as string | undefined)?.trim()
      || (user.email ?? '');
  })();

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('message_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setTemplates(data as Template[]);
    } catch {
      try {
        const { data } = await supabase
          .from('email_templates')
          .select('*')
          .order('created_at', { ascending: false });
        if (data) {
          setTemplates(data.map((t: any) => ({ ...t, type: 'email' as TemplateType, variables: extractVariables((t.subject ?? '') + ' ' + t.body) })));
        }
      } catch { /* silent */ }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  async function handleSave(tpl: Omit<Template, 'id' | 'created_at' | 'updated_at'> & { id?: string }) {
    try {
      const payload = {
        name: tpl.name,
        type: tpl.type,
        subject: tpl.subject,
        body: tpl.body,
        category: tpl.category,
        variables: tpl.variables,
        user_id: user?.id,
        updated_at: new Date().toISOString(),
      };

      if (tpl.id) {
        const { error } = await supabase.from('message_templates').update(payload).eq('id', tpl.id);
        if (error) throw error;
        toast.success('Template updated');
      } else {
        const { error } = await supabase.from('message_templates').insert({ ...payload, created_at: new Date().toISOString() });
        if (error) throw error;
        toast.success('Template saved');
      }
      setCreating(false);
      setEditing(null);
      loadTemplates();
    } catch {
      toast.error('Failed to save template');
    }
  }

  async function handleDelete(id: string) {
    try {
      await supabase.from('message_templates').delete().eq('id', id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  }

  const filtered = templates.filter((t) => {
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q) || (t.subject ?? '').toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  const emailCount = templates.filter((t) => t.type === 'email').length;
  const smsCount = templates.filter((t) => t.type === 'sms').length;
  const tcpaIssues = templates.filter((t) => t.type === 'sms' && !checkTCPA(t.body).compliant).length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-foreground">Message Templates</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Create and manage email &amp; SMS templates with variable insertion and TCPA compliance</p>
            </div>
          </div>
          <button
            onClick={() => { setEditing(null); setCreating(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            <Plus size={15} />
            New Template
          </button>
        </div>

        {creating ? (
          <TemplateEditor
            template={editing}
            allTemplates={templates}
            onSave={handleSave}
            onCancel={() => { setCreating(false); setEditing(null); }}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Templates', value: templates.length, icon: FileText, color: 'text-primary', bg: 'bg-primary/10' },
                { label: 'Email', value: emailCount, icon: Mail, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { label: 'SMS', value: smsCount, icon: MessageSquare, color: 'text-green-500', bg: 'bg-green-500/10' },
                { label: 'TCPA Issues', value: tcpaIssues, icon: AlertTriangle, color: tcpaIssues > 0 ? 'text-danger' : 'text-success', bg: tcpaIssues > 0 ? 'bg-danger/10' : 'bg-success/10' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                    <Icon size={16} className={color} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground">{value}</p>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* TCPA global warning */}
            {tcpaIssues > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/8 border border-danger/25 text-danger text-xs">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span><strong>{tcpaIssues} SMS template{tcpaIssues !== 1 ? 's' : ''}</strong> missing TCPA opt-out instructions. Sending non-compliant SMS may violate federal regulations.</span>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1">
                {(['all', 'email', 'sms'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${typeFilter === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {t === 'all' ? 'All' : t === 'email' ? 'Email' : 'SMS'}
                  </button>
                ))}
              </div>
            </div>

            {/* Template grid */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <FileText size={24} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">
                  {search || typeFilter !== 'all' ? 'No templates match your filters' : 'No templates yet'}
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  {search || typeFilter !== 'all' ? 'Try adjusting your search or filter.' : 'Create your first email or SMS template to get started.'}
                </p>
                {!search && typeFilter === 'all' && (
                  <button
                    onClick={() => { setEditing(null); setCreating(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Plus size={14} />
                    Create Template
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={() => { setEditing(t); setCreating(true); }}
                    onDelete={() => handleDelete(t.id)}
                    onPreview={() => setPreviewTemplate(t)}
                    onResolve={t.type === 'sms' ? () => setResolveTemplate(t) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {previewTemplate && (
        <PreviewModal template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
      )}

      {resolveTemplate && (
        <SMSResolutionPanel
          template={resolveTemplate}
          senderName={senderName}
          onClose={() => setResolveTemplate(null)}
        />
      )}
    </AppLayout>
  );
}
