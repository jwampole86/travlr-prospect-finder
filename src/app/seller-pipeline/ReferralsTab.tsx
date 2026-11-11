'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Card } from '@/app/campaigns/shared';
import { REFERRAL_STATUSES, REFERRAL_STATUS_LABEL, canMoveTo, isFinal, scorePartner, type ReferralStatus } from '@/lib/seller/partnerReferrals';
import { Field, api, btnCls, inputCls, money, primaryBtnCls } from './ui';
import type { Partner } from './PartnersTab';

type Referral = {
  id: string; partner_id: string; lead_id: string; property_label: string | null; status: ReferralStatus; sent_at: string; status_at: string;
  mls_number: string | null; close_price: number | null; dead_reason: string | null; notes: string | null;
};
type Update = { referral_id: string; status: ReferralStatus; status_at: string; note: string | null };
type Opp = { id: string; lead_id: string; authorization_status: string; lead: { contact_name: string | null; address: string | null; city: string | null; state: string | null } | null };

const today = () => new Date().toISOString().slice(0, 10);
const label = (o: Opp) => [o.lead?.address, o.lead?.city, o.lead?.state].filter(Boolean).join(', ') || o.lead_id;

/** Leads sent to partner brokers and the status each partner reports back. The partner does the licensed work; this only records what they tell us. */
export default function ReferralsTab() {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [items, setItems] = useState<Referral[] | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [partnerFilter, setPartnerFilter] = useState('');
  const [form, setForm] = useState({ partner_id: '', lead_id: '', notes: '' });
  const [blockers, setBlockers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, r, o] = await Promise.all([
        api<{ items: Partner[] }>('/api/seller/partners'),
        api<{ items: Referral[]; updates: Update[] }>('/api/seller/referrals'),
        api<{ items: Opp[] }>('/api/seller/opportunities?status=open')
      ]);
      setPartners(p.items); setItems(r.items); setUpdates(r.updates); setOpps(o.items); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sendable = opps.filter((o) => o.authorization_status === 'authorized' && !(items ?? []).some((r) => r.lead_id === o.lead_id && !isFinal(r.status)));
  const name = (id: string) => partners?.find((p) => p.id === id)?.name ?? 'Partner';

  async function send() {
    setBusy(true); setError(null); setBlockers([]);
    try {
      const opp = opps.find((o) => o.lead_id === form.lead_id);
      await api('/api/seller/referrals', { method: 'POST', body: { ...form, property_label: opp ? label(opp) : null } });
      setForm({ partner_id: form.partner_id, lead_id: '', notes: '' }); await load();
    } catch (e) { setError((e as Error).message); setBlockers((e as Error & { blockers?: string[] }).blockers ?? []); } finally { setBusy(false); }
  }

  const shown = (items ?? []).filter((r) => !partnerFilter || r.partner_id === partnerFilter);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Send a lead to a partner broker</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
          Only leads whose owner has given permission to share their details are listed, and only to a partner whose license is verified, with legal review done and the agreement on file.
          The partner handles everything licensed. Here you record the status they report back: received, contacted, listed, under contract, then closed or dead.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Partner">
            <select className={inputCls} value={form.partner_id} onChange={(e) => setForm({ ...form, partner_id: e.target.value })}>
              <option value="">Choose a partner</option>
              {(partners ?? []).filter((p) => p.relationship_status !== 'ended').map((p) => <option key={p.id} value={p.id}>{p.name}{p.states.length ? ` (${p.states.join(', ')})` : ''}</option>)}
            </select>
          </Field>
          <Field label="Lead (owner has given permission)">
            <select className={inputCls} value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })}>
              <option value="">{sendable.length ? 'Choose a lead' : 'No lead is cleared to share yet'}</option>
              {sendable.map((o) => <option key={o.id} value={o.lead_id}>{label(o)}</option>)}
            </select>
          </Field>
          <Field label="Note for your records"><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="mt-3"><button disabled={busy || !form.partner_id || !form.lead_id} onClick={send} className={primaryBtnCls}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Record referral sent</button></div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {blockers.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-red-700">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      </Card>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Show</span>
        <select className={`${inputCls} !w-auto`} value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)} aria-label="Partner">
          <option value="">All partners</option>
          {(partners ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {!items ? <Card className="p-8 flex justify-center"><Loader2 className="animate-spin" /></Card> : shown.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No referrals yet. Start with 3 to 5 test leads for a new partner, then keep only the partners who report back.</Card>
      ) : shown.map((r) => <ReferralCard key={r.id} r={r} partnerName={name(r.partner_id)} history={updates.filter((u) => u.referral_id === r.id)} onSaved={load} />)}
    </div>
  );
}

function ReferralCard({ r, partnerName, history, onSaved }: { r: Referral; partnerName: string; history: Update[]; onSaved: () => void }) {
  const next = REFERRAL_STATUSES.filter((s) => canMoveTo(r.status, s));
  const [status, setStatus] = useState<ReferralStatus | ''>('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [mls, setMls] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const score = scorePartner([r]);

  async function save() {
    if (!status) return;
    setBusy(true); setError(null);
    try {
      await api('/api/seller/referrals', { method: 'PATCH', body: { id: r.id, status, status_at: date, note, ...(status === 'listed' ? { mls_number: mls } : {}), ...(status === 'closed' ? { close_price: price } : {}), ...(status === 'dead' ? { dead_reason: reason } : {}) } });
      setStatus(''); setNote(''); setMls(''); setPrice(''); setReason(''); onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{r.property_label || r.lead_id}</p>
          <p className="text-xs text-muted-foreground">With {partnerName} · sent {new Date(r.sent_at).toLocaleDateString()}</p>
          <p className="mt-1 text-sm">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{REFERRAL_STATUS_LABEL[r.status]}</span>
            <span className="ml-2 text-xs text-muted-foreground">since {new Date(r.status_at).toLocaleDateString()}</span>
            {r.mls_number && <span className="ml-2 text-xs text-muted-foreground">MLS {r.mls_number}</span>}
            {r.close_price != null && <span className="ml-2 text-xs text-muted-foreground">Closed at {money(r.close_price)}</span>}
            {r.dead_reason && <span className="ml-2 text-xs text-muted-foreground">Reason: {r.dead_reason}</span>}
          </p>
          {score.silent > 0 && <p className="mt-1 text-xs text-amber-800">Sent over a week ago and not yet acknowledged by the partner.</p>}
          {score.stale > 0 && <p className="mt-1 text-xs text-amber-800">No update for over a month. Ask the partner for a status.</p>}
        </div>
        {next.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <Field label="Partner reported"><select className={`${inputCls} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value as ReferralStatus)}><option value="">Choose a status</option>{next.map((s) => <option key={s} value={s}>{REFERRAL_STATUS_LABEL[s]}</option>)}</select></Field>
            <Field label="As of"><input type="date" max={today()} className={`${inputCls} !w-auto`} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            {status === 'listed' && <Field label="MLS # (optional)"><input className={`${inputCls} !w-28`} value={mls} onChange={(e) => setMls(e.target.value)} /></Field>}
            {status === 'closed' && <Field label="Close price (optional)"><input inputMode="numeric" className={`${inputCls} !w-32`} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>}
            {status === 'dead' && <Field label="Reason (one line)"><input className={`${inputCls} !w-48`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
            <Field label="Note"><input className={`${inputCls} !w-40`} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <button className={btnCls} disabled={busy || !status} onClick={save}>{busy && <Loader2 size={14} className="animate-spin" />} Save update</button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {history.length > 1 && (
        <ol className="mt-3 border-l border-border pl-4 space-y-1 text-xs text-muted-foreground">
          {history.map((u, i) => <li key={i}>{new Date(u.status_at).toLocaleDateString()}: {REFERRAL_STATUS_LABEL[u.status]}{u.note ? ` (${u.note})` : ''}</li>)}
        </ol>
      )}
    </Card>
  );
}
