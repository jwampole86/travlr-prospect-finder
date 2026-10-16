'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, Eye, LayoutTemplate, Mail, RefreshCw, ShieldCheck, TableProperties } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import BackButton from '@/components/ui/BackButton';
import {
  buttonPrimary,
  buttonSecondary,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
} from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import { AUTH_EMAIL_TEMPLATES, buildEmailHtml } from './templates';

type ContentTab = 'preview' | 'html';

type InventoryState = {
  checkedAt: string;
  publicTemplateCount: number | null;
};

const TAB_OPTIONS: { key: ContentTab; label: string; icon: React.ElementType }[] = [
  { key: 'preview', label: 'Preview', icon: Eye },
  { key: 'html', label: 'HTML', icon: TableProperties },
];

export default function SupabaseEmailTemplatesPage() {
  const [selectedId, setSelectedId] = useState(AUTH_EMAIL_TEMPLATES[0].id);
  const [contentTab, setContentTab] = useState<ContentTab>('preview');
  const [inventory, setInventory] = useState<InventoryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => AUTH_EMAIL_TEMPLATES.find((template) => template.id === selectedId) ?? AUTH_EMAIL_TEMPLATES[0],
    [selectedId],
  );
  const fullHtml = useMemo(() => buildEmailHtml(selectedTemplate.body), [selectedTemplate]);
  const tokens = useMemo(
    () => Array.from(new Set(fullHtml.match(/{{\s*\.[^}]+}}/g) ?? [])),
    [fullHtml],
  );

  const loadInventory = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const supabase = createClient();
      const { count, error: countError } = await supabase.from('email_templates').select('*', { count: 'exact', head: true });
      if (countError) {
        throw new Error(`Could not verify the public email_templates table: ${countError.message}`);
      }
      setInventory({ checkedAt: new Date().toISOString(), publicTemplateCount: count ?? 0 });
    } catch (loadError) {
      setInventory({ checkedAt: new Date().toISOString(), publicTemplateCount: null });
      setError(loadError instanceof Error ? loadError.message : 'Could not verify template storage');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const handleCopy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(key);
      window.setTimeout(() => setCopyState((current) => (current === key ? null : current)), 1800);
    } catch {
      setError('Clipboard access failed. Copy directly from the HTML panel instead.');
    }
  }, []);

  const stats = [
    {
      label: 'Repo auth templates',
      value: AUTH_EMAIL_TEMPLATES.length.toLocaleString(),
      hint: 'Hardcoded HTML drafts in this route folder',
      icon: LayoutTemplate,
      tone: 'primary' as const,
    },
    {
      label: 'Applied automatically',
      value: '0',
      hint: 'This page has no API wired to update Supabase auth settings',
      icon: ShieldCheck,
      tone: 'warning' as const,
    },
    {
      label: 'Public email_templates rows',
      value: inventory?.publicTemplateCount ?? '—',
      hint: 'Real rows in public.email_templates for outreach templates, not auth emails',
      icon: Mail,
      tone: inventory?.publicTemplateCount ? 'success' as const : 'default' as const,
    },
    {
      label: 'Dashboard state readable here',
      value: 'No',
      hint: 'Current Supabase dashboard subject/body values cannot be inspected from this route',
      icon: CheckCircle2,
      tone: 'danger' as const,
    },
  ];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <BackButton className="!px-0 !pt-0" />

        <PageHeader
          icon={Mail}
          title="Supabase Email Templates"
          description="Read-only reference for the repo's auth-email HTML drafts. It previews and copies template HTML, but it does not read or change the Supabase dashboard configuration."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="warning">Manual dashboard paste required</StatusPill>
              <button type="button" onClick={() => { void loadInventory(); }} disabled={refreshing} className={buttonSecondary}>
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Checking…' : 'Recheck storage'}
              </button>
              <button type="button" onClick={() => { void handleCopy(`${selectedTemplate.id}-html`, fullHtml); }} className={buttonPrimary}>
                <Clipboard size={16} />
                {copyState === `${selectedTemplate.id}-html` ? 'HTML copied' : 'Copy current HTML'}
              </button>
            </div>
          )}
        />

        {error && <ErrorBanner message={error} onRetry={() => { void loadInventory(); }} />}

        {loading ? (
          <LoadingState label="Checking live template storage…" />
        ) : (
          <>
            <StatGrid stats={stats} columns={4} />

            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <Panel title="What this page actually does" icon={ShieldCheck}>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p><strong className="text-foreground">Stored here:</strong> six repo-managed HTML drafts for Supabase auth emails.</p>
                    <p><strong className="text-foreground">Not stored here:</strong> the live Authentication → Email Templates values from your Supabase dashboard.</p>
                    <p><strong className="text-foreground">This route can:</strong> preview HTML, copy the subject, and copy the message body.</p>
                    <p><strong className="text-foreground">This route cannot:</strong> apply changes, verify what is currently configured in Supabase, or send any email.</p>
                    <p className="text-xs">Last checked public.email_templates {inventory?.checkedAt ? new Date(inventory.checkedAt).toLocaleString() : '—'}.</p>
                  </div>
                </Panel>

                <Panel title="Auth template set" icon={LayoutTemplate}>
                  <div className="space-y-2">
                    {AUTH_EMAIL_TEMPLATES.map((template) => {
                      const active = template.id === selectedTemplate.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setSelectedId(template.id)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                            active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{template.name}</span>
                            <StatusPill tone={active ? 'primary' : 'default'}>{template.supabaseKey}</StatusPill>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </Panel>
              </div>

              <div className="space-y-4">
                <Panel
                  title={selectedTemplate.name}
                  icon={Mail}
                  actions={(
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => { void handleCopy(`${selectedTemplate.id}-subject`, selectedTemplate.subject); }} className={buttonSecondary}>
                        <Clipboard size={14} />
                        {copyState === `${selectedTemplate.id}-subject` ? 'Subject copied' : 'Copy subject'}
                      </button>
                      <button type="button" onClick={() => { void handleCopy(`${selectedTemplate.id}-html-inline`, fullHtml); }} className={buttonSecondary}>
                        <Clipboard size={14} />
                        {copyState === `${selectedTemplate.id}-html-inline` ? 'HTML copied' : 'Copy HTML'}
                      </button>
                    </div>
                  )}
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-border bg-muted/20 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subject</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{selectedTemplate.subject}</div>
                      </div>
                      <div className="rounded-2xl border border-border bg-muted/20 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supabase template tab</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{selectedTemplate.supabaseKey}</div>
                      </div>
                      <div className="rounded-2xl border border-border bg-muted/20 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current merge fields</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {tokens.map((token) => <StatusPill key={token} tone="default">{token}</StatusPill>)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                      <p className="font-semibold text-foreground">Apply manually in Supabase</p>
                      <ol className="mt-3 list-decimal space-y-2 pl-5">
                        <li>Open Authentication → Configuration → Emails → Templates in the Supabase dashboard.</li>
                        <li>Select the matching template tab shown here.</li>
                        <li>Paste the subject and HTML manually.</li>
                        <li>Save in Supabase. This page will still not know whether that save happened.</li>
                      </ol>
                    </div>
                  </div>
                </Panel>

                <Panel
                  title="Preview and HTML"
                  icon={Eye}
                  actions={<SegmentedTabs tabs={TAB_OPTIONS} value={contentTab} onChange={setContentTab} />}
                  padded={false}
                >
                  {contentTab === 'preview' ? (
                    <div className="bg-muted/30 p-4">
                      <iframe
                        srcDoc={fullHtml}
                        title={`Preview: ${selectedTemplate.name}`}
                        className="h-[560px] w-full rounded-2xl border border-border bg-white"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-all bg-muted/20 p-4 text-xs leading-relaxed text-foreground">
                      {fullHtml}
                    </pre>
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
