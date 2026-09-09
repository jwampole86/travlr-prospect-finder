'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { MessageSquare, Copy, Plus, Shield, AlertTriangle, Info, ChevronDown, ChevronUp, Edit3, X, Save, Loader2, Search, Tag, Eye, Star, Clock, Users, Lock } from 'lucide-react';
import { SMS_TEMPLATE_SEEDS, type SMSTemplateSeed } from '@/lib/smsTemplateSeeds';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomTemplate extends SMSTemplateSeed {
  id: string;
  isCustom: true;
  clonedFrom?: string;
  createdBy: string;
  createdAt: string;
  rating?: number;
  usageCount: number;
}

type AnyTemplate = (SMSTemplateSeed & { id: string; isCustom: false; usageCount: number; rating: number }) | CustomTemplate;

// ─── Compliance Notes ─────────────────────────────────────────────────────────

const COMPLIANCE_NOTES: Record<string, { rule: string; detail: string; severity: 'info' | 'warning' | 'required' }[]> = {
  outreach: [
    { rule: 'TCPA Consent Required', detail: 'Prior express written consent is required before sending marketing SMS. Ensure lead opted in via web form or verbal consent documented in CRM.', severity: 'required' },
    { rule: 'Business Hours Only', detail: 'Send only between 8 AM – 9 PM recipient local time (TCPA §227.1). Automated sends outside this window may result in violations.', severity: 'warning' },
    { rule: 'Identify Your Business', detail: 'Message must identify the sender and business name. This template includes {{senderName}} — do not remove it.', severity: 'info' },
  ],
  'follow up': [
    { rule: 'Honor Previous Opt-Outs', detail: 'Before sending follow-ups, verify the lead has not previously replied STOP, QUIT, CANCEL, UNSUBSCRIBE, or END.', severity: 'required' },
    { rule: 'Frequency Limits', detail: 'Best practice: no more than 3 unsolicited messages per week. Excessive messaging may trigger carrier filtering.', severity: 'warning' },
    { rule: 'Quiet Hours', detail: 'Respect quiet hours (9 PM – 8 AM local time). Automated cadences must check recipient timezone.', severity: 'info' },
  ],
  proposal: [
    { rule: 'Material Terms Disclosure', detail: 'Proposal SMS must not misrepresent terms. Ensure {{proposedRent}}, {{leaseTerm}}, and {{proposedStartDate}} are accurate before sending.', severity: 'required' },
    { rule: 'Not a Binding Contract', detail: 'SMS proposals are not legally binding. Always follow up with a formal written agreement via DocuSign.', severity: 'info' },
  ],
  closing: [
    { rule: 'Confirm Consent for Closing Comms', detail: 'Closing messages may contain sensitive deal information. Confirm the recipient is the authorized property owner.', severity: 'required' },
    { rule: 'Document Sent Timestamp', detail: 'Log the exact time the closing SMS was sent for compliance records. This is auto-logged in the Audit Trail.', severity: 'info' },
  ],
};

const STOP_HANDLING_NOTES = [
  { keyword: 'STOP', action: 'Immediately unsubscribes the number from all future messages. Automated — no agent action required.' },
  { keyword: 'QUIT', action: 'Treated identically to STOP. Number added to opt-out list within 10 seconds.' },
  { keyword: 'CANCEL', action: 'Treated identically to STOP. Carrier-level opt-out honored.' },
  { keyword: 'UNSUBSCRIBE', action: 'Treated identically to STOP. Lead record is flagged with sms_opted_out = true.' },
  { keyword: 'END', action: 'Treated identically to STOP.' },
  { keyword: 'HELP', action: 'Auto-replies with: "For help, contact support@travlr.com. Reply STOP to unsubscribe."' },
  { keyword: 'INFO', action: 'Auto-replies with business name, contact info, and opt-out instructions.' },
];

// ─── Seed templates with IDs ──────────────────────────────────────────────────

const BASE_TEMPLATES: AnyTemplate[] = SMS_TEMPLATE_SEEDS.map((t, i) => ({
  ...t,
  id: `seed-${i}`,
  isCustom: false as const,
  usageCount: [142, 98, 67, 34, 21][i] ?? 10,
  rating: [4.8, 4.5, 4.2, 4.6, 4.9][i] ?? 4.0,
}));

const TAG_COLORS: Record<string, string> = {
  outreach:   'bg-blue-500/10 text-blue-700 border-blue-200',
  'follow up': 'bg-amber-500/10 text-amber-700 border-amber-200',
  proposal:   'bg-violet-500/10 text-violet-700 border-violet-200',
  closing:    'bg-emerald-500/10 text-emerald-700 border-emerald-200',
};

// ─── Clone Modal ──────────────────────────────────────────────────────────────

interface CloneModalProps {
  template: AnyTemplate;
  onClose: () => void;
  onSave: (t: CustomTemplate) => void;
}

function CloneModal({ template, onClose, onSave }: CloneModalProps) {
  const [name, setName] = useState(`${template.name} (Custom)`);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const charCount = body.length;
  const segmentCount = Math.ceil(charCount / 160);

  function handleSave() {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    setTimeout(() => {
      const custom: CustomTemplate = {
        ...template,
        id: `custom-${Date.now()}`,
        name,
        body,
        isCustom: true,
        clonedFrom: template.name,
        createdBy: 'Current User',
        createdAt: new Date().toISOString(),
        usageCount: 0,
      };
      onSave(custom);
      setSaving(false);
    }, 600);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Copy size={15} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">Clone & Customize Template</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
            <Info size={13} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700">
              Cloning from: <span className="font-semibold">{template.name}</span>. Your customized version is saved privately and does not affect the original compliance-approved template.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground">Message Body</label>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono ${charCount > 320 ? 'text-red-600' : charCount > 160 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {charCount} chars · {segmentCount} segment{segmentCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['{{contactName}}', '{{senderName}}', '{{address}}', '{{localBlurb}}'].map(v => (
                <button
                  key={v}
                  onClick={() => setBody(b => b + v)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors font-mono"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Compliance reminder */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100">
            <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">
              Ensure your customized message still includes opt-out language and complies with TCPA. Do not remove sender identification or add misleading claims.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-xs border border-border rounded-lg hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !body.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save Custom Template
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: AnyTemplate;
  onClone: (t: AnyTemplate) => void;
}

function TemplateCard({ template, onClone }: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);
  const complianceNotes = COMPLIANCE_NOTES[template.tag] ?? [];
  const charCount = template.body.length;
  const segmentCount = Math.ceil(charCount / 160);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${template.isCustom ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${TAG_COLORS[template.tag] ?? 'bg-muted text-muted-foreground border-border'}`}>
              {template.tag}
            </span>
            {template.isCustom && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                Custom
              </span>
            )}
            {!template.isCustom && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200 font-medium">
                <Shield size={9} />Compliance-Approved
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
          {template.isCustom && template.clonedFrom && (
            <p className="text-[11px] text-muted-foreground mt-0.5">Cloned from: {template.clonedFrom}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Star size={10} className="text-amber-500 fill-amber-500" />
            {template.rating?.toFixed(1) ?? '—'}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Users size={10} />
            {template.usageCount}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock size={10} />
            {segmentCount} seg
          </div>
        </div>
      </div>

      {/* Body Preview */}
      <div className="px-4 pb-3">
        <div
          className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 cursor-pointer hover:bg-muted/60 transition-colors leading-relaxed"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? template.body : template.body.slice(0, 140) + (template.body.length > 140 ? '…' : '')}
        </div>
        {template.body.length > 140 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[11px] text-primary mt-1.5 hover:underline"
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? 'Collapse' : 'Show full message'}
          </button>
        )}
      </div>

      {/* Variables */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {template.requiredVars.map(v => (
          <span
            key={v}
            className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${template.blockingVars.includes(v) ? 'bg-red-50 text-red-700 border-red-200' : 'bg-muted text-muted-foreground border-border'}`}
          >
            {v}
            {template.blockingVars.includes(v) && <span className="ml-1 text-red-500">*</span>}
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground self-center">* = required to send</span>
      </div>

      {/* Compliance Toggle */}
      {complianceNotes.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowCompliance(v => !v)}
            className="flex items-center gap-1.5 text-[11px] text-amber-700 hover:text-amber-800 transition-colors"
          >
            <Shield size={11} />
            {showCompliance ? 'Hide' : 'View'} compliance notes ({complianceNotes.length})
            {showCompliance ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {showCompliance && (
            <div className="mt-2 space-y-2">
              {complianceNotes.map((note, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border text-[11px] ${
                    note.severity === 'required' ? 'bg-red-50 border-red-100' :
                    note.severity === 'warning'? 'bg-amber-50 border-amber-100' : 'bg-blue-50 border-blue-100'
                  }`}
                >
                  {note.severity === 'required' ? <Lock size={11} className="text-red-600 shrink-0 mt-0.5" /> :
                   note.severity === 'warning' ? <AlertTriangle size={11} className="text-amber-600 shrink-0 mt-0.5" /> :
                   <Info size={11} className="text-blue-600 shrink-0 mt-0.5" />}
                  <div>
                    <p className={`font-semibold mb-0.5 ${note.severity === 'required' ? 'text-red-700' : note.severity === 'warning' ? 'text-amber-700' : 'text-blue-700'}`}>
                      {note.rule}
                    </p>
                    <p className={note.severity === 'required' ? 'text-red-600' : note.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}>
                      {note.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/20">
        <button
          onClick={() => onClone(template)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Copy size={11} />Clone & Customize
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border bg-background text-xs rounded-lg hover:bg-muted transition-colors">
          <Eye size={11} />Preview
        </button>
        {template.isCustom && (
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border bg-background text-xs rounded-lg hover:bg-muted transition-colors">
            <Edit3 size={11} />Edit
          </button>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground font-mono">{charCount} chars</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SMSCadenceTemplatesPage() {
  const [templates, setTemplates] = useState<AnyTemplate[]>(BASE_TEMPLATES);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'standard' | 'custom'>('all');
  const [cloneTarget, setCloneTarget] = useState<AnyTemplate | null>(null);
  const [showStopHandling, setShowStopHandling] = useState(false);

  const filtered = templates.filter(t => {
    if (tagFilter !== 'all' && t.tag !== tagFilter) return false;
    if (typeFilter === 'standard' && t.isCustom) return false;
    if (typeFilter === 'custom' && !t.isCustom) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    }
    return true;
  });

  const customCount = templates.filter(t => t.isCustom).length;
  const standardCount = templates.filter(t => !t.isCustom).length;

  function handleSaveClone(custom: CustomTemplate) {
    setTemplates(prev => [custom, ...prev]);
    setCloneTarget(null);
  }

  const tags = ['all', 'outreach', 'follow up', 'proposal', 'closing'];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <MessageSquare size={16} className="text-violet-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">SMS Cadence Templates</h1>
              <p className="text-xs text-muted-foreground">Pre-built, compliance-safe templates with regulatory notes and one-click clone-and-customize</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStopHandling(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs hover:bg-amber-100 transition-all"
            >
              <Shield size={12} />STOP / Opt-Out Handling
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-all">
              <Plus size={12} />New Template
            </button>
          </div>
        </div>

        {/* STOP Handling Panel */}
        {showStopHandling && (
          <div className="mx-6 mt-4 border border-amber-200 rounded-xl bg-amber-50 overflow-hidden shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">STOP / Unsubscribe Keyword Handling</p>
              </div>
              <button onClick={() => setShowStopHandling(false)} className="p-1 rounded hover:bg-amber-100 text-amber-600"><X size={13} /></button>
            </div>
            <div className="p-4">
              <p className="text-[11px] text-amber-700 mb-3">
                All inbound SMS replies are monitored for opt-out keywords. When detected, the number is immediately added to the opt-out list and all future messages are blocked. This is handled automatically at the Twilio webhook layer — no agent action required.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {STOP_HANDLING_NOTES.map(note => (
                  <div key={note.keyword} className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-amber-100">
                    <span className="text-[11px] font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded shrink-0">{note.keyword}</span>
                    <p className="text-[11px] text-amber-700">{note.action}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-2 p-2.5 bg-red-50 rounded-lg border border-red-100">
                <Lock size={11} className="text-red-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-700">
                  <span className="font-semibold">Legal requirement:</span> Under TCPA and CTIA guidelines, opt-out requests must be honored within 10 business days. This system processes them in real-time. Attempting to re-message an opted-out number is a federal violation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Strip */}
        <div className="flex items-center gap-4 px-6 py-2.5 border-b border-border bg-muted/30 shrink-0 mt-0">
          {[
            { label: 'Standard Templates', value: standardCount, color: 'text-foreground' },
            { label: 'Custom Templates', value: customCount, color: 'text-primary' },
            { label: 'Showing', value: filtered.length, color: 'text-muted-foreground' },
          ].map(stat => (
            <div key={stat.label} className="flex items-center gap-1.5">
              <span className={`text-sm font-bold ${stat.color}`}>{stat.value}</span>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <span className="text-border ml-2">|</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card/50 shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Tag Filter */}
          <div className="flex items-center gap-1.5">
            {tags.map(tag => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                  tagFilter === tag
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                {tag === 'all' ? 'All Tags' : tag}
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 ml-auto">
            {(['all', 'standard', 'custom'] as const).map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                  typeFilter === type
                    ? 'bg-primary/10 text-primary border border-primary/30' :'border border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {type === 'all' ? 'All Types' : type === 'standard' ? 'Standard' : 'My Custom'}
              </button>
            ))}
          </div>
        </div>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <MessageSquare size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">No templates match your filters</p>
              <p className="text-xs text-muted-foreground">Try adjusting your search or filter criteria.</p>
            </div>
          ) : (
            <div className="max-w-4xl grid grid-cols-1 gap-4">
              {filtered.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onClone={setCloneTarget}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Clone Modal */}
      {cloneTarget && (
        <CloneModal
          template={cloneTarget}
          onClose={() => setCloneTarget(null)}
          onSave={handleSaveClone}
        />
      )}
    </AppLayout>
  );
}
