'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, cx } from '@/app/campaigns/shared';
import { Field, api, btnCls, inputCls, primaryBtnCls } from '@/app/seller-pipeline/ui';

type Item = { id: string; question: string; answer: string; model: string | null; topic_tags: string[]; needs_review: boolean; feedback: 'up' | 'down' | null; created_at: string };
type Asked = { id: string | null; answer: string; label: string; needsReview: boolean; reviewNote?: string };

/** General guidance from an AI model for questions AVA's approved help cannot answer, and the review step that turns a good one into a team answer. */
export default function DeeperAnswersPanel({ onDrafted }: { onDrafted: () => void }) {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<Asked | null>(null);
  const [rated, setRated] = useState<'up' | 'down' | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems((await api<{ items: Item[] }>('/api/ava/deeper/review')).items); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function ask() {
    setBusy(true); setError(null); setAsked(null); setRated(null);
    try { setAsked(await api<Asked>('/api/ava/deeper', { method: 'POST', body: { question } })); await load(); }
    catch (e) { setError((e as Error).message === 'deeper_unavailable' ? 'The AI model did not answer. Please try again in a moment.' : (e as Error).message === 'rate_limited' ? 'That is a lot of questions in a short time. Try again later.' : (e as Error).message === 'daily_limit' ? 'Your organization reached today\u2019s limit for deeper answers.' : (e as Error).message); }
    finally { setBusy(false); }
  }
  async function rate(feedback: 'up' | 'down') {
    if (!asked?.id) return;
    setRated(feedback);
    try { await api('/api/ava/deeper/feedback', { method: 'POST', body: { id: asked.id, feedback } }); await load(); } catch { /* rating is a nicety */ }
  }
  async function decide(id: string, action: 'draft' | 'dismiss') {
    setBusy(true); setError(null); setNote(null);
    try {
      await api('/api/ava/deeper/review', { method: 'POST', body: { id, action } });
      setNote(action === 'draft' ? 'Saved as a draft team answer. Edit it below and publish it when it is right: AVA does not use it until you do.' : 'Dismissed.');
      await load(); if (action === 'draft') onDrafted();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Card className="p-5" data-ava-anchor="knowledge-deeper">
      <h2 className="text-sm font-semibold">Deeper answers</h2>
      <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
        For a question AVA&rsquo;s approved help does not cover, ask an AI model (Anthropic) for general guidance. Your question is sent to Anthropic with emails and phone numbers removed, and nothing about
        any lead. The reply is general guidance, <strong>not approved AVYRO help</strong>: it can be wrong about how AVYRO works. If it is right, save it as a draft team answer, check it, and publish it so AVA can use it.
      </p>
      <div className="mt-3 space-y-3">
        <Field label="Your question"><textarea className={cx(inputCls, 'h-20 py-2')} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="For example: how do vacation-home valuations differ from suburban ones?" /></Field>
        <button className={primaryBtnCls} disabled={busy || question.trim().length < 3} onClick={ask}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Ask for a deeper answer'}</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {note && <p role="status" className="mt-3 text-sm text-emerald-700">{note}</p>}
      {asked && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <p className="text-[11px] font-medium text-amber-800">{asked.label}</p>
          {asked.needsReview && <p className="mt-1 text-[11px] font-medium text-red-700">{asked.reviewNote}</p>}
          <p className="mt-2 whitespace-pre-wrap text-sm">{asked.answer}</p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-xs text-muted-foreground">Was this helpful?</span>
            <button className={btnCls} disabled={rated !== null} onClick={() => rate('up')} aria-label="Helpful">👍</button>
            <button className={btnCls} disabled={rated !== null} onClick={() => rate('down')} aria-label="Not helpful">👎</button>
          </div>
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold">Waiting for your review</h3>
      {items === null ? <Loader2 className="mt-2 animate-spin" size={16} /> : items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing waiting.</p> : (
        <ul className="mt-2 divide-y divide-border">
          {items.map((i) => (
            <li key={i.id} className="py-3">
              <p className="text-sm font-semibold">{i.question}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {i.topic_tags.join(', ')}{i.feedback ? ` · rated ${i.feedback === 'up' ? 'helpful' : 'not helpful'}` : ''}{i.needs_review ? ' · legal, fee or compliance topic: have a person confirm' : ''}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground line-clamp-4">{i.answer}</p>
              <div className="mt-2 flex gap-2">
                <button className={btnCls} disabled={busy} onClick={() => decide(i.id, 'draft')}>Save as draft team answer</button>
                <button className={btnCls} disabled={busy} onClick={() => decide(i.id, 'dismiss')}>Dismiss</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
