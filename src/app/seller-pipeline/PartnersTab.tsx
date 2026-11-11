'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Card } from '@/app/campaigns/shared';
import { SERVICE_LINES, SERVICE_LINE_LABEL } from '@/lib/seller/types';
import { Field, api, btnCls, inputCls, primaryBtnCls } from './ui';
import PartnerPlaybook from './PartnerPlaybook';
import { isAutomatic } from '@/lib/seller/licenseVerify';
import { nextTouch } from '@/lib/seller/partnerOutreach';
import { settlementTermsWarning } from '@/lib/seller/settlementPolicy';
import { LICENSE_RECHECK_DAYS, licenseCheckAgeDays, licenseLookupFor, scorePartner, type PartnerScore, type ReferralRow } from '@/lib/seller/partnerReferrals';

type LicenseCheck = { outcome: string; message: string; source: string; checkedAt: string; record?: { name: string; type: string; status: string; expires: string | null; employer: string | null; discipline: string | null; url: string | null } | null };
const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const OUTCOME_TONE: Record<string, string> = { verified: 'text-emerald-700', inactive: 'text-red-700', needs_review: 'text-amber-800', not_found: 'text-amber-800', error: 'text-amber-800', manual: 'text-muted-foreground' };

function LicenseCheckNote({ check }: { check: LicenseCheck }) {
  const r = check.record;
  return (
    <p className={`mt-1 text-xs ${OUTCOME_TONE[check.outcome] ?? ''}`}>
      State record check ({new Date(check.checkedAt).toLocaleDateString()}): {check.message}
      {r && <span className="text-muted-foreground"> {r.name} · {r.type} · {r.status}{r.employer ? ` · ${r.employer}` : ''}{r.discipline ? ` · Discipline: ${r.discipline}` : ''}</span>}
    </p>
  );
}

const exhibitSummary = (p: Partner) => [
  p.referral_fee_percent != null && (p.referral_fee_percent + '% fee'),
  p.protection_days != null && (p.protection_days + '-day protection'),
  p.payment_due_days != null && ('due ' + p.payment_due_days + ' business days after they are paid'),
  p.exclusive_territory ? 'exclusive: ' + p.exclusive_territory : 'non-exclusive',
  p.responsible_broker && ('responsible broker ' + p.responsible_broker),
  p.agreement_signed_on && ('signed ' + new Date(p.agreement_signed_on + 'T00:00:00').toLocaleDateString()),
].filter(Boolean).join(' · ');

const RECRUIT = [['to_contact', 'To contact'], ['emailed', 'Emailed'], ['call_booked', 'Call booked'], ['partner', 'Partner'], ['pass', 'Pass']] as const;
const YES_NO = [['unknown', 'Unknown'], ['yes', 'Yes'], ['no', 'No']] as const;
const ROLES = [['team_lead', 'Team lead'], ['broker', 'Broker'], ['agent', 'Agent'], ['vendor', 'Vendor']] as const;

export type Partner = {
  id: string; name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; services: string[];
  license_type: string | null; license_number: string | null; license_state: string | null; license_status: string; states: string[];
  relationship_status: string; compensation_terms: string | null; legal_reviewed: boolean; agreement_on_file: boolean; notes: string | null;
  outreach_started_at?: string | null; outreach_step?: number; license_verified_at?: string | null; partner_role?: string | null; brokerage?: string | null; niche?: string | null; accepts_referrals?: string; will_report?: string;
  markets?: string[]; property_types?: string[]; price_min?: number | null; price_max?: number | null; max_open_leads?: number | null; do_not_assign?: boolean;
  payment_method?: string | null; payee_name?: string | null; preferred_invoice_email?: string | null; w9_on_file?: boolean; license_check?: LicenseCheck | null;
  responsible_broker?: string | null; referral_fee_percent?: number | null; protection_days?: number | null; payment_due_days?: number | null; exclusive_territory?: string | null; agreement_signed_on?: string | null;
  referral_fee_range?: string | null; update_method?: string | null; excluded_areas?: string | null; recruit_status?: string; license_lookup_url?: string | null;
};

const EMPTY = { name: '', contact_name: '', contact_email: '', contact_phone: '', services: ['sale_partner'] as string[], license_type: '', license_number: '', license_state: '', states: '', compensation_terms: '', partner_role: 'broker', brokerage: '', niche: '', accepts_referrals: 'unknown', will_report: 'unknown', referral_fee_range: '', update_method: '', recruit_status: 'to_contact', markets: '', property_types: '', max_open_leads: '', price_min: '', price_max: '', payment_method: '', payee_name: '', preferred_invoice_email: '', payment_instructions: '', w9_on_file: 'false', fee_notes: '',
  responsible_broker: '', referral_fee_percent: '', protection_days: '', payment_due_days: '', exclusive_territory: '', agreement_signed_on: '' };

export default function PartnersTab() {
  const [items, setItems] = useState<Partner[] | null>(null);
  const [referrals, setReferrals] = useState<Array<ReferralRow & { partner_id: string }>>([]);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: Partner[] }>('/api/seller/partners')).items);
      setReferrals((await api<{ items: Array<ReferralRow & { partner_id: string }> }>('/api/seller/referrals')).items);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setBusy(true); setError(null);
    try {
      await api('/api/seller/partners', { method: 'POST', body: { ...form, states: form.states.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean), markets: split(form.markets), property_types: split(form.property_types).map((t) => t.toLowerCase()), w9_on_file: form.w9_on_file === 'true', license_lookup_url: form.license_state ? licenseLookupFor(form.license_state).url : '' } });
      setForm(EMPTY); setOpen(false); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const [checking, setChecking] = useState<string | null>(null);
  async function verify(id: string) {
    setChecking(id); setError(null);
    try { await api('/api/seller/partners/verify', { method: 'POST', body: { id } }); await load(); } catch (e) { setError((e as Error).message); } finally { setChecking(null); }
  }
  /** Records that the next email in the sequence went out. The first one starts the clock for the day-3 and day-7 emails. */
  function logOutreach(p: Partner) {
    const step = (p.outreach_step ?? 0) + 1;
    return patch(p.id, { outreach_step: step, ...(step === 1 ? { outreach_started_at: new Date().toISOString() } : {}), recruit_status: p.recruit_status === 'to_contact' || !p.recruit_status ? 'emailed' : p.recruit_status, last_contacted_at: new Date().toISOString() });
  }
  async function patch(id: string, body: Record<string, unknown>) {
    try { await api('/api/seller/partners', { method: 'PATCH', body: { id, ...body } }); await load(); } catch (e) { setError((e as Error).message); }
  }

  const scores = new Map<string, PartnerScore>();
  for (const p of items ?? []) scores.set(p.id, scorePartner(referrals.filter((r) => r.partner_id === p.id)));
  const flagged = (items ?? []).filter((p) => scores.get(p.id)?.flag === 'stopped');
  const shown = (items ?? []).filter((p) => filter === 'all' || (filter === 'due' ? p.recruit_status === 'emailed' && nextTouch(p.outreach_started_at, p.outreach_step ?? 0).overdue : filter === 'flagged' ? scores.get(p.id)?.flag !== 'ok' : (p.recruit_status ?? 'to_contact') === filter));
  const dueCount = (items ?? []).filter((p) => (p.recruit_status === 'emailed') && nextTouch(p.outreach_started_at, p.outreach_step ?? 0).overdue).length;
  const countBy = (st: string) => (items ?? []).filter((p) => (p.recruit_status ?? 'to_contact') === st).length;

  return (
    <div className="space-y-4">
      <PartnerPlaybook prospects={(items ?? []).filter((p) => p.recruit_status !== 'partner' && p.recruit_status !== 'pass')} />
      {items && items.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button className={`${btnCls} !h-8 ${filter === 'all' ? '!bg-muted' : ''}`} onClick={() => setFilter('all')}>All {items.length}</button>
            {RECRUIT.map(([v, l]) => <button key={v} className={`${btnCls} !h-8 ${filter === v ? '!bg-muted' : ''}`} onClick={() => setFilter(v)}>{l} {countBy(v)}</button>)}
            <button className={`${btnCls} !h-8 ${filter === 'due' ? '!bg-muted' : ''}`} onClick={() => setFilter('due')}>Follow-up due {dueCount}</button>
            <button className={`${btnCls} !h-8 ${filter === 'flagged' ? '!bg-muted' : ''}`} onClick={() => setFilter('flagged')}>Needs attention {(items ?? []).filter((p) => scores.get(p.id)?.flag !== 'ok').length}</button>
          </div>
          {flagged.length > 0 && <p className="mt-3 text-xs text-red-700">Not reporting: {flagged.map((p) => p.name).join(', ')}. Consider pausing them until they update their referrals.</p>}
        </Card>
      )}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Service partners</h2>
            <p className="mt-1 text-xs text-muted-foreground max-w-2xl">Brokerages and vendors you may route owners to. A sale referral is only allowed once the partner's license is verified, the arrangement has had legal review, and the signed agreement is on file.</p>
          </div>
          <button onClick={() => setOpen(!open)} className={primaryBtnCls}><Plus size={14} /> Add partner</button>
        </div>
        {open && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Contact name"><input className={inputCls} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
            <Field label="Contact email"><input className={inputCls} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
            <Field label="Contact phone"><input className={inputCls} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></Field>
            <Field label="License type"><input className={inputCls} placeholder="Real estate broker" value={form.license_type} onChange={(e) => setForm({ ...form, license_type: e.target.value })} /></Field>
            <Field label="License number"><input className={inputCls} value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} /></Field>
            <Field label="License state"><input className={inputCls} maxLength={2} value={form.license_state} onChange={(e) => setForm({ ...form, license_state: e.target.value.toUpperCase() })} /></Field>
            <Field label="Service states (comma separated)"><input className={inputCls} placeholder="CO, TX" value={form.states} onChange={(e) => setForm({ ...form, states: e.target.value })} /></Field>
            <Field label="Services">
              <select multiple className={`${inputCls} h-24`} value={form.services} onChange={(e) => setForm({ ...form, services: [...e.target.selectedOptions].map((o) => o.value) })}>
                {SERVICE_LINES.map((s) => <option key={s} value={s}>{SERVICE_LINE_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="Role"><select className={inputCls} value={form.partner_role} onChange={(e) => setForm({ ...form, partner_role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Brokerage"><input className={inputCls} placeholder="Keller Williams Tucson" value={form.brokerage} onChange={(e) => setForm({ ...form, brokerage: e.target.value })} /></Field>
            <Field label="Niche"><input className={inputCls} placeholder="Investment, STR, second home" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} /></Field>
            <Field label="Accepts referrals?"><select className={inputCls} value={form.accepts_referrals} onChange={(e) => setForm({ ...form, accepts_referrals: e.target.value })}>{YES_NO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Will report outcomes?"><select className={inputCls} value={form.will_report} onChange={(e) => setForm({ ...form, will_report: e.target.value })}>{YES_NO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Typical referral fee"><input className={inputCls} placeholder="25% of their side" value={form.referral_fee_range} onChange={(e) => setForm({ ...form, referral_fee_range: e.target.value })} /></Field>
            <Field label="Preferred update method"><input className={inputCls} placeholder="Email reply, shared sheet, CRM note" value={form.update_method} onChange={(e) => setForm({ ...form, update_method: e.target.value })} /></Field>
            <Field label="Markets they work (comma separated)"><input className={inputCls} placeholder="Tucson, Pima County" value={form.markets} onChange={(e) => setForm({ ...form, markets: e.target.value })} /></Field>
            <Field label="Property types (comma separated)"><input className={inputCls} placeholder="sfr, condo, townhome, luxury" value={form.property_types} onChange={(e) => setForm({ ...form, property_types: e.target.value })} /></Field>
            <Field label="Max open leads"><input inputMode="numeric" className={inputCls} placeholder="15" value={form.max_open_leads} onChange={(e) => setForm({ ...form, max_open_leads: e.target.value })} /></Field>
            <Field label="Lowest price they take ($)"><input inputMode="numeric" className={inputCls} value={form.price_min} onChange={(e) => setForm({ ...form, price_min: e.target.value })} /></Field>
            <Field label="Highest price they take ($)"><input inputMode="numeric" className={inputCls} value={form.price_max} onChange={(e) => setForm({ ...form, price_max: e.target.value })} /></Field>
            <Field label="How they pay"><select className={inputCls} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}><option value="">Not set</option><option value="ach">ACH</option><option value="check">Check</option><option value="wire">Wire</option><option value="other">Other</option></select></Field>
            <Field label="Exact legal payee (usually the brokerage)"><input className={inputCls} placeholder="Desert Peak Realty LLC" value={form.payee_name} onChange={(e) => setForm({ ...form, payee_name: e.target.value })} /></Field>
            <Field label="Invoice email"><input type="email" className={inputCls} value={form.preferred_invoice_email} onChange={(e) => setForm({ ...form, preferred_invoice_email: e.target.value })} /></Field>
            <Field label="Payment notes (no account numbers)" className="sm:col-span-2"><input className={inputCls} placeholder="Wire details are in the vault, ref ..." value={form.payment_instructions} onChange={(e) => setForm({ ...form, payment_instructions: e.target.value })} /></Field>
            <Field label="W-9 on file"><select className={inputCls} value={form.w9_on_file} onChange={(e) => setForm({ ...form, w9_on_file: e.target.value })}><option value="false">No</option><option value="true">Yes</option></select></Field>
            <Field label="Fee notes"><input className={inputCls} placeholder="30% for 90 days, then 25%" value={form.fee_notes} onChange={(e) => setForm({ ...form, fee_notes: e.target.value })} /></Field>
            <Field label="Responsible broker (Exhibit A)"><input className={inputCls} value={form.responsible_broker} onChange={(e) => setForm({ ...form, responsible_broker: e.target.value })} /></Field>
            <Field label="Referral fee, % of their commission"><input inputMode="decimal" className={inputCls} placeholder="25" value={form.referral_fee_percent} onChange={(e) => setForm({ ...form, referral_fee_percent: e.target.value })} /></Field>
            <Field label="Protection period (days)"><input inputMode="numeric" className={inputCls} placeholder="180" value={form.protection_days} onChange={(e) => setForm({ ...form, protection_days: e.target.value })} /></Field>
            <Field label="Fee due (business days after they are paid)"><input inputMode="numeric" className={inputCls} placeholder="10" value={form.payment_due_days} onChange={(e) => setForm({ ...form, payment_due_days: e.target.value })} /></Field>
            <Field label="Exclusive territory (blank = non-exclusive)"><input className={inputCls} value={form.exclusive_territory} onChange={(e) => setForm({ ...form, exclusive_territory: e.target.value })} /></Field>
            <Field label="Agreement signed on"><input type="date" className={inputCls} value={form.agreement_signed_on} onChange={(e) => setForm({ ...form, agreement_signed_on: e.target.value })} /></Field>
            <Field label="Recruiting status"><select className={inputCls} value={form.recruit_status} onChange={(e) => setForm({ ...form, recruit_status: e.target.value })}>{RECRUIT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Compensation terms" className="sm:col-span-3"><textarea className={`${inputCls} h-20 py-2`} value={form.compensation_terms} onChange={(e) => setForm({ ...form, compensation_terms: e.target.value })} />{settlementTermsWarning(form.compensation_terms) && <span className="mt-1 block text-xs text-amber-800">{settlementTermsWarning(form.compensation_terms)}</span>}</Field>
            <div className="sm:col-span-3"><button disabled={busy || !form.name.trim()} onClick={add} className={primaryBtnCls}>{busy && <Loader2 size={14} className="animate-spin" />} Save partner</button></div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </Card>

      {!items ? <Card className="p-8 flex justify-center"><Loader2 className="animate-spin" /></Card> : items.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No partners yet. Add the licensed brokerage or vendor you plan to work with.</Card>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No partners match this filter.</Card>
      ) : shown.map((p) => {
        const sc = scores.get(p.id)!;
        const age = licenseCheckAgeDays(p.license_verified_at);
        const lookup = p.license_lookup_url ? { url: p.license_lookup_url, label: 'Official license lookup' } : licenseLookupFor(p.license_state);
        const passes = p.accepts_referrals === 'yes' && p.will_report === 'yes' && p.license_status === 'verified';
        return (
        <Card key={p.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{p.name} {sc.flag === 'stopped' && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">Not reporting</span>}{sc.flag === 'watch' && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Watch</span>}{passes && <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">Meets pass criteria</span>}</p>
              {(p.brokerage || p.partner_role || p.niche) && <p className="text-xs text-muted-foreground">{[ROLES.find(([v]) => v === p.partner_role)?.[1], p.brokerage, p.niche].filter(Boolean).join(' · ')}</p>}
              <p className="text-xs text-muted-foreground">Accepts referrals: {p.accepts_referrals ?? 'unknown'} · Will report outcomes: {p.will_report ?? 'unknown'}{p.referral_fee_range ? ` · Fee: ${p.referral_fee_range}` : ''}{p.update_method ? ` · Updates by: ${p.update_method}` : ''}</p>
              <p className="text-xs text-muted-foreground">{[p.contact_name, p.contact_email, p.contact_phone].filter(Boolean).join(' · ') || 'No contact yet'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.services.map((s) => SERVICE_LINE_LABEL[s as keyof typeof SERVICE_LINE_LABEL] ?? s).join(', ')}{p.states.length ? ` · ${p.states.join(', ')}` : ''}</p>
              {p.license_type && <p className="text-xs text-muted-foreground">{p.license_type} {p.license_number} {p.license_state}</p>}
              <p className="text-xs text-muted-foreground">
                License: {p.license_status}{p.license_verified_at ? `, checked ${new Date(p.license_verified_at).toLocaleDateString()}` : ', not checked yet'}
                {age !== null && age > LICENSE_RECHECK_DAYS && <span className="text-amber-700"> (check is {age} days old, look again)</span>}
                {' · '}<a className="text-primary underline" href={lookup.url} target="_blank" rel="noreferrer">{lookup.label}</a>
              </p>
              <p className="mt-1 text-xs">
                {sc.total === 0 ? 'No referrals sent yet.' : `${sc.total} referral${sc.total === 1 ? '' : 's'} · ${sc.open} open · ${sc.listed} listed · ${sc.underContract} under contract · ${sc.closed} closed · ${sc.dead} dead · Update rate: ${sc.rate === null ? 'too early' : `${Math.round(sc.rate * 100)}% (${sc.reported} of ${sc.due})`}`}
              </p>
              {(p.recruit_status ?? 'to_contact') !== 'partner' && p.recruit_status !== 'pass' && (() => {
                const t = nextTouch(p.outreach_started_at, p.outreach_step ?? 0);
                return (
                  <p className="mt-1 text-xs">
                    <span className={t.overdue ? 'text-amber-800 font-medium' : 'text-muted-foreground'}>Outreach: {p.outreach_step ?? 0} of 3 emails sent · {t.label}{t.dueOn ? ` (${t.overdue ? 'was due' : 'due'} ${new Date(t.dueOn + 'T00:00:00').toLocaleDateString()})` : ''}</span>
                    {t.step !== 'done' && <button className="ml-2 underline text-primary" onClick={() => logOutreach(p)}>Log it as sent</button>}
                  </p>
                );
              })()}
              {sc.reason && <p className={`text-xs ${sc.flag === 'stopped' ? 'text-red-700' : 'text-amber-800'}`}>{sc.reason}</p>}
              {(p.referral_fee_percent != null || p.protection_days != null || p.payment_due_days != null || p.agreement_signed_on || p.responsible_broker || p.exclusive_territory) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Exhibit A: {exhibitSummary(p)}
                </p>
              )}
              {(p.payment_method || p.payee_name) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Pays by {p.payment_method ?? 'not set'} to {p.payee_name ?? 'no payee recorded'}{p.preferred_invoice_email ? ` · invoices to ${p.preferred_invoice_email}` : ''} · W-9 {p.w9_on_file ? 'on file' : 'not on file'}
                </p>
              )}
              {(p.markets?.length || p.property_types?.length || p.price_min != null || p.price_max != null || p.max_open_leads != null) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Takes: {[p.markets?.length ? p.markets.join(', ') : null, p.property_types?.length ? p.property_types.join(', ') : null, (p.price_min != null || p.price_max != null) ? `${p.price_min != null ? '$' + Number(p.price_min).toLocaleString() : 'any'} to ${p.price_max != null ? '$' + Number(p.price_max).toLocaleString() : 'any'}` : null, p.max_open_leads != null ? `up to ${p.max_open_leads} open leads` : null].filter(Boolean).join(' · ')}
                </p>
              )}
              {p.license_check && <LicenseCheckNote check={p.license_check} />}
              {p.compensation_terms && <p className="mt-1 text-xs">{p.compensation_terms}</p>}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <select className={`${inputCls} !w-auto`} aria-label="Recruiting status" value={p.recruit_status ?? 'to_contact'} onChange={(e) => patch(p.id, { recruit_status: e.target.value, ...(e.target.value === 'emailed' ? { last_contacted_at: new Date().toISOString() } : {}) })}>
                {RECRUIT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select className={`${inputCls} !w-auto`} aria-label="Accepts referrals" value={p.accepts_referrals ?? 'unknown'} onChange={(e) => patch(p.id, { accepts_referrals: e.target.value })}>
                {YES_NO.map(([v, l]) => <option key={v} value={v}>Referrals: {l}</option>)}
              </select>
              <select className={`${inputCls} !w-auto`} aria-label="Will report outcomes" value={p.will_report ?? 'unknown'} onChange={(e) => patch(p.id, { will_report: e.target.value })}>
                {YES_NO.map(([v, l]) => <option key={v} value={v}>Reports: {l}</option>)}
              </select>
              <select className={`${inputCls} !w-auto`} aria-label="Relationship" value={p.relationship_status} onChange={(e) => patch(p.id, { relationship_status: e.target.value })}>
                {['prospect', 'active', 'paused', 'ended'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className={btnCls} onClick={() => patch(p.id, p.license_status === 'verified' && !(age !== null && age > LICENSE_RECHECK_DAYS) ? { license_status: 'unverified', license_verified_at: null } : { license_status: 'verified', license_verified_at: new Date().toISOString() })}>
                {p.license_status === 'verified' ? (age !== null && age > LICENSE_RECHECK_DAYS ? 'Re-checked today' : 'License verified ✓') : 'Mark license verified'}
              </button>
              {p.license_number && p.license_state && (isAutomatic(p.license_state)
                ? <button className={btnCls} disabled={checking === p.id} onClick={() => verify(p.id)}>{checking === p.id && <Loader2 size={14} className="animate-spin" />} Check against {p.license_state} records</button>
                : <span className="self-center text-muted-foreground">{p.license_state} has no public data feed: check the official lookup</span>)}
              <button className={btnCls} onClick={() => patch(p.id, { do_not_assign: !p.do_not_assign })}>{p.do_not_assign ? 'Do not assign ✓' : 'Mark do not assign'}</button>
              <button className={btnCls} onClick={() => patch(p.id, { legal_reviewed: !p.legal_reviewed })}>{p.legal_reviewed ? 'Legal review done ✓' : 'Mark legal review done'}</button>
              <button className={btnCls} onClick={() => patch(p.id, { agreement_on_file: !p.agreement_on_file })}>{p.agreement_on_file ? 'Agreement on file ✓' : 'Mark agreement on file'}</button>
            </div>
          </div>
        </Card>
        );
      })}
    </div>
  );
}
