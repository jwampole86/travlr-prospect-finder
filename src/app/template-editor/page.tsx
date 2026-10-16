'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { ErrorBanner, LoadingState, PageHeader, SegmentedTabs, StatGrid, buttonSecondary } from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import TemplateEditorPanel from './components/TemplateEditorPanel';
import TemplateSidebar from './components/TemplateSidebar';
import {
  EMAIL_DEFAULTS,
  SMS_DEFAULTS,
  analyzeTemplateCompatibility,
  fromEmailRow,
  fromSmsRow,
  makeDraftFromTemplate,
  normalizeLegacySmsTokens,
  serializeDraft,
  type DraftTemplate,
  type PreviewLead,
  type TemplateChannel,
  type TemplateRecord,
} from './lib';

export default function TemplateEditorPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuth();
  const senderName = useMemo(() => {
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    return String(meta.first_name ?? meta.full_name ?? user?.email ?? 'TRAVLR team').trim() || 'TRAVLR team';
  }, [user]);

  const [channel, setChannel] = useState<TemplateChannel>('email');
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [previewLeads, setPreviewLeads] = useState<PreviewLead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTemplate | null>(null);
  const [previewLeadId, setPreviewLeadId] = useState<string>('');
  const [previewMode, setPreviewMode] = useState<'cadence' | 'bulk-email' | 'bulk-sms'>('cadence');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [emailResult, smsResult, leadResult] = await Promise.all([
        supabase
          .from('email_templates')
          .select('id, name, subject, body, category, cadence_step, portfolio, created_at, updated_at')
          .order('updated_at', { ascending: false }),
        supabase
          .from('message_templates')
          .select('id, name, body, category, tag, type, created_at, updated_at')
          .eq('type', 'sms')
          .order('updated_at', { ascending: false }),
        supabase
          .from('leads')
          .select('id, address, city, state, zip, contact_name, owner_name, price, beds, baths, source')
          .eq('is_synthetic', false)
          .not('address', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(12),
      ]);

      if (emailResult.error) throw emailResult.error;
      if (smsResult.error) throw smsResult.error;
      if (leadResult.error) throw leadResult.error;

      const nextTemplates = [
        ...(emailResult.data ?? []).map((row) => fromEmailRow(row as Record<string, unknown>)),
        ...(smsResult.data ?? []).map((row) => fromSmsRow(row as Record<string, unknown>)),
      ].sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));

      setTemplates(nextTemplates);

      const leadRows = ((leadResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        address: String(row.address ?? ''),
        city: String(row.city ?? ''),
        state: String(row.state ?? ''),
        zip: String(row.zip ?? ''),
        contact_name: String(row.contact_name ?? ''),
        owner_name: String(row.owner_name ?? ''),
        price: typeof row.price === 'number' ? row.price : row.price ? Number(row.price) : null,
        beds: typeof row.beds === 'number' ? row.beds : row.beds ? Number(row.beds) : null,
        baths: typeof row.baths === 'number' ? row.baths : row.baths ? Number(row.baths) : null,
        source: String(row.source ?? ''),
      }));
      setPreviewLeads(leadRows);
      setPreviewLeadId((current) => current || leadRows[0]?.id || '');
      return nextTemplates;
    } catch (loadError) {
      console.error('[TemplateEditor] failed to load templates', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load templates');
      return [] as TemplateRecord[];
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (draft || templates.length === 0) return;
    const first = templates[0];
    setSelectedId(first.id);
    setChannel(first.channel);
    setPreviewMode(first.channel === 'email' ? 'cadence' : 'bulk-sms');
    setDraft(makeDraftFromTemplate(first));
  }, [draft, templates]);

  const filteredTemplates = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (template.channel !== channel) return false;
      if (categoryFilter !== 'all' && template.category !== categoryFilter) return false;
      if (!lowerSearch) return true;
      return [template.name, template.category, template.subject, template.body, template.tag]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(lowerSearch));
    });
  }, [categoryFilter, channel, search, templates]);

  const categories = useMemo(
    () => [...new Set(templates.filter((template) => template.channel === channel).map((template) => template.category).filter(Boolean))].sort(),
    [channel, templates]
  );

  const stats = useMemo(() => {
    const emailTemplates = templates.filter((template) => template.channel === 'email');
    const smsTemplates = templates.filter((template) => template.channel === 'sms');
    const incompatible = templates.filter((template) => analyzeTemplateCompatibility(template.channel, template.subject, template.body).blockingTokens.length > 0).length;
    const updatedAt = templates[0]?.updatedAt ? new Date(templates[0].updatedAt).toLocaleString() : '—';

    return [
      { label: 'Email templates', value: emailTemplates.length, hint: 'Persisted in email_templates', icon: FileText, tone: 'default' as const },
      { label: 'SMS templates', value: smsTemplates.length, hint: 'Persisted in message_templates', icon: MessageSquare, tone: 'default' as const },
      { label: 'Compatibility issues', value: incompatible, hint: 'Templates with unsupported live merge fields', icon: AlertTriangle, tone: incompatible > 0 ? 'warning' as const : 'success' as const },
      { label: 'Last template update', value: updatedAt, hint: 'Latest row updated_at', icon: RefreshCw, tone: 'default' as const },
    ];
  }, [templates]);

  const previewLead = useMemo(
    () => previewLeads.find((lead) => lead.id === previewLeadId) ?? previewLeads[0] ?? null,
    [previewLeadId, previewLeads]
  );

  const selectTemplate = useCallback((template: TemplateRecord) => {
    setSelectedId(template.id);
    setChannel(template.channel);
    setPreviewMode(template.channel === 'email' ? 'cadence' : 'bulk-sms');
    setDraft(makeDraftFromTemplate(template));
  }, []);

  const startDraft = useCallback(
    (nextChannel: TemplateChannel) => {
      setSelectedId(null);
      setPreviewMode(nextChannel === 'email' ? 'cadence' : 'bulk-sms');
      setDraft(nextChannel === 'email' ? { ...EMAIL_DEFAULTS } : { ...SMS_DEFAULTS });
      setChannel(nextChannel);
    },
    []
  );

  const handleChannelChange = useCallback(
    (nextChannel: TemplateChannel) => {
      setChannel(nextChannel);
      setCategoryFilter('all');
      setSearch('');
      const existing = templates.find((template) => template.channel === nextChannel);
      if (existing) {
        selectTemplate(existing);
      } else {
        startDraft(nextChannel);
      }
    },
    [selectTemplate, startDraft, templates]
  );

  const handleFieldChange = useCallback(<K extends keyof DraftTemplate>(key: K, value: DraftTemplate[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const handleInsertVariable = useCallback((token: string) => {
    setDraft((current) => (current ? { ...current, body: `${current.body}${current.body.endsWith('\n') || current.body.length === 0 ? '' : ' '}${token}` } : current));
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error('Template name is required.');
      return;
    }
    if (!draft.body.trim()) {
      toast.error('Template body is required.');
      return;
    }

    const compatibility = analyzeTemplateCompatibility(draft.channel, draft.subject, draft.body);
    if (compatibility.blockingTokens.length > 0) {
      toast.error(`Remove unsupported variables before saving: ${compatibility.blockingTokens.join(', ')}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const { sourceTable, payload } = serializeDraft(draft);
      const datedPayload = { ...payload, updated_at: now };
      if (draft.id) {
        const { error: updateError } = await supabase.from(sourceTable).update(datedPayload).eq('id', draft.id);
        if (updateError) throw updateError;
        toast.success('Template updated.');
        const freshTemplates = await loadPage();
        const refreshed = freshTemplates.find((template) => template.id === draft.id);
        if (refreshed) setDraft(makeDraftFromTemplate(refreshed));
      } else {
        const insertPayload = sourceTable === 'message_templates'
          ? { ...datedPayload, created_at: now, user_id: user?.id ?? null }
          : { ...datedPayload, created_at: now };
        const { data: inserted, error: insertError } = await supabase.from(sourceTable).insert(insertPayload).select('id').single();
        if (insertError) throw insertError;
        const freshTemplates = await loadPage();
        if (inserted?.id) {
          const insertedTemplate = freshTemplates.find((template) => template.id === String(inserted.id));
          if (insertedTemplate) {
            setSelectedId(insertedTemplate.id);
            setDraft(makeDraftFromTemplate(insertedTemplate));
          }
        }
        toast.success('Template created.');
      }
    } catch (saveError) {
      console.error('[TemplateEditor] save failed', saveError);
      const message = saveError instanceof Error ? saveError.message : 'Failed to save template';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [draft, loadPage, supabase, user?.id]);

  const handleDelete = useCallback(async () => {
    if (!draft?.id) return;
    setDeleting(true);
    setError(null);
    try {
      const sourceTable = draft.channel === 'email' ? 'email_templates' : 'message_templates';
      const { error: deleteError } = await supabase.from(sourceTable).delete().eq('id', draft.id);
      if (deleteError) throw deleteError;
      toast.success('Template deleted.');
      setDraft(null);
      setSelectedId(null);
      await loadPage();
    } catch (deleteError) {
      console.error('[TemplateEditor] delete failed', deleteError);
      const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete template';
      setError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }, [draft, loadPage, supabase]);

  const handleNormalizeSms = useCallback(() => {
    setDraft((current) => (current?.channel === 'sms' ? { ...current, body: normalizeLegacySmsTokens(current.body) } : current));
    toast.success('Legacy {{contactName}} / {{address}} tokens were normalized for the live SMS pipeline.');
  }, []);

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 px-4 py-5 sm:px-6">
        <PageHeader
          icon={FileText}
          title="Template Editor"
          description="Audit-safe template editing for email_templates and message_templates. Previews use the same merge logic as the live email and SMS send flows."
          actions={
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => startDraft(channel)} className={buttonSecondary}>
                Create {channel === 'email' ? 'email' : 'SMS'} draft
              </button>
              <button type="button" onClick={() => void loadPage()} className={buttonSecondary}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          }
        />

        <StatGrid stats={stats} columns={4} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs
            tabs={[
              { key: 'email', label: 'Email templates', icon: FileText, badge: templates.filter((template) => template.channel === 'email').length || undefined },
              { key: 'sms', label: 'SMS templates', icon: MessageSquare, badge: templates.filter((template) => template.channel === 'sms').length || undefined },
            ]}
            value={channel}
            onChange={(value) => handleChannelChange(value as TemplateChannel)}
          />
        </div>

        {error && !draft && <ErrorBanner message={error} onRetry={() => void loadPage()} />}

        {loading ? (
          <LoadingState label="Loading live templates…" />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="min-h-[500px]">
              <TemplateSidebar
                channel={channel}
                templates={filteredTemplates}
                search={search}
                category={categoryFilter}
                categories={categories}
                selectedId={selectedId}
                onSearchChange={setSearch}
                onCategoryChange={setCategoryFilter}
                onSelect={selectTemplate}
                onCreate={() => startDraft(channel)}
              />
            </div>
            <TemplateEditorPanel
              draft={draft}
              previewLead={previewLead}
              senderName={senderName}
              previewMode={previewMode}
              saving={saving}
              deleting={deleting}
              error={draft ? error : null}
              previewLeads={previewLeads}
              onFieldChange={handleFieldChange}
              onInsertVariable={handleInsertVariable}
              onPreviewLeadChange={setPreviewLeadId}
              onPreviewModeChange={setPreviewMode}
              onNormalizeSms={handleNormalizeSms}
              onSave={() => void handleSave()}
              onDelete={() => void handleDelete()}
              onCancel={() => {
                if (selectedId) {
                  const selected = templates.find((template) => template.id === selectedId);
                  setDraft(selected ? makeDraftFromTemplate(selected) : null);
                } else {
                  setDraft(null);
                }
              }}
            />
          </div>
        )}

        {!loading && templates.length === 0 && !error && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> No persisted templates were found yet.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
