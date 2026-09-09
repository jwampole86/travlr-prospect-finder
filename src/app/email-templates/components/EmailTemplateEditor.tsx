'use client';

import React, { useState, useCallback, useEffect } from 'react';
import type { EmailTemplate } from '../page';
import { CADENCE_STEPS, getCadenceStepLabel } from '@/lib/cadenceSteps';
import { useAuth } from '@/contexts/AuthContext';
import { resolveLocalBlurb } from '@/lib/localBlurbs';
import {
  Eye, EyeOff, Save, X, Plus, Trash2, GripVertical,
  Type, AlignLeft, Minus, Image as ImageIcon, ChevronDown, ChevronUp,
  Variable, Mail, Tag, Send, Loader2, CheckCircle, AlertCircle, Info,
  Lock, Edit3, AlertTriangle, Monitor, Smartphone,
} from 'lucide-react';

interface Block {
  id: string;
  type: 'heading' | 'text' | 'divider' | 'image' | 'button' | 'spacer';
  content: string;
}

// Phase 3: All template variables with resolution metadata
interface VariableDef {
  token: string;
  label: string;
  desc: string;
  resolveMode: 'auto' | 'manual' | 'required-auto';
  fallback?: string;
}

const VARIABLE_DEFS: VariableDef[] = [
  { token: '{{senderName}}',       label: 'Sender Name',      desc: 'Your name (auto from account)',                   resolveMode: 'required-auto' },
  { token: '{{contactName}}',      label: 'Contact Name',     desc: 'Lead first name (falls back to "there")',         resolveMode: 'auto', fallback: 'there' },
  { token: '{{address}}',          label: 'Property Address', desc: 'Lead property address (required — blocks send)',  resolveMode: 'required-auto' },
  { token: '{{localBlurb}}',       label: 'Local Blurb',      desc: 'City/state market description (auto-resolved)',   resolveMode: 'auto', fallback: "we're actively growing our footprint across the western and eastern US" },
  { token: '{{proposedRent}}',     label: 'Proposed Rent',    desc: 'Deal-specific — enter manually',                  resolveMode: 'manual' },
  { token: '{{leaseTerm}}',        label: 'Lease Term',       desc: 'Deal-specific — enter manually',                  resolveMode: 'manual' },
  { token: '{{proposedStartDate}}',label: 'Start Date',       desc: 'Deal-specific — enter manually',                  resolveMode: 'manual' },
  { token: '{{city}}',             label: 'City',             desc: 'Lead city (auto)',                                resolveMode: 'auto' },
  { token: '{{price}}',            label: 'Price/mo',         desc: 'Listing price',                                  resolveMode: 'auto' },
  { token: '{{beds}}',             label: 'Bedrooms',         desc: 'Bedroom count',                                  resolveMode: 'auto' },
  { token: '{{baths}}',            label: 'Bathrooms',        desc: 'Bathroom count',                                 resolveMode: 'auto' },
  { token: '{{source}}',           label: 'Lead Source',      desc: 'Where lead came from',                           resolveMode: 'auto' },
];

const CADENCE_CATEGORIES = CADENCE_STEPS.map(s => s.category);

const categoryColors: Record<string, string> = {
  initial_outreach: 'bg-blue-500/10 text-blue-600 border-blue-200',
  follow_up_1: 'bg-amber-500/10 text-amber-600 border-amber-200',
  check_in: 'bg-cyan-500/10 text-cyan-600 border-cyan-200',
  proposal_introduction: 'bg-purple-500/10 text-purple-600 border-purple-200',
  closing: 'bg-green-500/10 text-green-600 border-green-200',
};

function blockIcon(type: Block['type']) {
  switch (type) {
    case 'heading': return <Type size={13} />;
    case 'text': return <AlignLeft size={13} />;
    case 'divider': return <Minus size={13} />;
    case 'image': return <ImageIcon size={13} />;
    case 'button': return <Mail size={13} />;
    case 'spacer': return <ChevronDown size={13} />;
    default: return <AlignLeft size={13} />;
  }
}

function renderBlockPreview(block: Block, vars: Record<string, string>) {
  const fill = (s: string) => {
    let result = s;
    Object.entries(vars).forEach(([k, v]) => {
      result = result.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v);
    });
    return result;
  };

  switch (block.type) {
    case 'heading':
      return <h2 className="text-xl font-bold text-foreground mb-2">{fill(block.content)}</h2>;
    case 'text':
      return <p className="text-sm text-foreground/80 leading-relaxed mb-3 whitespace-pre-wrap">{fill(block.content)}</p>;
    case 'divider':
      return <hr className="border-border my-4" />;
    case 'image':
      return (
        <div className="w-full h-32 bg-muted rounded-lg flex items-center justify-center mb-3 border border-border">
          <ImageIcon size={24} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground ml-2">{fill(block.content) || 'Image placeholder'}</span>
        </div>
      );
    case 'button':
      return (
        <div className="mb-3">
          <button className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
            {fill(block.content) || 'Click here'}
          </button>
        </div>
      );
    case 'spacer':
      return <div className="h-6" />;
    default:
      return null;
  }
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function blocksToHtml(blocks: Block[], vars: Record<string, string>): string {
  const fill = (s: string) => {
    let result = s;
    Object.entries(vars).forEach(([k, v]) => {
      result = result.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v);
    });
    return result;
  };

  return blocks.map(block => {
    switch (block.type) {
      case 'heading': return `<h2 style="font-size:20px;font-weight:bold;margin-bottom:8px;">${fill(block.content)}</h2>`;
      case 'text': return `<p style="font-size:14px;line-height:1.6;margin-bottom:12px;white-space:pre-wrap;">${fill(block.content)}</p>`;
      case 'divider': return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />`;
      case 'image': return `<div style="width:100%;height:128px;background:#f3f4f6;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;"><span style="color:#9ca3af;">${fill(block.content) || 'Image placeholder'}</span></div>`;
      case 'button': return `<div style="margin-bottom:12px;"><a href="#" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">${fill(block.content) || 'Click here'}</a></div>`;
      case 'spacer': return `<div style="height:24px;"></div>`;
      default: return '';
    }
  }).join('\n');
}

/** Scan text for unresolved {{variable}} tokens */
function findUnresolvedTokens(text: string): string[] {
  const matches = text.match(/\{\{[^}]+\}\}/g) || [];
  return [...new Set(matches)];
}

/** Phase 3: Validate all variables before send */
interface ValidationResult {
  valid: boolean;
  blockedFields: string[];
  warnings: string[];
}

function validateBeforeSend(
  subject: string,
  blocks: Block[],
  resolvedVars: Record<string, string>,
  manualVars: Record<string, string>
): ValidationResult {
  const allContent = [subject, ...blocks.map(b => b.content)].join('\n');
  const allTokens = findUnresolvedTokens(allContent);

  const blockedFields: string[] = [];
  const warnings: string[] = [];

  // senderName is required-auto — block if missing
  if (!resolvedVars['{{senderName}}'] || resolvedVars['{{senderName}}'].trim() === '') {
    blockedFields.push('Sender Name ({{senderName}}) — not available from your account profile');
  }
  // address is required — block if used and missing
  if (allContent.includes('{{address}}') && (!resolvedVars['{{address}}'] || resolvedVars['{{address}}'].trim() === '')) {
    blockedFields.push('Property Address ({{address}}) — required but missing from this lead record');
  }

  // Check remaining unresolved tokens
  const mergedVars = { ...resolvedVars, ...manualVars };
  allTokens.forEach(token => {
    const value = mergedVars[token];
    if (!value || value.trim() === '') {
      const def = VARIABLE_DEFS.find(v => v.token === token);
      if (def?.resolveMode === 'manual') {
        if (!manualVars[token] || manualVars[token].trim() === '') {
          warnings.push(`${def.label} (${token}) — manual field not filled in`);
        }
      } else if (!blockedFields.some(f => f.includes(token))) {
        warnings.push(`${token} — unresolved`);
      }
    }
  });

  return {
    valid: blockedFields.length === 0,
    blockedFields,
    warnings,
  };
}

interface SendTestModalProps {
  subject: string;
  blocks: Block[];
  resolvedVars: Record<string, string>;
  manualVars: Record<string, string>;
  onClose: () => void;
}

function SendTestModal({ subject, blocks, resolvedVars, manualVars, onClose }: SendTestModalProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const mergedVars = { ...resolvedVars, ...manualVars };
  const validation = validateBeforeSend(subject, blocks, resolvedVars, manualVars);

  async function handleSend() {
    if (!email.trim() || !email.includes('@')) {
      setResult({ success: false, message: 'Please enter a valid email address.' });
      return;
    }
    if (!validation.valid) {
      setResult({ success: false, message: 'Cannot send — required fields are missing. See issues above.' });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const fill = (s: string) => {
        let r = s;
        Object.entries(mergedVars).forEach(([k, v]) => {
          r = r.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v);
        });
        return r;
      };

      const filledSubject = fill(subject) || 'Test Email from TRAVLR';
      const htmlBody = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          ${blocksToHtml(blocks, mergedVars)}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
          <p style="font-size:11px;color:#9ca3af;">This is a test email sent from TRAVLR Email Templates.</p>
        </div>
      `;

      const res = await fetch('/api/send-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email.trim(), subject: `[TEST] ${filledSubject}`, html: htmlBody }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResult({ success: true, message: `Test email sent to ${email}. Check your inbox.` });
      } else {
        setResult({ success: false, message: data.error || 'Failed to send test email.' });
      }
    } catch {
      setResult({ success: false, message: 'Network error. Please try again.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="send-test-title">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Send size={16} className="text-primary" />
            <h2 id="send-test-title" className="text-base font-semibold text-foreground">Send Test Email</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 min-h-[44px] flex items-center" aria-label="Close dialog"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Validation status */}
          {!validation.valid && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-red-500 shrink-0" />
                <p className="text-xs font-semibold text-red-600">Cannot send — required fields missing:</p>
              </div>
              {validation.blockedFields.map((f, i) => (
                <p key={i} className="text-xs text-red-500 pl-5">• {f}</p>
              ))}
            </div>
          )}
          {validation.valid && validation.warnings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                <p className="text-xs font-semibold text-amber-600">Manual fields not filled (will send as-is):</p>
              </div>
              {validation.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600 pl-5">• {w}</p>
              ))}
            </div>
          )}
          {validation.valid && validation.warnings.length === 0 && (
            <div className="bg-success/10 border border-success/30 rounded-xl p-3 flex items-center gap-2">
              <CheckCircle size={14} className="text-success shrink-0" />
              <p className="text-xs text-success font-medium">All variables resolved — ready to send</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="test-email" className="text-xs font-medium text-foreground">Send test to</label>
            <input
              id="test-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
          </div>

          {result && (
            <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs ${result.success ? 'bg-success/10 border border-success/30 text-success' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
              {result.success ? <CheckCircle size={13} className="mt-0.5 shrink-0" /> : <AlertCircle size={13} className="mt-0.5 shrink-0" />}
              {result.message}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]">Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending || !email.trim() || !validation.valid}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all min-h-[44px]"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Sending…' : 'Send Test'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  template: EmailTemplate | null;
  onSave: (tpl: Omit<EmailTemplate, 'id' | 'created_at'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function EmailTemplateEditor({ template, onSave, onCancel }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState(template?.name || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [category, setCategory] = useState(template?.category || 'initial_outreach');
  const [preview, setPreview] = useState(false);
  const [varPanelOpen, setVarPanelOpen] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [sendTestOpen, setSendTestOpen] = useState(false);
  const [manualVars, setManualVars] = useState<Record<string, string>>({});
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');

  // Resolve senderName fresh from the current session — never persisted from a previous sender
  const senderName = (() => {
    const meta = user?.user_metadata;
    const firstName = meta?.first_name || meta?.given_name || '';
    if (firstName.trim()) return firstName.trim();
    const fullName = meta?.full_name || meta?.name || '';
    if (fullName.trim()) return fullName.trim();
    const emailLocal = user?.email?.split('@')[0] || '';
    return emailLocal;
  })();

  // Phase 3: Auto-resolved variables (from account/session)
  // {{address}} and {{contactName}} are intentionally left empty here —
  // they resolve from the lead record at actual send time.
  const resolvedVars: Record<string, string> = {
    '{{senderName}}': senderName,
    '{{contactName}}': 'there',   // safe fallback for editor preview; real value from CRM at send time
    '{{address}}': '',             // required; must come from lead at send time — left blank in editor
    '{{localBlurb}}': resolveLocalBlurb().blurb, // neutral fallback for editor preview
    '{{city}}': 'Denver',
    '{{price}}': '$3,200/mo',
    '{{beds}}': '4',
    '{{baths}}': '2',
    '{{source}}': 'Zillow',
  };

  const previewVars = { ...resolvedVars, ...manualVars };

  const [blocks, setBlocks] = useState<Block[]>(() => {
    if (template?.body) {
      try {
        const parsed = JSON.parse(template.body);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [{ id: generateId(), type: 'text', content: template.body }];
      }
    }
    return [
      { id: generateId(), type: 'heading', content: 'Hi {{contactName}},' },
      { id: generateId(), type: 'text', content: "I came across your property at {{address}} and wanted to reach out about a short-term rental opportunity.\n\nAt TRAVLR, {{localBlurb}}, and your property looks like a great fit for our portfolio." },
      { id: generateId(), type: 'divider', content: '' },
      { id: generateId(), type: 'text', content: 'Best regards,\n{{senderName}}' },
    ];
  });

  const addBlock = useCallback((type: Block['type']) => {
    const defaults: Record<Block['type'], string> = {
      heading: 'New Heading',
      text: 'Enter your text here...',
      divider: '',
      image: '',
      button: 'Learn More',
      spacer: '',
    };
    const newBlock: Block = { id: generateId(), type, content: defaults[type] };
    setBlocks(prev => [...prev, newBlock]);
    setActiveBlockId(newBlock.id);
  }, []);

  const updateBlock = useCallback((id: string, content: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b));
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    setActiveBlockId(null);
  }, []);

  const moveBlock = useCallback((from: number, to: number) => {
    setBlocks(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  const insertVariable = useCallback((varToken: string) => {
    const activeBlock = blocks.find(b => b.id === activeBlockId);
    if (!activeBlock) return;
    updateBlock(activeBlockId!, activeBlock.content + varToken);
  }, [activeBlockId, blocks, updateBlock]);

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      id: template?.id,
      name: name.trim(),
      subject: subject.trim(),
      body: JSON.stringify(blocks),
      category,
    });
  }

  // Determine variable status for each variable used in template
  function getVariableStatus(token: string): 'resolved' | 'manual' | 'missing' | 'blocked' {
    const def = VARIABLE_DEFS.find(v => v.token === token);
    if (!def) return 'missing';
    if (def.resolveMode === 'manual') {
      return manualVars[token] ? 'resolved' : 'manual';
    }
    if (def.resolveMode === 'required-auto') {
      if (token === '{{senderName}}') return senderName ? 'resolved' : 'blocked';
      if (token === '{{address}}') return 'blocked'; // always needs lead data at send time — show as info
    }
    return 'resolved';
  }

  const allContent = [subject, ...blocks.map(b => b.content)].join('\n');
  const usedTokens = findUnresolvedTokens(allContent);
  const manualTokensInUse = usedTokens.filter(t => {
    const def = VARIABLE_DEFS.find(v => v.token === t);
    return def?.resolveMode === 'manual';
  });

  const BLOCK_TYPES: { type: Block['type']; label: string }[] = [
    { type: 'heading', label: 'Heading' },
    { type: 'text', label: 'Text' },
    { type: 'divider', label: 'Divider' },
    { type: 'image', label: 'Image' },
    { type: 'button', label: 'Button' },
    { type: 'spacer', label: 'Spacer' },
  ];

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">
      {/* Left: Block Palette + Variables — collapsible on mobile */}
      <div className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-border bg-muted/30 flex flex-col overflow-y-auto md:max-h-full">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Blocks</p>
        </div>
        <div className="p-3 grid grid-cols-3 md:grid-cols-2 gap-2">
          {BLOCK_TYPES.map(bt => (
            <button
              key={bt.type}
              onClick={() => addBlock(bt.type)}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-all text-center min-h-[44px]"
              aria-label={`Add ${bt.label} block`}
            >
              <span className="text-muted-foreground">{blockIcon(bt.type)}</span>
              <span className="text-[11px] font-medium text-foreground">{bt.label}</span>
            </button>
          ))}
        </div>

        {/* Variables Panel */}
        <div className="border-t border-border">
          <button
            onClick={() => setVarPanelOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
            aria-expanded={varPanelOpen}
          >
            <div className="flex items-center gap-2">
              <Variable size={13} className="text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Variables</span>
            </div>
            {varPanelOpen ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
          </button>
          {varPanelOpen && (
            <div className="px-3 pb-3 flex flex-col gap-1">
              {VARIABLE_DEFS.map(v => {
                const isUsed = allContent.includes(v.token);
                const status = isUsed ? getVariableStatus(v.token) : null;
                return (
                  <button
                    key={v.token}
                    onClick={() => insertVariable(v.token)}
                    disabled={!activeBlockId}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left group min-h-[44px]"
                    title={activeBlockId ? `Insert ${v.token}` : 'Select a block first'}
                    aria-label={`Insert variable ${v.label}`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <code className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0 self-start">{v.token}</code>
                      <span className="text-[10px] text-muted-foreground">{v.desc}</span>
                    </div>
                    {/* Status indicator */}
                    {isUsed && status === 'resolved' && <CheckCircle size={11} className="text-success shrink-0 mt-1" title="Resolved" />}
                    {isUsed && status === 'manual' && <Edit3 size={11} className="text-amber-500 shrink-0 mt-1" title="Manual input needed" />}
                    {isUsed && status === 'blocked' && <Info size={11} className="text-blue-500 shrink-0 mt-1" title="Resolved from lead at send time" />}
                    {v.resolveMode === 'manual' && <Lock size={10} className="text-muted-foreground/50 shrink-0 mt-1" title="Manual field" />}
                  </button>
                );
              })}
              {!activeBlockId && (
                <p className="text-[10px] text-muted-foreground italic px-2 mt-1">Click a block to insert variables</p>
              )}
            </div>
          )}
        </div>

        {/* Manual variable inputs (only shown when template uses them) */}
        {manualTokensInUse.length > 0 && (
          <div className="border-t border-border px-3 py-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Manual Fields</p>
            {manualTokensInUse.map(token => {
              const def = VARIABLE_DEFS.find(v => v.token === token);
              return (
                <div key={token} className="mb-2">
                  <label className="text-[10px] text-muted-foreground block mb-1">{def?.label || token}</label>
                  <input
                    type="text"
                    value={manualVars[token] || ''}
                    onChange={e => setManualVars(prev => ({ ...prev, [token]: e.target.value }))}
                    placeholder={`Enter ${def?.label || token}...`}
                    className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/30 min-h-[36px]"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Center: Editor / Preview */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-border bg-card shrink-0">
          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Template name..."
              className="text-sm font-semibold bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground min-w-[120px] max-w-[180px]"
              aria-label="Template name"
            />
            <div className="w-px h-4 bg-border hidden sm:block" />
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-card text-foreground outline-none min-h-[36px]"
              aria-label="Template category / cadence step"
            >
              {CADENCE_STEPS.map(s => (
                <option key={s.category} value={s.category}>{s.step}. {s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setSendTestOpen(true)}
              disabled={blocks.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all min-h-[36px]"
              title="Send a test email"
            >
              <Send size={13} className="text-primary" />
              <span className="hidden sm:inline">Send Test</span>
            </button>
            <button
              onClick={() => setPreview(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all min-h-[36px] ${preview ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted'}`}
              aria-pressed={preview}
            >
              {preview ? <EyeOff size={13} /> : <Eye size={13} />}
              <span className="hidden sm:inline">{preview ? 'Edit' : 'Preview'}</span>
            </button>
            <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground min-h-[36px] flex items-center" aria-label="Cancel editing">
              <X size={16} />
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[36px]"
            >
              <Save size={13} />
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* Subject line */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-border bg-card/50 shrink-0 flex items-center gap-3">
          <label htmlFor="email-subject" className="text-xs font-medium text-muted-foreground w-14 shrink-0">Subject:</label>
          <input
            id="email-subject"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Email subject line... (use {{contactName}}, {{address}})"
            className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/20">
          {preview ? (
            <div className="max-w-2xl mx-auto space-y-3">
              {/* Viewport toggle */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                  <button
                    onClick={() => setPreviewViewport('desktop')}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-colors ${previewViewport === 'desktop' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                  >
                    <Monitor size={12} />Desktop
                  </button>
                  <button
                    onClick={() => setPreviewViewport('mobile')}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-colors ${previewViewport === 'mobile' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                  >
                    <Smartphone size={12} />Mobile
                  </button>
                </div>
              </div>
              <div className={`bg-card rounded-xl border border-border shadow-sm p-6 sm:p-8 transition-all ${previewViewport === 'mobile' ? 'max-w-[375px] mx-auto' : ''}`}>
                <div className="mb-4 pb-3 border-b border-border">
                  <p className="text-xs text-muted-foreground">Subject:</p>
                  <p className="text-sm font-semibold text-foreground">
                    {(() => {
                      let s = subject;
                      Object.entries(previewVars).forEach(([k, v]) => {
                        s = s.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v);
                      });
                      return s || '(no subject)';
                    })()}
                  </p>
                </div>
                {blocks.map(block => (
                  <div key={block.id}>{renderBlockPreview(block, previewVars)}</div>
                ))}
                <div className="mt-6 pt-4 border-t border-border">
                  <p className="text-[10px] text-muted-foreground">Preview with sample data — senderName from your account</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto flex flex-col gap-2">
              {blocks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Plus size={32} className="text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">Add blocks from the left panel to start building your template</p>
                </div>
              )}
              {blocks.map((block, idx) => (
                <div
                  key={block.id}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                  onDrop={() => {
                    if (dragIdx !== null && dragIdx !== idx) moveBlock(dragIdx, idx);
                    setDragIdx(null); setDragOverIdx(null);
                  }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  onClick={() => setActiveBlockId(block.id)}
                  className={`group relative flex items-start gap-2 p-3 rounded-xl border-2 bg-card cursor-pointer transition-all ${
                    activeBlockId === block.id
                      ? 'border-primary shadow-sm'
                      : dragOverIdx === idx
                      ? 'border-primary/40 bg-primary/5' :'border-transparent hover:border-border'
                  }`}
                >
                  <div className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" aria-hidden="true">
                    <GripVertical size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-muted-foreground">{blockIcon(block.type)}</span>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{block.type}</span>
                    </div>
                    {block.type === 'divider' ? (
                      <hr className="border-border" />
                    ) : block.type === 'spacer' ? (
                      <div className="h-4 bg-muted/50 rounded border border-dashed border-border flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground">Spacer</span>
                      </div>
                    ) : (
                      <textarea
                        value={block.content}
                        onChange={e => updateBlock(block.id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onFocus={() => setActiveBlockId(block.id)}
                        rows={block.type === 'heading' ? 1 : 3}
                        placeholder={block.type === 'heading' ? 'Heading text...' : block.type === 'button' ? 'Button label...' : 'Block content...'}
                        className={`w-full bg-transparent border-none outline-none resize-none text-foreground placeholder:text-muted-foreground/60 ${
                          block.type === 'heading' ? 'text-lg font-bold' : 'text-sm leading-relaxed'
                        }`}
                        aria-label={`${block.type} block content`}
                      />
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); removeBlock(block.id); }}
                    className="opacity-0 group-hover:opacity-100 mt-1 p-1 rounded hover:bg-danger/10 hover:text-danger text-muted-foreground transition-all shrink-0"
                    aria-label="Remove block"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Template Info — hidden on small screens */}
      <div className="hidden lg:flex w-48 shrink-0 border-l border-border bg-card flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Template Info</p>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Cadence Step</p>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${categoryColors[category] || 'bg-muted text-muted-foreground border-border'}`}>
              <Tag size={10} />
              {getCadenceStepLabel(category)}
            </span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Blocks</p>
            <p className="text-2xl font-bold text-foreground">{blocks.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Variable Status</p>
            <div className="flex flex-col gap-1.5">
              {VARIABLE_DEFS.map(v => {
                const used = allContent.includes(v.token) || subject.includes(v.token);
                if (!used) return null;
                const status = getVariableStatus(v.token);
                return (
                  <div key={v.token} className="flex items-center gap-1.5 text-[10px]">
                    {status === 'resolved' && <CheckCircle size={10} className="text-success shrink-0" />}
                    {status === 'manual' && <Edit3 size={10} className="text-amber-500 shrink-0" />}
                    {status === 'blocked' && <Info size={10} className="text-blue-500 shrink-0" />}
                    {status === 'missing' && <AlertCircle size={10} className="text-red-500 shrink-0" />}
                    <code className={`font-mono text-[9px] ${status === 'resolved' ? 'text-success' : status === 'manual' ? 'text-amber-500' : status === 'blocked' ? 'text-blue-500' : 'text-red-500'}`}>{v.token}</code>
                  </div>
                );
              })}
              {usedTokens.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50 italic">No variables used</p>
              )}
            </div>
          </div>
          <div className="pt-2 border-t border-border">
            <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1"><CheckCircle size={9} className="text-success" /> Auto-resolved</div>
              <div className="flex items-center gap-1"><Info size={9} className="text-blue-500" /> From lead at send</div>
              <div className="flex items-center gap-1"><Edit3 size={9} className="text-amber-500" /> Manual input</div>
            </div>
          </div>
          <div className="pt-2 border-t border-border">
            <button
              onClick={() => setSendTestOpen(true)}
              disabled={blocks.length === 0}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all min-h-[44px]"
            >
              <Send size={12} />
              Send Test Email
            </button>
          </div>
        </div>
      </div>

      {sendTestOpen && (
        <SendTestModal
          subject={subject}
          blocks={blocks}
          resolvedVars={resolvedVars}
          manualVars={manualVars}
          onClose={() => setSendTestOpen(false)}
        />
      )}
    </div>
  );
}
