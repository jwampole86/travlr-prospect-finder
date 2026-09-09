'use client';

import React, { useState, useMemo } from 'react';
import { Eye, X, AlertCircle, CheckCircle2, AlertTriangle, Monitor, Smartphone, Mail, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { resolveLocalBlurb } from '@/lib/localBlurbs';
import PreSendChecklist from './PreSendChecklist';

interface VariableStatus {
  token: string;
  label: string;
  resolved: boolean;
  value: string;
  mode: 'auto' | 'manual' | 'missing';
}

interface EmailPreviewPanelProps {
  subject: string;
  body: string;
  sampleLead?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    price?: number;
    beds?: number;
    baths?: number;
    source?: string;
    enrichmentStage?: 0 | 1 | 2 | 3;
  };
  mode: 'email' | 'sms';
  onClose: () => void;
  /** Number of leads selected for bulk send — shows warning if >100 */
  bulkCount?: number;
}

const VARIABLE_MAP: Record<string, { label: string; mode: 'auto' | 'manual' }> = {
  '{{senderName}}':        { label: 'Sender Name',    mode: 'auto' },
  '{{contactName}}':       { label: 'Contact Name',   mode: 'auto' },
  '{{address}}':           { label: 'Property Address', mode: 'auto' },
  '{{localBlurb}}':        { label: 'Local Blurb',    mode: 'auto' },
  '{{proposedRent}}':      { label: 'Proposed Rent',  mode: 'manual' },
  '{{leaseTerm}}':         { label: 'Lease Term',     mode: 'manual' },
  '{{proposedStartDate}}': { label: 'Start Date',     mode: 'manual' },
  '{{city}}':              { label: 'City',           mode: 'auto' },
  '{{price}}':             { label: 'Price/mo',       mode: 'auto' },
  '{{beds}}':              { label: 'Bedrooms',       mode: 'auto' },
  '{{baths}}':             { label: 'Bathrooms',      mode: 'auto' },
  '{{source}}':            { label: 'Lead Source',    mode: 'auto' },
  '{name}':                { label: 'Name (SMS)',     mode: 'auto' },
  '{agent}':               { label: 'Agent (SMS)',    mode: 'auto' },
};

function resolveSenderName(user: ReturnType<typeof useAuth>['user']): string {
  const meta = user?.user_metadata;
  const firstName = meta?.first_name || meta?.given_name || '';
  if (firstName.trim()) return firstName.trim();
  const fullName = meta?.full_name || meta?.name || '';
  if (fullName.trim()) return fullName.trim();
  return user?.email?.split('@')[0] || '';
}

function resolveVariables(
  text: string,
  lead: EmailPreviewPanelProps['sampleLead'],
  senderName: string
): { resolved: string; statuses: VariableStatus[] } {
  // Resolve localBlurb from lead's city/state
  const { blurb: localBlurb } = resolveLocalBlurb(lead?.city, lead?.state);

  const sampleValues: Record<string, string> = {
    '{{senderName}}':        senderName,
    '{{contactName}}':       lead?.name || 'there',
    '{{address}}':           lead?.address || '',
    '{{localBlurb}}':        localBlurb,
    '{{proposedRent}}':      '',
    '{{leaseTerm}}':         '',
    '{{proposedStartDate}}': '',
    '{{city}}':              lead?.city || 'Denver',
    '{{price}}':             lead?.price ? `$${lead.price.toLocaleString()}` : '$2,400',
    '{{beds}}':              lead?.beds?.toString() || '3',
    '{{baths}}':             lead?.baths?.toString() || '2',
    '{{source}}':            lead?.source || 'Trulia',
    '{name}':                lead?.name || 'there',
    '{agent}':               senderName,
  };

  // Find all tokens in text
  const tokenPattern = /\{\{[^}]+\}\}|\{[^}]+\}/g;
  const foundTokens = [...new Set(text.match(tokenPattern) || [])];

  const statuses: VariableStatus[] = foundTokens.map(token => {
    const def = VARIABLE_MAP[token];
    const value = sampleValues[token] ?? '';
    const resolved = value.trim() !== '';
    return {
      token,
      label: def?.label || token,
      resolved,
      value: resolved ? value : token,
      mode: !resolved ? 'missing' : (def?.mode || 'auto'),
    };
  });

  let resolvedText = text;
  Object.entries(sampleValues).forEach(([token, value]) => {
    if (value) {
      resolvedText = resolvedText.replace(
        new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'),
        value
      );
    }
  });

  return { resolved: resolvedText, statuses };
}

function highlightUnresolved(text: string): React.ReactNode[] {
  const parts = text.split(/(\{\{[^}]+\}\}|\{[^}]+\})/g);
  return parts.map((part, i) => {
    if (/^\{\{[^}]+\}\}$/.test(part) || /^\{[^}]+\}$/.test(part)) {
      return (
        <mark key={i} className="bg-red-200 text-red-800 rounded px-0.5 font-mono text-xs">
          {part}
        </mark>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default function EmailPreviewPanel({ subject, body, sampleLead, mode, onClose, bulkCount }: EmailPreviewPanelProps) {
  const { user } = useAuth();
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [showRaw, setShowRaw] = useState(false);

  // Re-resolve senderName from the current logged-in user every render — never stale
  const senderName = resolveSenderName(user);

  const { resolved: resolvedBody, statuses } = useMemo(
    () => resolveVariables(body, sampleLead, senderName),
    [body, sampleLead, senderName]
  );

  const { resolved: resolvedSubject } = useMemo(
    () => resolveVariables(subject, sampleLead, senderName),
    [subject, sampleLead, senderName]
  );

  const unresolvedCount = statuses.filter(s => !s.resolved).length;
  const resolvedCount = statuses.filter(s => s.resolved).length;
  const manualCount = statuses.filter(s => s.mode === 'manual' && !s.resolved).length;

  // Identify send-blocking issues: senderName missing or address missing
  const sendBlockers: string[] = [];
  if (!senderName.trim()) sendBlockers.push('Sender Name — not found in your account profile');
  const addressStatus = statuses.find(s => s.token === '{{address}}');
  if (addressStatus && !addressStatus.resolved) sendBlockers.push('Property Address — required but missing from this lead');

  const hasAddress = !!(sampleLead?.address && sampleLead.address.trim());
  const hasContactName = !!(sampleLead?.name && sampleLead.name.trim() && sampleLead.name !== 'there');
  const enrichmentStage = (sampleLead?.enrichmentStage ?? 0) as 0 | 1 | 2 | 3;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mode === 'email' ? 'bg-blue-500/10' : 'bg-purple-500/10'}`}>
              {mode === 'email' ? <Mail size={15} className="text-blue-500" /> : <MessageSquare size={15} className="text-purple-500" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {mode === 'email' ? 'Email' : 'SMS'} Preview
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Sample lead · all variables resolved · unresolved tokens highlighted
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X size={15} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">

            {/* Pre-Send Checklist */}
            <PreSendChecklist
              hasAddress={hasAddress}
              hasContactName={hasContactName}
              variableStatuses={statuses}
              enrichmentStage={enrichmentStage}
              bulkCount={bulkCount}
            />

            {/* Send-blocking errors */}
            {sendBlockers.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <AlertCircle size={13} className="text-red-600 shrink-0" />
                  <p className="text-xs font-semibold text-red-700">Send blocked — required fields missing:</p>
                </div>
                {sendBlockers.map((b, i) => (
                  <p key={i} className="text-xs text-red-600 pl-5">• {b}</p>
                ))}
              </div>
            )}

            {/* Variable status summary */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 size={11} className="text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700">{resolvedCount} resolved</span>
              </div>
              {unresolvedCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={11} className="text-red-600" />
                  <span className="text-xs font-medium text-red-700">{unresolvedCount} unresolved</span>
                </div>
              )}
              {manualCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle size={11} className="text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">{manualCount} manual field{manualCount > 1 ? 's' : ''} empty</span>
                </div>
              )}
            </div>

            {/* Variable status table */}
            {statuses.length > 0 && (
              <div className="bg-muted/30 border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border bg-muted/50">
                  <p className="text-xs font-semibold text-foreground">Variable Status</p>
                </div>
                <div className="divide-y divide-border">
                  {statuses.map(s => (
                    <div key={s.token} className="flex items-center gap-3 px-4 py-2">
                      <span className="font-mono text-[10px] text-muted-foreground w-36 shrink-0">{s.token}</span>
                      <span className="text-xs text-muted-foreground flex-1">{s.label}</span>
                      {s.resolved ? (
                        <span className="text-xs text-emerald-600 font-medium truncate max-w-[120px]">{s.value}</span>
                      ) : (
                        <span className="text-xs text-red-500 font-medium">⚠ Not resolved</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        s.mode === 'missing' ? 'bg-red-100 text-red-600' :
                        s.mode === 'manual'  ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {s.mode === 'missing' ? 'missing' : s.mode}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Viewport toggle (email only) */}
            {mode === 'email' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Preview:</span>
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                  <button
                    onClick={() => setViewport('desktop')}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-colors ${viewport === 'desktop' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                  >
                    <Monitor size={12} />Desktop
                  </button>
                  <button
                    onClick={() => setViewport('mobile')}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-colors ${viewport === 'mobile' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                  >
                    <Smartphone size={12} />Mobile
                  </button>
                </div>
                <button
                  onClick={() => setShowRaw(v => !v)}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Eye size={11} />
                  {showRaw ? 'Show rendered' : 'Show raw'}
                </button>
              </div>
            )}

            {/* Preview frame */}
            <div className={`border border-border rounded-xl overflow-hidden bg-white transition-all ${mode === 'email' && viewport === 'mobile' ? 'max-w-[375px] mx-auto' : 'w-full'}`}>
              {mode === 'email' ? (
                <div>
                  {/* Email header bar */}
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-gray-500 w-12">From:</span>
                      <span className="text-xs text-gray-700">{senderName || 'Unknown Sender'} &lt;{user?.email || 'agent@travlr.com'}&gt;</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-12">Subject:</span>
                      <span className="text-xs font-medium text-gray-900">
                        {showRaw ? subject : resolvedSubject || '(No subject)'}
                      </span>
                    </div>
                  </div>
                  {/* Email body */}
                  <div className="p-5">
                    {showRaw ? (
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">{body}</pre>
                    ) : (
                      <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {highlightUnresolved(resolvedBody)}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* SMS bubble */
                <div className="p-5 bg-gray-100 min-h-[120px] flex items-end justify-end">
                  <div className="max-w-[80%] bg-blue-500 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
                    {showRaw ? body : (
                      <span className="whitespace-pre-wrap">{highlightUnresolved(resolvedBody)}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
