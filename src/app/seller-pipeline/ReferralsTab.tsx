'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Card } from '@/app/campaigns/shared';
import { REFERRAL_STATUSES, REFERRAL_STATUS_LABEL, canMoveTo, isFinal, scorePartner, type ReferralStatus } from '@/lib/seller/partnerReferrals';
import { FEE_STATUS_LABEL, estimateFee, isOverdue, ledger, withinProtection, type FeeStatus } from '@/lib/seller/partnerFees';
import { Field, api, btnCls, inputCls, money, primaryBtnCls } from './ui';
import type { Partner } from './PartnersTab';
import PartnerComms from '@/components/seller/PartnerComms';

type Referral = {
  id: string; partner_id: string; lead_id: string; property_label: string | null; status: ReferralStatus; sent_at: string; status_at: string;
  mls_number: string | null; close_price: number | null; dead_reason: string | null; notes: string | null;
  fee_percent: number | null; protection_ends_at: string | null; commission_received: number | null; commission_received_on: string | null;
  fee_amount: number | null; fee_due_on: string | null; fee_status: FeeStatus; fee_paid_amount: number | null; fee_paid_on: string | null; fee_invoiced_on: string | null;
  payment_method_snapshot: string | null; payee_name_snapshot: string | null; payment_due_days_snapshot: number | null;
};
type Suggestion = { id: string; name: string; score: number; reasons: string[] };
type Rejection = { id: string; name: string; why: string[] };
type Match = { state: string | null; stateBlockers: string[]; suggestions: Suggestion[]; rejected: Rejection[]; needsPartner: boolean };
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
  const [match, setMatch] = useState<Match | null>(null);

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

  // Who can take the chosen lead: the signed partners that pass every rule, best first, and why each of the others cannot.
  useEffect(() => {
    setMatch(null);
    if (!form.lead_id) return;
    let live = true;
    api<Match>(`/api/seller/referrals/match?lead_id=${encodeURIComponent(form.lead_id)}`).then((m) => { if (live) { setMatch(m); if (m.suggestions[0]) setForm((f) => (f.lead_id === form.lead_id ? { ...f, partner_id: m.suggestions[0].id } : f)); } }).catch(() => {});
    return () => { live = false; };
  }, [form.lead_id]);

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
        {form.lead_id && match && (
          <div className="mt-4 rounded-xl border border-border p-3 text-xs">
            {match.stateBlockers.length > 0 && <p className="text-amber-800">{match.state ?? 'This state'}: {match.stateBlockers.join(' ')}</p>}
            {match.suggestions.length > 0 ? (
              <>
                <p className="font-medium">Best partners for this lead</p>
                <ul className="mt-1 space-y-1">
                  {match.suggestions.slice(0, 3).map((s, i) => (
                    <li key={s.id}>
                      <button className={`text-left hover:underline ${form.partner_id === s.id ? 'font-semibold' : ''}`} onClick={() => setForm({ ...form, partner_id: s.id })}>
                        {i + 1}. {s.name} <span className="text-muted-foreground">({s.score}) {s.reasons.filter(Boolean).join(', ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="font-medium text-amber-800">Needs a partner: no signed partner can take this lead yet. Recruit one for {match.state ?? 'this state'} (the Partners tab has the playbook), and meanwhile the owner can still be offered the NAVEO Stays path.</p>}
            {match.rejected.length > 0 && (
              <details className="mt-2"><summary className="cursor-pointer text-muted-foreground">Why {match.rejected.length} other partner{match.rejected.length === 1 ? ' is' : 's are'} not suggested</summary>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">{match.rejected.map((r) => <li key={r.id}>{r.name}: {r.why.join('; ')}</li>)}</ul>
              </details>
            )}
          </div>
        )}
        <div className="mt-3"><button disabled={busy || !form.partner_id || !form.lead_id} onClick={send} className={primaryBtnCls}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Record referral sent</button></div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {blockers.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-red-700">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      </Card>

      {items && items.length > 0 && <FeeLedger items={items} />}

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

const usd = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** What partners owe NAVEO on closed referrals: the amount due, what is late, what has been paid, and a labelled estimate for closes still waiting on the commission. */
function FeeLedger({ items }: { items: Referral[] }) {
  const l = ledger(items.map((r) => ({ status: r.status, fee_status: r.fee_status, fee_amount: r.fee_amount, fee_due_on: r.fee_due_on, fee_paid_amount: r.fee_paid_amount, close_price: r.close_price, fee_percent: r.fee_percent })));
  const pipeline = items.filter((r) => !isFinal(r.status) && r.fee_percent != null).length;
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Referral fees</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-4 text-sm">
        <div><p className="text-xs text-muted-foreground">Owed to you now</p><p className="text-lg font-semibold">{usd(l.owed)}</p></div>
        <div><p className="text-xs text-muted-foreground">Overdue</p><p className={`text-lg font-semibold ${l.overdueCount ? 'text-red-700' : ''}`}>{usd(l.overdue)}{l.overdueCount ? <span className="ml-1 text-xs font-normal">({l.overdueCount})</span> : null}</p></div>
        <div><p className="text-xs text-muted-foreground">Paid</p><p className="text-lg font-semibold">{usd(l.paid)}</p></div>
        <div><p className="text-xs text-muted-foreground">Closed, commission not reported</p><p className="text-lg font-semibold">{l.awaitingCommission}</p>{l.estimatedPending > 0 && <p className="text-[11px] text-muted-foreground">about {usd(l.estimatedPending)} (estimate)</p>}</div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{pipeline} open referral{pipeline === 1 ? '' : 's'} could still turn into a fee. A fee is the agreed % of the commission the partner actually received, due the agreed business days after they were paid.{l.partialShortfall > 0 ? ` ${usd(l.partialShortfall)} was paid short of the amount due.` : ''}</p>
    </Card>
  );
}

function ReferralCard({ r, partnerName, history, onSaved }: { r: Referral; partnerName: string; history: Update[]; onSaved: () => void }) {
  const reopenable = r.status === 'dead' && withinProtection(r.protection_ends_at);
  const next = REFERRAL_STATUSES.filter((s) => canMoveTo(r.status, s, { reopenable }));
  const [status, setStatus] = useState<ReferralStatus | ''>('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [mls, setMls] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [commission, setCommission] = useState('');
  const [commissionOn, setCommissionOn] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const score = scorePartner([r]);

  async function save() {
    if (!status) return;
    setBusy(true); setError(null);
    try {
      await api('/api/seller/referrals', { method: 'PATCH', body: { id: r.id, status, status_at: date, note, ...(status === 'listed' ? { mls_number: mls } : {}), ...(status === 'closed' ? { close_price: price, ...(commission ? { commission_received: commission, commission_received_on: commissionOn } : {}) } : {}), ...(status === 'dead' ? { dead_reason: reason } : {}) } });
      setStatus(''); setNote(''); setMls(''); setPrice(''); setReason(''); setCommission(''); onSaved();
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
            {status === 'closed' && <Field label="Their commission, if known"><input inputMode="decimal" className={`${inputCls} !w-32`} value={commission} onChange={(e) => setCommission(e.target.value)} /></Field>}
            {status === 'closed' && commission && <Field label="Commission received on"><input type="date" max={today()} className={`${inputCls} !w-36`} value={commissionOn} onChange={(e) => setCommissionOn(e.target.value)} /></Field>}
            {status === 'dead' && <Field label="Reason (one line)"><input className={`${inputCls} !w-48`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
            <Field label="Note"><input className={`${inputCls} !w-40`} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <button className={btnCls} disabled={busy || !status} onClick={save}>{busy && <Loader2 size={14} className="animate-spin" />} Save update</button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {r.protection_ends_at && <p className="mt-2 text-xs text-muted-foreground">{withinProtection(r.protection_ends_at) ? 'Protected' : 'Protection ended'} {new Date(r.protection_ends_at).toLocaleDateString()}{r.fee_percent != null ? ` · fee ${r.fee_percent}%` : ''}{r.payee_name_snapshot ? ` · payee ${r.payee_name_snapshot}` : ''}{r.payment_method_snapshot ? ` by ${r.payment_method_snapshot}` : ''}</p>}
      {reopenable && <p className="mt-1 text-xs text-amber-800">Marked dead, but still inside the protection period: if this owner lists or closes with the partner, the fee is still owed. You can record that above.</p>}
      <PartnerComms referralId={r.id} status={r.status} />
      {r.status === 'closed' && <FeePanel r={r} onSaved={onSaved} />}
      {history.length > 1 && (
        <ol className="mt-3 border-l border-border pl-4 space-y-1 text-xs text-muted-foreground">
          {history.map((u, i) => <li key={i}>{new Date(u.status_at).toLocaleDateString()}: {REFERRAL_STATUS_LABEL[u.status]}{u.note ? ` (${u.note})` : ''}</li>)}
        </ol>
      )}
    </Card>
  );
}

/** The life of the fee on a closed referral: the commission the partner received, the invoice, the payment. */
function FeePanel({ r, onSaved }: { r: Referral; onSaved: () => void }) {
  const [commission, setCommission] = useState(r.commission_received != null ? String(r.commission_received) : '');
  const [on, setOn] = useState(r.commission_received_on ?? today());
  const [paid, setPaid] = useState(r.fee_amount != null ? String(r.fee_amount) : '');
  const [paidOn, setPaidOn] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try { await api('/api/seller/referrals', { method: 'PATCH', body: { id: r.id, ...body } }); onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const settled = r.fee_status === 'paid' || r.fee_status === 'waived';
  const estimate = r.fee_amount == null ? estimateFee(r.close_price, r.fee_percent) : null;
  const overdue = isOverdue(r);

  return (
    <div className="mt-3 rounded-xl border border-border p-3 text-xs">
      <p className="font-medium">
        Fee: {FEE_STATUS_LABEL[r.fee_status]}
        {r.fee_amount != null && <> · {usd(r.fee_amount)}{r.fee_percent != null ? ` (${r.fee_percent}% of ${usd(r.commission_received ?? 0)})` : ''}</>}
        {r.fee_due_on && !settled && <> · due {new Date(r.fee_due_on + 'T00:00:00').toLocaleDateString()}{overdue && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-red-700">Overdue</span>}</>}
        {r.fee_status === 'paid' && r.fee_paid_amount != null && <> · received {usd(r.fee_paid_amount)} on {r.fee_paid_on && new Date(r.fee_paid_on + 'T00:00:00').toLocaleDateString()}</>}
      </p>
      {estimate !== null && <p className="mt-1 text-muted-foreground">Rough estimate {usd(estimate)} (assumes a 2.5% commission on their side). Enter the real commission to replace it.</p>}
      {!settled && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Commission the partner received"><input inputMode="decimal" className={`${inputCls} !w-36`} value={commission} onChange={(e) => setCommission(e.target.value)} /></Field>
          <Field label="Received on"><input type="date" max={today()} className={`${inputCls} !w-36`} value={on} onChange={(e) => setOn(e.target.value)} /></Field>
          <button className={btnCls} disabled={busy || !commission} onClick={() => send({ fee_event: 'commission_received', commission_received: commission, commission_received_on: on })}>Save commission</button>
          {r.fee_status === 'due' && <button className={btnCls} disabled={busy} onClick={() => send({ fee_event: 'invoiced' })}>Mark invoiced</button>}
          {(r.fee_status === 'due' || r.fee_status === 'invoiced') && (
            <>
              <Field label="Amount received"><input inputMode="decimal" className={`${inputCls} !w-28`} value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>
              <Field label="Paid on"><input type="date" max={today()} className={`${inputCls} !w-36`} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
              <button className={primaryBtnCls} disabled={busy || !paid} onClick={() => send({ fee_event: 'paid', amount: paid, on: paidOn })}>Mark paid</button>
            </>
          )}
          <button className={btnCls} disabled={busy} onClick={() => { if (window.confirm('Waive this fee? This cannot be undone.')) send({ fee_event: 'waived' }); }}>Waive</button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
