'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, cx } from '@/app/campaigns/shared';
import { Field, api, btnCls, inputCls, primaryBtnCls } from '@/app/seller-pipeline/ui';
import DeeperAnswersPanel from './DeeperAnswersPanel';

type Entry = { id: string; title: string; answer: string; keywords: string[]; status: 'draft' | 'published' | 'retired'; updated_at: string };
type Data = { entries: Entry[]; unanswered: Array<{ topic: string; count: number; lastSeen: string }>; notHelpful: Array<{ topic: string; count: number }> };
type Form = { id: string | null; title: string; answer: string; keywords: string };
const EMPTY: Form = { id: null, title: '', answer: '', keywords: '' };

export default function AvaKnowledgeView() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<Data>('/api/ava/knowledge')); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(status: 'published' | 'draft') {
    setBusy(true); setError(null); setNote(null);
    try {
      const body = { title: form.title, answer: form.answer, keywords: form.keywords, status };
      if (form.id) await api(`/api/ava/knowledge/${form.id}`, { method: 'PATCH', body });
      else await api('/api/ava/knowledge', { method: 'POST', body });
      setNote(status === 'published' ? 'Saved. AVA will use this answer from now on.' : 'Saved as a draft. AVA will not use it until you publish it.');
      setForm(EMPTY);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function setStatus(e: Entry, status: Entry['status']) {
    setBusy(true); setError(null);
    try { await api(`/api/ava/knowledge/${e.id}`, { method: 'PATCH', body: { status } }); await load(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (!data && !error) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <Card className="p-5">
        <h1 className="text-xl font-bold">AVA knowledge</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
          AVA answers from approved help only. When she cannot answer something, it shows up here as a topic (words only: never names, numbers or what anyone typed),
          and you can write the answer once for everyone on your team. A published answer is used by AVA right away, and only for your organization.
        </p>
      </Card>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {note && <p role="status" className="text-sm text-emerald-700">{note}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5" data-ava-anchor="knowledge-gaps">
          <h2 className="text-sm font-semibold">What AVA could not answer</h2>
          <p className="text-xs text-muted-foreground">Counted only for people who chose to share anonymous usage.</p>
          {data && data.unanswered.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nothing yet. When she cannot answer a help question, it will be listed here.</p> : (
            <ul className="mt-3 divide-y divide-border">
              {data?.unanswered.map((t) => (
                <li key={t.topic} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate"><strong>{t.topic}</strong> <span className="text-xs text-muted-foreground">asked {t.count} time{t.count === 1 ? '' : 's'}</span></span>
                  <button className={btnCls} onClick={() => setForm({ id: null, title: t.topic, answer: '', keywords: t.topic.split(' ').join(', ') })}>Write an answer</button>
                </li>
              ))}
            </ul>
          )}
          {data && data.notHelpful.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold">Answers people rated &ldquo;not helpful&rdquo;</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {data.notHelpful.map((t) => <li key={t.topic}><strong>{t.topic}</strong> <span className="text-xs text-muted-foreground">{t.count} time{t.count === 1 ? '' : 's'}</span></li>)}
              </ul>
            </>
          )}
        </Card>

        <Card className="p-5" data-ava-anchor="knowledge-form">
          <h2 className="text-sm font-semibold">{form.id ? 'Edit an answer' : 'Write an answer for AVA'}</h2>
          <div className="mt-3 space-y-3">
            <Field label="Question or topic"><input className={inputCls} value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="How do I get a W-9 form?" /></Field>
            <Field label="Answer"><textarea className={cx(inputCls, 'h-32 py-2')} value={form.answer} maxLength={1500} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="Write it the way you would explain it to a new agent." /></Field>
            <Field label="Other words people might use (optional, separated by commas)"><input className={inputCls} value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="w9, tax form" /></Field>
            <p className="text-[11px] text-muted-foreground">Keep it to facts. Do not put passwords, personal details or anything private in an answer: everyone on your team can ask AVA for it.</p>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => save('published')} className={primaryBtnCls}>{form.id ? 'Save and publish' : 'Publish'}</button>
              <button disabled={busy} onClick={() => save('draft')} className={btnCls}>Save as draft</button>
              {(form.id || form.title || form.answer) && <button disabled={busy} onClick={() => setForm(EMPTY)} className={btnCls}>Clear</button>}
            </div>
          </div>
        </Card>
      </div>

      <DeeperAnswersPanel onDrafted={() => void load()} />

      <Card className="p-5" data-ava-anchor="knowledge-list">
        <h2 className="text-sm font-semibold">Your team&rsquo;s answers</h2>
        {data && data.entries.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">You have not written any yet.</p> : (
          <ul className="mt-3 divide-y divide-border">
            {data?.entries.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{e.title} <span className={cx('ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium', e.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{e.status === 'published' ? 'Live' : 'Draft'}</span></p>
                    <p className="mt-0.5 text-sm text-muted-foreground line-clamp-3">{e.answer}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className={btnCls} onClick={() => setForm({ id: e.id, title: e.title, answer: e.answer, keywords: e.keywords.join(', ') })}>Edit</button>
                    <button className={btnCls} disabled={busy} onClick={() => setStatus(e, e.status === 'published' ? 'draft' : 'published')}>{e.status === 'published' ? 'Unpublish' : 'Publish'}</button>
                    <button className={btnCls} disabled={busy} onClick={() => setStatus(e, 'retired')}>Remove</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
