'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { TEMPLATE_LABEL, type MessageTemplate } from '@/lib/seller/partnerMessages';

type Msg = { id: string; template: MessageTemplate; to_address: string; subject: string; status: string; error: string | null; sent_at: string | null; created_at: string };

async function call<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, { method: init?.method ?? 'GET', cache: 'no-store', ...(init?.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j as T;
}

/** Email the partner about a referral, and see what has been sent. Every send is a person pressing a button. */
export default function PartnerComms({ referralId, status, onSent }: { referralId: string; status: string; onSent?: () => void }) {
  const [items, setItems] = useState<Msg[]>([]);
  const [busy, setBusy] = useState<MessageTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems((await call<{ items: Msg[] }>(`/api/seller/referrals/message?referral_id=${encodeURIComponent(referralId)}`)).items); } catch { /* the history is optional */ }
  }, [referralId]);
  useEffect(() => { void load(); }, [load]);

  async function send(template: MessageTemplate) {
    if (template === 'intro' && !window.confirm('Email this lead, with the owner\u2019s name and phone, to the partner broker?')) return;
    setBusy(template); setError(null); setNote(null);
    try { await call('/api/seller/referrals/message', { method: 'POST', body: { referral_id: referralId, template } }); setNote(`${TEMPLATE_LABEL[template]} sent.`); await load(); onSent?.(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  const finished = status === 'closed' || status === 'dead';
  const btn = 'h-8 rounded-lg border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-50';

  return (
    <div className="mt-3 text-xs">
      <div className="flex flex-wrap gap-1.5">
        {!finished && <button className={btn} disabled={busy !== null} onClick={() => send('intro')}>{busy === 'intro' ? 'Sending…' : items.some((m) => m.template === 'intro' && m.status === 'sent') ? 'Resend lead packet' : 'Email lead packet'}</button>}
        {!finished && <button className={btn} disabled={busy !== null} onClick={() => send('nudge')}>{busy === 'nudge' ? 'Sending…' : 'Ask for a status update'}</button>}
        {status === 'closed' && <button className={btn} disabled={busy !== null} onClick={() => send('closed')}>{busy === 'closed' ? 'Sending…' : 'Email fee details'}</button>}
      </div>
      {note && <p className="mt-1 text-emerald-700">{note}</p>}
      {error && <p className="mt-1 text-red-700">{error}</p>}
      {items.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-muted-foreground">
          {items.slice(0, 5).map((m) => <li key={m.id}>{new Date(m.sent_at ?? m.created_at).toLocaleDateString()} · {TEMPLATE_LABEL[m.template]} to {m.to_address} · {m.status === 'sent' ? 'sent' : `failed${m.error ? `: ${m.error}` : ''}`}</li>)}
        </ul>
      )}
    </div>
  );
}
