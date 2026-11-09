'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { Card, cx } from '@/app/campaigns/shared';
import {
  CONSENT_PURPOSES, CONSENT_PURPOSE_LABEL, SERVICE_LINES, SERVICE_LINE_LABEL, STAGES, STAGE_LABEL, type ConsentPurpose, type ServiceLine, type Stage,
} from '@/lib/seller/types';
import type { Partner } from './PartnersTab';
import { MessageCard } from './CampaignMessages';
import { CHOICES, messagesForChoice, type Choice } from '@/lib/seller/outreachCampaign';
import { AuthBadge, Bar, Field, api, btnCls, inputCls, money, primaryBtnCls } from './ui';

type Opp = {
  id: string; lead_id: string; stage: Stage; status: string; intent_score: number; service_fit_score: number; authorization_status: string;
  authority_verified: boolean; authority_role: string | null; decision_status: string | null; timeline: string | null; occupancy: string | null;
  goals: string[]; condition_notes: string | null; price_expectation_low: number | null; price_expectation_high: number | null;
  preferred_channel: string | null; route: ServiceLine | null; partner_id: string | null; next_action: string | null; next_action_at: string | null;
  lost_reason: string | null; signal_text: string | null; reply_choice?: Choice | null; reply_choice_at?: string | null;
};
type Assessment = { id: string; service_line: ServiceLine; eligibility: string; reasons: string[]; est_monthly_revenue: number | null; est_monthly_cost: number | null; assumptions: string | null; reviewed_at: string | null };
type Agreement = { id: string; service_line: string; contract_type: string | null; status: string; monthly_fee: number | null; fee_percent: number | null; signed_at: string | null };
type Revenue = { id: string; service_line: string; kind: string; invoiced: number; collected: number; cost: number; status: string; description: string | null };
type Detail = {
  opportunity: Opp; lead: { contact_name: string | null; contact_phone: string | null; address: string | null; city: string | null; state: string | null; price: number | null; price_type: string | null } | null;
  assessments: Assessment[]; agreements: Agreement[]; revenue: Revenue[];
  consents: Array<{ purpose: ConsentPurpose; granted: boolean; source: string; at: string }>;
  authorization: { status: string; reasons: string[] }; nextStage: Stage; blockers: string[];
};

const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export default function OpportunityPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Opp | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<Detail>(`/api/seller/opportunities/${id}`);
      setD(r); setForm(r.opportunity); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { setD(null); setBlockers([]); load(); api<{ items: Partner[] }>('/api/seller/partners').then((r) => setPartners(r.items)).catch(() => undefined); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null); setBlockers([]);
    try { await fn(); await load(); onChanged(); }
    catch (e) { setError((e as Error).message); setBlockers((e as Error & { blockers?: string[] }).blockers ?? []); }
    finally { setBusy(false); }
  }
  const patch = (body: Record<string, unknown>) => run(() => api(`/api/seller/opportunities/${id}`, { method: 'PATCH', body }));

  if (!d || !form) return <Card className="p-8 flex justify-center">{error ? <p className="text-sm text-red-700">{error}</p> : <Loader2 className="animate-spin" />}</Card>;
  const set = <K extends keyof Opp>(k: K, v: Opp[K]) => setForm({ ...form, [k]: v });
  const opp = d.opportunity;
  const closed = opp.status === 'won' || opp.status === 'lost';
  const atLast = opp.stage === STAGES[STAGES.length - 1];

  function saveQualification() {
    patch({
      authority_verified: form!.authority_verified, authority_role: form!.authority_role, decision_status: form!.decision_status, timeline: form!.timeline,
      occupancy: form!.occupancy, goals: form!.goals, condition_notes: form!.condition_notes, price_expectation_low: form!.price_expectation_low,
      price_expectation_high: form!.price_expectation_high, preferred_channel: form!.preferred_channel, route: form!.route, partner_id: form!.partner_id,
      next_action: form!.next_action, next_action_at: form!.next_action_at ? new Date(form!.next_action_at).toISOString() : null,
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">{d.lead?.contact_name || 'Unnamed owner'}</h2>
            <p className="text-xs text-muted-foreground">{[d.lead?.address, d.lead?.city, d.lead?.state].filter(Boolean).join(', ')}{d.lead?.contact_phone ? ` · ${d.lead.contact_phone}` : ''}</p>
            <a href={`/lead-profile?id=${encodeURIComponent(opp.lead_id)}`} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">Open lead profile <ExternalLink size={11} /></a>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-muted"><X size={16} /></button>
        </div>
        {opp.signal_text && <p className="mt-3 rounded-xl bg-muted/60 p-3 text-sm italic">&ldquo;{opp.signal_text}&rdquo;</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs font-medium text-muted-foreground">Seller intent</p><p className="text-lg font-bold">{opp.intent_score}</p><Bar value={opp.intent_score} /></div>
          <div><p className="text-xs font-medium text-muted-foreground">Service fit</p><p className="text-lg font-bold">{opp.service_fit_score}</p><Bar value={opp.service_fit_score} tone="green" /></div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Authorization (hard gate)</p>
            <div className="mt-1.5"><AuthBadge status={d.authorization.status} /></div>
            {d.authorization.reasons.map((r) => <p key={r} className="mt-1 text-[11px] text-muted-foreground">{r}</p>)}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">A high score is never permission. Permission is recorded separately below, and an opt-out always stops the next step.</p>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {STAGES.map((s) => (
            <span key={s} className={cx('rounded-full px-2.5 py-1 text-[11px] font-medium', s === opp.stage ? 'bg-primary text-primary-foreground' : STAGES.indexOf(s) < STAGES.indexOf(opp.stage) ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{STAGE_LABEL[s]}</span>
          ))}
        </div>
        {!closed && !atLast && (
          <div className="mt-3">
            <button disabled={busy} onClick={() => patch({ stage: d.nextStage })} className={primaryBtnCls}>Move to: {STAGE_LABEL[d.nextStage]}</button>
            {d.blockers.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 space-y-0.5">{d.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            )}
          </div>
        )}
        {opp.reply_choice && CHOICES[opp.reply_choice] && (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="reply-choice">
            <p className="text-sm font-semibold">Owner answered {CHOICES[opp.reply_choice].number}: {CHOICES[opp.reply_choice].label}</p>
            <p className="text-xs text-muted-foreground">
              Suggested path: {CHOICES[opp.reply_choice].destination}. Next: {CHOICES[opp.reply_choice].nextAction}. This is only the owner&rsquo;s answer; confirm who they are and record their permission before routing.
            </p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              {messagesForChoice(opp.reply_choice).map((m) => (
                <MessageCard key={m.id} message={m} vars={{ first_name: (d.lead?.contact_name ?? '').split(' ')[0], address: [d.lead?.address, d.lead?.city].filter(Boolean).join(', ') }} />
              ))}
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {blockers.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-red-700 space-y-0.5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Qualification</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.authority_verified} onChange={(e) => set('authority_verified', e.target.checked)} /> I confirmed this person owns the property or can decide for the owner</label>
          <Field label="Their role">
            <select className={inputCls} value={form.authority_role ?? ''} onChange={(e) => set('authority_role', (e.target.value || null) as Opp['authority_role'])}>
              <option value="">Not set</option><option value="owner">Owner</option><option value="co_owner">Co-owner</option><option value="agent">Agent for the owner</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Decision-making">
            <select className={inputCls} value={form.decision_status ?? ''} onChange={(e) => set('decision_status', e.target.value || null)}>
              <option value="">Not set</option><option value="sole_decision_maker">Decides alone</option><option value="needs_others">Needs others to agree</option><option value="unknown">Unknown</option>
            </select>
          </Field>
          <Field label="Timeline"><input className={inputCls} placeholder="in 3 months" value={form.timeline ?? ''} onChange={(e) => set('timeline', e.target.value || null)} /></Field>
          <Field label="Occupancy">
            <select className={inputCls} value={form.occupancy ?? ''} onChange={(e) => set('occupancy', e.target.value || null)}>
              <option value="">Not set</option><option value="owner_occupied">Owner lives there</option><option value="tenant_occupied">Tenant lives there</option><option value="vacant">Vacant</option><option value="short_term_rental">Short-term rental</option><option value="unknown">Unknown</option>
            </select>
          </Field>
          <Field label="Goals (comma separated)"><input className={inputCls} placeholder="sell, keep as rental" value={form.goals.join(', ')} onChange={(e) => set('goals', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></Field>
          <Field label="Preferred contact">
            <select className={inputCls} value={form.preferred_channel ?? ''} onChange={(e) => set('preferred_channel', e.target.value || null)}>
              <option value="">Not set</option><option value="sms">Text</option><option value="call">Call</option><option value="email">Email</option>
            </select>
          </Field>
          <Field label="Expected price, low"><input type="number" className={inputCls} value={form.price_expectation_low ?? ''} onChange={(e) => set('price_expectation_low', e.target.value === '' ? null : Number(e.target.value))} /></Field>
          <Field label="Expected price, high"><input type="number" className={inputCls} value={form.price_expectation_high ?? ''} onChange={(e) => set('price_expectation_high', e.target.value === '' ? null : Number(e.target.value))} /></Field>
          <Field label="Condition notes" className="sm:col-span-2"><textarea className={`${inputCls} h-16 py-2`} value={form.condition_notes ?? ''} onChange={(e) => set('condition_notes', e.target.value || null)} /></Field>
          <Field label="Route to">
            <select className={inputCls} value={form.route ?? ''} onChange={(e) => set('route', (e.target.value || null) as ServiceLine | null)}>
              <option value="">Not chosen</option>{SERVICE_LINES.map((s) => <option key={s} value={s}>{SERVICE_LINE_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Partner">
            <select className={inputCls} value={form.partner_id ?? ''} onChange={(e) => set('partner_id', e.target.value || null)}>
              <option value="">None</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Next action"><input className={inputCls} value={form.next_action ?? ''} onChange={(e) => set('next_action', e.target.value || null)} /></Field>
          <Field label="Due"><input type="datetime-local" className={inputCls} value={toLocalInput(form.next_action_at)} onChange={(e) => set('next_action_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></Field>
        </div>
        <div className="mt-3"><button disabled={busy} onClick={saveQualification} className={primaryBtnCls}>{busy && <Loader2 size={14} className="animate-spin" />} Save</button></div>
      </Card>

      <ConsentCard d={d} busy={busy} run={run} />
      <EligibilityCard d={d} busy={busy} run={run} />
      <MoneyCard d={d} busy={busy} run={run} partners={partners} />

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Outcome</h3>
        {closed ? (
          <p className="mt-2 text-sm">Marked <b>{opp.status}</b>{opp.lost_reason ? `: ${opp.lost_reason}` : ''}. <button className="text-primary underline" onClick={() => patch({ status: 'open' })}>Reopen</button></p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btnCls} disabled={busy} onClick={() => patch({ status: 'won' })}>Mark won</button>
            <button className={btnCls} disabled={busy} onClick={() => patch({ status: 'paused' })}>Pause</button>
            <button className={btnCls} disabled={busy} onClick={() => { const why = window.prompt('Why was this lost?'); if (why) patch({ status: 'lost', lost_reason: why }); }}>Mark lost</button>
          </div>
        )}
      </Card>
    </div>
  );
}

type Runner = (fn: () => Promise<unknown>) => Promise<void>;

function ConsentCard({ d, busy, run }: { d: Detail; busy: boolean; run: Runner }) {
  const [purpose, setPurpose] = useState<ConsentPurpose>('seller_consultation');
  const [source, setSource] = useState('phone_call');
  const [evidence, setEvidence] = useState('');
  const state = (p: ConsentPurpose) => d.consents.find((c) => c.purpose === p);
  const record = (granted: boolean) => run(() => api('/api/seller/consents', { method: 'POST', body: { leadId: d.opportunity.lead_id, purpose, granted, source, evidence } }));

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">Permissions</h3>
      <p className="mt-1 text-xs text-muted-foreground">Permission is kept for each purpose. A yes to the estimate follow-up does not cover a sale, management or sharing details with a partner.</p>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {CONSENT_PURPOSES.map((p) => {
          const s = state(p);
          return (
            <li key={p} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
              <span>{CONSENT_PURPOSE_LABEL[p]}</span>
              <span className={cx('text-xs font-medium', s?.granted ? 'text-emerald-700' : s ? 'text-red-700' : 'text-muted-foreground')}>{s ? (s.granted ? 'Granted' : 'Withdrawn') : 'Not asked'}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Purpose"><select className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value as ConsentPurpose)}>{CONSENT_PURPOSES.map((p) => <option key={p} value={p}>{CONSENT_PURPOSE_LABEL[p]}</option>)}</select></Field>
        <Field label="How it was given"><select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}><option value="phone_call">Phone call</option><option value="text_reply">Text reply</option><option value="email_reply">Email reply</option><option value="in_person">In person</option><option value="signed_form">Signed form</option></select></Field>
        <Field label="What they said"><input className={inputCls} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Said yes to talk about selling" /></Field>
      </div>
      <div className="mt-3 flex gap-2">
        <button className={primaryBtnCls} disabled={busy} onClick={() => record(true)}>Record permission</button>
        <button className={btnCls} disabled={busy} onClick={() => record(false)}>Record withdrawal</button>
      </div>
    </Card>
  );
}

function EligibilityCard({ d, busy, run }: { d: Detail; busy: boolean; run: Runner }) {
  const review = (serviceLine: string, eligibility: string) => run(() => api(`/api/seller/opportunities/${d.opportunity.id}/assessments`, { method: 'PATCH', body: { serviceLine, eligibility } }));
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">Service eligibility (a person decides)</h3>
      <p className="mt-1 text-xs text-muted-foreground">These are suggestions from the property and the reply. Nothing is approved until you review the rules, licensing and the owner&rsquo;s situation.</p>
      <div className="mt-3 space-y-3">
        {d.assessments.map((a) => (
          <div key={a.id} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{SERVICE_LINE_LABEL[a.service_line]}</p>
              <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', a.eligibility === 'eligible' ? 'bg-emerald-100 text-emerald-800' : a.eligibility === 'ineligible' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800')}>
                {a.eligibility === 'needs_review' ? 'Needs review' : a.eligibility === 'eligible' ? 'Approved' : 'Not eligible'}
              </span>
            </div>
            <ul className="mt-1.5 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={btnCls} disabled={busy} onClick={() => review(a.service_line, 'eligible')}>Approve</button>
              <button className={btnCls} disabled={busy} onClick={() => review(a.service_line, 'ineligible')}>Not eligible</button>
              {a.eligibility !== 'needs_review' && <button className={btnCls} disabled={busy} onClick={() => review(a.service_line, 'needs_review')}>Reset</button>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MoneyCard({ d, busy, run, partners }: { d: Detail; busy: boolean; run: Runner; partners: Partner[] }) {
  const [ag, setAg] = useState({ service_line: 'long_term_management', contract_type: '', status: 'draft', monthly_fee: '', fee_percent: '', partner_id: '' });
  const [rev, setRev] = useState({ service_line: 'long_term_management', kind: 'management_fee', invoiced: '', collected: '', cost: '', status: 'invoiced' });
  const oppId = d.opportunity.id;
  const num = (v: string) => (v === '' ? null : Number(v));

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">Agreements</h3>
      {d.agreements.length > 0 && (
        <ul className="mt-2 divide-y divide-border text-sm">
          {d.agreements.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{SERVICE_LINE_LABEL[a.service_line as ServiceLine] ?? a.service_line}{a.contract_type ? ` · ${a.contract_type}` : ''}{a.monthly_fee ? ` · ${money(a.monthly_fee)}/mo` : ''}{a.fee_percent ? ` · ${a.fee_percent}%` : ''}</span>
              <select className={`${inputCls} !w-auto`} value={a.status} onChange={(e) => run(() => api('/api/seller/agreements', { method: 'PATCH', body: { id: a.id, status: e.target.value, ...(e.target.value === 'signed' ? { signed_at: new Date().toISOString() } : {}) } }))}>
                {['draft', 'sent', 'signed', 'active', 'cancelled', 'completed'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Service"><select className={inputCls} value={ag.service_line} onChange={(e) => setAg({ ...ag, service_line: e.target.value })}>{SERVICE_LINES.map((s) => <option key={s} value={s}>{SERVICE_LINE_LABEL[s]}</option>)}</select></Field>
        <Field label="Contract type"><input className={inputCls} placeholder="Management agreement" value={ag.contract_type} onChange={(e) => setAg({ ...ag, contract_type: e.target.value })} /></Field>
        <Field label="Partner"><select className={inputCls} value={ag.partner_id} onChange={(e) => setAg({ ...ag, partner_id: e.target.value })}><option value="">None</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Monthly fee"><input type="number" className={inputCls} value={ag.monthly_fee} onChange={(e) => setAg({ ...ag, monthly_fee: e.target.value })} /></Field>
        <Field label="Fee percent"><input type="number" className={inputCls} value={ag.fee_percent} onChange={(e) => setAg({ ...ag, fee_percent: e.target.value })} /></Field>
      </div>
      <div className="mt-3"><button className={btnCls} disabled={busy} onClick={() => run(() => api('/api/seller/agreements', { method: 'POST', body: { opportunity_id: oppId, service_line: ag.service_line, contract_type: ag.contract_type, status: ag.status, monthly_fee: num(ag.monthly_fee), fee_percent: num(ag.fee_percent), partner_id: ag.partner_id || null } }))}>Add agreement</button></div>

      <h3 className="mt-6 text-sm font-semibold">Revenue and cost</h3>
      {d.revenue.length > 0 && (
        <ul className="mt-2 divide-y divide-border text-sm">
          {d.revenue.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{SERVICE_LINE_LABEL[r.service_line as ServiceLine] ?? r.service_line} · {r.kind.replace(/_/g, ' ')}</span>
              <span className="text-xs text-muted-foreground">invoiced {money(r.invoiced)} · collected {money(r.collected)} · cost {money(r.cost)} · {r.status}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Service"><select className={inputCls} value={rev.service_line} onChange={(e) => setRev({ ...rev, service_line: e.target.value })}>{SERVICE_LINES.map((s) => <option key={s} value={s}>{SERVICE_LINE_LABEL[s]}</option>)}</select></Field>
        <Field label="Kind"><select className={inputCls} value={rev.kind} onChange={(e) => setRev({ ...rev, kind: e.target.value })}>{['management_fee', 'setup_fee', 'referral_fee', 'readiness_fee', 'other'].map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}</select></Field>
        <Field label="Status"><select className={inputCls} value={rev.status} onChange={(e) => setRev({ ...rev, status: e.target.value })}>{['invoiced', 'partial', 'paid', 'void'].map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
        <Field label="Invoiced"><input type="number" className={inputCls} value={rev.invoiced} onChange={(e) => setRev({ ...rev, invoiced: e.target.value })} /></Field>
        <Field label="Collected"><input type="number" className={inputCls} value={rev.collected} onChange={(e) => setRev({ ...rev, collected: e.target.value })} /></Field>
        <Field label="Cost to deliver"><input type="number" className={inputCls} value={rev.cost} onChange={(e) => setRev({ ...rev, cost: e.target.value })} /></Field>
      </div>
      <div className="mt-3"><button className={btnCls} disabled={busy} onClick={() => run(() => api('/api/seller/revenue', { method: 'POST', body: { opportunity_id: oppId, service_line: rev.service_line, kind: rev.kind, status: rev.status, invoiced: num(rev.invoiced) ?? 0, collected: num(rev.collected) ?? 0, cost: num(rev.cost) ?? 0, invoice_date: new Date().toISOString().slice(0, 10) } }))}>Add revenue entry</button></div>
    </Card>
  );
}
