import React from 'react';
import { AlertTriangle, Eye, FileWarning, Mail, MessageSquare, Save, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { EmptyState, ErrorBanner, Panel, SegmentedTabs, StatusPill, buttonPrimary, buttonSecondary, inputClass } from '@/components/ops';
import {
  EMAIL_VARIABLES,
  SMS_VARIABLES,
  analyzeTemplateCompatibility,
  buildEmailPreviewResults,
  buildSmsPreviewResult,
  humanizeToken,
  type DraftTemplate,
  type EmailPreviewMode,
  type PreviewLead,
  type TemplateChannel,
} from '../lib';

interface TemplateEditorPanelProps {
  draft: DraftTemplate | null;
  previewLead: PreviewLead | null;
  senderName: string;
  previewMode: EmailPreviewMode | 'bulk-sms';
  saving: boolean;
  deleting: boolean;
  error: string | null;
  previewLeads: PreviewLead[];
  onFieldChange: <K extends keyof DraftTemplate>(key: K, value: DraftTemplate[K]) => void;
  onInsertVariable: (token: string) => void;
  onPreviewLeadChange: (leadId: string) => void;
  onPreviewModeChange: (mode: EmailPreviewMode | 'bulk-sms') => void;
  onNormalizeSms: () => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export default function TemplateEditorPanel({
  draft,
  previewLead,
  senderName,
  previewMode,
  saving,
  deleting,
  error,
  previewLeads,
  onFieldChange,
  onInsertVariable,
  onPreviewLeadChange,
  onPreviewModeChange,
  onNormalizeSms,
  onSave,
  onDelete,
  onCancel,
}: TemplateEditorPanelProps) {
  if (!draft) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Choose a template to inspect or create a new one"
        hint="This editor now reads and writes the real Supabase template tables, and previews each message with the same merge logic the live send flows use."
      />
    );
  }

  const compatibility = analyzeTemplateCompatibility(draft.channel, draft.subject, draft.body);
  const preview = previewLead
    ? draft.channel === 'email'
      ? buildEmailPreviewResults(draft, previewLead, senderName).find((item) => item.mode === previewMode)
      : buildSmsPreviewResult(draft, previewLead)
    : null;
  const variables = draft.channel === 'email' ? EMAIL_VARIABLES : SMS_VARIABLES;

  return (
    <div className="space-y-4">
      <Panel
        title={draft.id ? 'Edit template' : 'New template'}
        icon={draft.channel === 'email' ? Mail : MessageSquare}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {draft.channel === 'sms' && (
              <button type="button" onClick={onNormalizeSms} className={buttonSecondary}>
                <Wand2 size={14} /> Normalize legacy vars
              </button>
            )}
            {draft.id && (
              <button type="button" onClick={onDelete} disabled={deleting} className={buttonSecondary}>
                <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <button type="button" onClick={onCancel} className={buttonSecondary}>
              Cancel
            </button>
            <button type="button" onClick={onSave} disabled={saving} className={buttonPrimary}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && <ErrorBanner message={error} />}
          {compatibility.blockingTokens.length > 0 && (
            <ErrorBanner
              message={`Unsupported live send variables: ${compatibility.blockingTokens.map(humanizeToken).join(', ')}. Remove or replace them before saving.`}
            />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Template name</span>
              <input value={draft.name} onChange={(event) => onFieldChange('name', event.target.value)} className={inputClass} />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-foreground">Category</span>
                <input value={draft.category} onChange={(event) => onFieldChange('category', event.target.value)} className={inputClass} />
              </label>
              {draft.channel === 'email' ? (
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">Cadence step</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.cadenceStep}
                    onChange={(event) => onFieldChange('cadenceStep', Math.max(1, Number(event.target.value) || 1))}
                    className={inputClass}
                  />
                </label>
              ) : (
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">Tag</span>
                  <input value={draft.tag} onChange={(event) => onFieldChange('tag', event.target.value)} className={inputClass} />
                </label>
              )}
            </div>
          </div>

          {draft.channel === 'email' && (
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Subject line</span>
              <input value={draft.subject} onChange={(event) => onFieldChange('subject', event.target.value)} className={inputClass} />
            </label>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Insert supported merge fields</span>
              {variables.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => onInsertVariable(token)}
                  className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-mono text-primary transition-colors hover:bg-primary/15"
                >
                  {token}
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              {draft.channel === 'email'
                ? 'Cadence email supports {{address}}, {{contactName}}, {{senderName}}, {{localBlurb}}, and {{price}}. Bulk email additionally resolves {{city}}, {{state}}, {{beds}}, {{baths}}, and {{source}}.'
                : 'Live bulk SMS currently resolves only {first_name} and {address}. Legacy {{contactName}} and {{address}} can be normalized with the helper above.'}
            </div>
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-foreground">Body</span>
            <textarea
              value={draft.body}
              onChange={(event) => onFieldChange('body', event.target.value)}
              rows={15}
              className={`${inputClass} min-h-[300px] resize-y font-mono text-[13px] leading-6`}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {compatibility.pathReports.map((path) => {
              const tone = path.unsupported.length > 0 ? 'warning' : 'success';
              return (
                <StatusPill key={path.mode} tone={tone === 'warning' ? 'warning' : 'success'} icon={path.unsupported.length > 0 ? FileWarning : undefined}>
                  {path.label}: {path.unsupported.length > 0 ? `${path.unsupported.length} incompatible token${path.unsupported.length === 1 ? '' : 's'}` : 'ready'}
                </StatusPill>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title="Live preview" icon={Eye}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={previewLead?.id ?? ''}
              onChange={(event) => onPreviewLeadChange(event.target.value)}
              className={`${inputClass} max-w-sm`}
            >
              {previewLeads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {[lead.address, lead.city, lead.state].filter(Boolean).join(', ')}
                </option>
              ))}
            </select>
            <SegmentedTabs
              tabs={
                draft.channel === 'email'
                  ? [
                      { key: 'cadence', label: 'Cadence email' },
                      { key: 'bulk-email', label: 'Bulk email' },
                    ]
                  : [{ key: 'bulk-sms', label: 'Bulk SMS' }]
              }
              value={previewMode}
              onChange={(value) => onPreviewModeChange(value as EmailPreviewMode | 'bulk-sms')}
            />
          </div>

          {!previewLead || !preview ? (
            <EmptyState icon={AlertTriangle} title="No preview lead loaded" hint="Pick a lead sample to verify real merge output." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                {draft.channel === 'email' && (
                  <div className="mb-3 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground">
                    <span className="font-semibold">Subject:</span> {'subject' in preview ? preview.subject : ''}
                  </div>
                )}
                <pre className="whitespace-pre-wrap text-sm leading-6 text-foreground">{preview.body}</pre>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground">Preview lead</h3>
                  <dl className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-start justify-between gap-3"><dt>Contact</dt><dd className="text-right text-foreground">{previewLead.contact_name || previewLead.owner_name || 'Unknown'}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt>Address</dt><dd className="text-right text-foreground">{previewLead.address || 'Missing'}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt>Location</dt><dd className="text-right text-foreground">{[previewLead.city, previewLead.state].filter(Boolean).join(', ') || 'Missing'}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt>Price</dt><dd className="text-right text-foreground">{previewLead.price ? `$${previewLead.price.toLocaleString('en-US')}` : 'Missing'}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt>Source</dt><dd className="text-right text-foreground">{previewLead.source || 'Missing'}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt>Sender</dt><dd className="text-right text-foreground">{senderName}</dd></div>
                  </dl>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground">Send-path audit</h3>
                  {preview.issues.length === 0 ? (
                    <p className="mt-3 text-sm text-success">This preview matches the selected live send flow.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-xs text-warning">
                      {preview.issues.map((issue) => (
                        <li key={issue} className="rounded-xl border border-warning/20 bg-warning/10 px-3 py-2">
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
