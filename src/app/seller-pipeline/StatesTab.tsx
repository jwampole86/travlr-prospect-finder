'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Card } from '@/app/campaigns/shared';
import { ACTIVATION_QUESTIONS, JURISDICTIONS, activationCsv, activationProgress, emptyActivation, stateBlockers, type ActivationRow, type ActivationStatus, type Answer } from '@/lib/seller/stateActivation';
import { SETTLEMENT_POLICY } from '@/lib/seller/settlementPolicy';
import { Field, api, btnCls, inputCls, primaryBtnCls } from './ui';

const STATUS_LABEL: Record<ActivationStatus, string> = { not_active: 'Not active', pilot: 'Pilot', live: 'Live' };
const ANSWER_LABEL: Record<Answer, string> = { unknown: 'Not checked', yes: 'Yes', no: 'No' };

/** One place to clear a state before leads are sent there: the four questions, the regulator's own lookup, and counsel's sign-off. */
export default function StatesTab() {
  const [rows, setRows] = useState<ActivationRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows((await api<{ items: ActivationRow[] }>('/api/seller/states')).items); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const byState = new Map((rows ?? []).map((r) => [r.state, r]));
  const get = (code: string) => byState.get(code) ?? emptyActivation(code);
  const progress = activationProgress(rows ?? []);
  const shown = JURISDICTIONS.filter((j) => filter === 'all' || (filter === 'on' ? get(j.code).status !== 'not_active' : get(j.code).status === 'not_active'));

  function download() {
    const blob = new Blob([activationCsv(rows ?? [])], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'state-activation.csv'; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-semibold">State activation</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
          Activate states one at a time, in the order seller-intent volume appears. A lead is only sent to a partner broker when its state is switched on here
          with counsel&rsquo;s sign-off recorded, and the partner is licensed in that state. Check each state on its regulator&rsquo;s own site; the answers here are yours to confirm, not legal advice.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">Live {progress.live}</span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">Pilot {progress.pilot}</span>
          <span className="rounded-full bg-muted px-2.5 py-1">Not active {progress.notActive}</span>
          <span className="text-muted-foreground">Counsel reviewed {progress.counselReviewed} of {JURISDICTIONS.length}</span>
          <span className="flex-1" />
          {(['all', 'on', 'off'] as const).map((f) => <button key={f} className={`${btnCls} !h-8 ${filter === f ? '!bg-muted' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All 51' : f === 'on' ? 'Switched on' : 'Not active'}</button>)}
          <button className={`${btnCls} !h-8`} onClick={download} disabled={!rows}><Download size={13} /> Download CSV</button>
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </Card>

      <Card className="p-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Escrow, title and mortgage: what NAVEO does and does not do</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 text-xs">
            <div>
              <p className="font-medium text-sm">Does</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground space-y-1">{SETTLEMENT_POLICY.does.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div>
              <p className="font-medium text-sm">Does not</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground space-y-1">{SETTLEMENT_POLICY.doesNot.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Escrow, title and mortgage are settlement services. Paying or receiving a fee for referring that business on a federally related mortgage can violate RESPA Section 8 (12 U.S.C. 2607). Escrow itself is licensed and bonded by a different regulator in each state (Arizona DIFI, Nevada Mortgage Lending Division, Colorado title and insurance rules). If a partner or a title or escrow company offers money per closing, decline until counsel has reviewed it.</p>
        </details>
      </Card>

      {!rows ? <Card className="p-8 flex justify-center"><Loader2 className="animate-spin" /></Card> : shown.map((j) => (
        <StateCard key={j.code} code={j.code} name={j.name} regulator={j.regulator} row={get(j.code)} open={open === j.code} onToggle={() => setOpen(open === j.code ? null : j.code)} onSaved={load} />
      ))}
    </div>
  );
}

function StateCard({ code, name, regulator, row, open, onToggle, onSaved }: { code: string; name: string; regulator: string; row: ActivationRow; open: boolean; onToggle: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(row);
  const [reviewed, setReviewed] = useState(row.counsel_reviewed_at?.slice(0, 10) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setForm(row); setReviewed(row.counsel_reviewed_at?.slice(0, 10) ?? ''); }, [row]);

  async function save() {
    setBusy(true); setError(null);
    try {
      await api('/api/seller/states', { method: 'PATCH', body: { ...form, state: code, counsel_reviewed_at: reviewed || null } });
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const tone = row.status === 'live' ? 'bg-emerald-100 text-emerald-800' : row.status === 'pilot' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground';
  const missing = stateBlockers({ ...form, counsel_reviewed_at: reviewed || null, status: form.status }, code);

  return (
    <Card className="p-4">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={onToggle} aria-expanded={open}>
        <span><span className="font-semibold">{name}</span> <span className="text-xs text-muted-foreground">{code} · {regulator}</span></span>
        <span className="flex items-center gap-2 text-xs">
          {row.counsel_reviewed_at && <span className="text-muted-foreground">Counsel {new Date(row.counsel_reviewed_at).toLocaleDateString()}</span>}
          <span className={`rounded-full px-2.5 py-0.5 font-medium ${tone}`}>{STATUS_LABEL[row.status]}</span>
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {ACTIVATION_QUESTIONS.map((q) => (
              <Field key={q.key} label={q.label}>
                <select className={inputCls} value={form[q.key]} onChange={(e) => setForm({ ...form, [q.key]: e.target.value as Answer })}>
                  {(['unknown', 'yes', 'no'] as const).map((a) => <option key={a} value={a}>{ANSWER_LABEL[a]}</option>)}
                </select>
              </Field>
            ))}
            <Field label="Out-of-state payee rules"><textarea className={`${inputCls} h-20 py-2`} value={form.out_of_state_notes ?? ''} onChange={(e) => setForm({ ...form, out_of_state_notes: e.target.value })} /></Field>
            <Field label="Statutes or rules checked"><textarea className={`${inputCls} h-20 py-2`} value={form.citations ?? ''} onChange={(e) => setForm({ ...form, citations: e.target.value })} /></Field>
            <Field label="Official license lookup URL"><input className={inputCls} value={form.lookup_url ?? ''} onChange={(e) => setForm({ ...form, lookup_url: e.target.value })} placeholder="Regulator's own site" /></Field>
            <Field label="Notes"><input className={inputCls} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <Field label="Counsel who reviewed"><input className={inputCls} value={form.counsel_name ?? ''} onChange={(e) => setForm({ ...form, counsel_name: e.target.value })} /></Field>
            <Field label="Counsel review date"><input type="date" max={new Date().toISOString().slice(0, 10)} className={inputCls} value={reviewed} onChange={(e) => setReviewed(e.target.value)} /></Field>
            <Field label="Status">
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ActivationStatus })}>
                {(['not_active', 'pilot', 'live'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
          </div>
          {form.status !== 'not_active' && missing.length > 0 && <ul className="list-disc pl-5 text-xs text-amber-800">{missing.filter((m) => !/not switched on/.test(m)).map((m) => <li key={m}>{m}</li>)}</ul>}
          {row.lookup_url && <p className="text-xs"><a className="text-primary underline" href={row.lookup_url} target="_blank" rel="noreferrer">Open the {name} license lookup</a></p>}
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className={primaryBtnCls} disabled={busy} onClick={save}>{busy && <Loader2 size={14} className="animate-spin" />} Save {code}</button>
        </div>
      )}
    </Card>
  );
}
