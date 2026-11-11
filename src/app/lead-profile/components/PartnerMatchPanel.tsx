'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Handshake, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { REFERRAL_STATUS_LABEL, canMoveTo, type ReferralStatus } from '@/lib/seller/partnerReferrals';
import { withinProtection } from '@/lib/seller/partnerFees';

type Referral = { id: string; partner_id: string; status: ReferralStatus; sent_at: string; status_at: string; fee_percent: number | null; protection_ends_at: string | null; payee_name_snapshot: string | null; payment_method_snapshot: string | null; fee_status: string };
type Match = { state: string | null; stateBlockers: string[]; suggestions: Array<{ id: string; name: string; score: number; reasons: string[] }>; rejected: Array<{ id: string; name: string; why: string[] }>; needsPartner: boolean };
type Partner = { id: string; name: string };

async function call<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, { method: init?.method ?? 'GET', cache: 'no-store', ...(init?.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || `Request failed (${res.status})`) as Error & { blockers?: string[] }; e.blockers = j.blockers; throw e; }
  return j as T;
}

const FLOW: ReferralStatus[] = ['received', 'contacted', 'listed', 'under_contract', 'closed'];

/**
 * Admin only. On a lead: who it is with (if anyone), the status the partner last reported, and the best signed partners to send it to.
 * Sending is the same guarded step as on the Referrals tab: owner permission, a cleared state, a verified partner and the agreed terms.
 */
export default function PartnerMatchPanel({ leadId }: { leadId: string }) {
  const [referral, setReferral] = useState<Referral | null | undefined>(undefined);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        call<{ items: Referral[] }>(`/api/seller/referrals?lead_id=${encodeURIComponent(leadId)}`),
        call<{ items: Partner[] }>('/api/seller/partners')
      ]);
      const current = r.items.find((x) => x.status !== 'closed' && x.status !== 'dead') ?? r.items[0] ?? null;
      setReferral(current); setPartners(p.items);
      if (!current || current.status === 'dead') setMatch(await call<Match>(`/api/seller/referrals/match?lead_id=${encodeURIComponent(leadId)}`));
      else setMatch(null);
      setError(null);
    } catch (e) { setError((e as Error).message); setReferral(null); }
  }, [leadId]);
  useEffect(() => { void load(); }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null); setBlockers([]);
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); setBlockers((e as Error & { blockers?: string[] }).blockers ?? []); } finally { setBusy(null); }
  }
  const send = (partnerId: string) => run(partnerId, () => call('/api/seller/referrals', { method: 'POST', body: { partner_id: partnerId, lead_id: leadId } }));
  const record = (status: ReferralStatus) => run(status, () => call('/api/seller/referrals', { method: 'PATCH', body: { id: referral!.id, status } }));

  if (referral === undefined) return <div className="bg-card border border-border rounded-2xl p-5"><Loader2 className="animate-spin" size={16} /></div>;
  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? 'Partner';
  const reopenable = referral?.status === 'dead' && withinProtection(referral.protection_ends_at);

  return (
    <section className="bg-card border border-border rounded-2xl p-5" aria-label="Partner broker">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Handshake size={15} /> Partner broker</h3>
        <Link href="/seller-pipeline" className="text-xs text-primary underline">Seller &amp; owner services</Link>
      </div>

      {referral && (
        <div className="mt-3 text-sm">
          <p><span className="font-medium">{partnerName(referral.partner_id)}</span> <span className="ml-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">{REFERRAL_STATUS_LABEL[referral.status]}</span></p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sent {new Date(referral.sent_at).toLocaleDateString()}{referral.fee_percent != null ? ` · fee ${referral.fee_percent}%` : ''}{referral.payee_name_snapshot ? ` · payee ${referral.payee_name_snapshot}` : ''}{referral.payment_method_snapshot ? ` by ${referral.payment_method_snapshot}` : ''}
            {referral.protection_ends_at ? ` · ${withinProtection(referral.protection_ends_at) ? 'protected until' : 'protection ended'} ${new Date(referral.protection_ends_at).toLocaleDateString()}` : ''}
          </p>
          {referral.status !== 'closed' && referral.status !== 'dead' && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FLOW.filter((s) => canMoveTo(referral.status, s)).map((s) => (
                <button key={s} disabled={busy !== null} onClick={() => record(s)} className="h-8 rounded-lg border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-50">{busy === s ? '…' : REFERRAL_STATUS_LABEL[s]}</button>
              ))}
              <button disabled={busy !== null} onClick={() => record('dead')} className="h-8 rounded-lg border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-50">Dead</button>
            </div>
          )}
          {referral.status === 'closed' && <p className="mt-2 text-xs text-muted-foreground">Fee: {referral.fee_status.replace('_', ' ')}. Record the commission and payment on the Referrals tab.</p>}
          {reopenable && <p className="mt-2 text-xs text-amber-800">Dead, but still inside the protection period. Record it on the Referrals tab if the owner lists or closes with this partner.</p>}
        </div>
      )}

      {(!referral || referral.status === 'dead') && match && (
        <div className="mt-3 text-xs">
          {match.stateBlockers.length > 0 && <p className="text-amber-800">{match.state ?? 'This state'}: {match.stateBlockers.join(' ')}</p>}
          {match.suggestions.length > 0 ? (
            <>
              <p className="font-medium text-sm">Suggested partners</p>
              <ul className="mt-2 space-y-2">
                {match.suggestions.slice(0, 3).map((s, i) => (
                  <li key={s.id} className="flex items-start justify-between gap-3">
                    <span>{i + 1}. <span className="font-medium">{s.name}</span> <span className="text-muted-foreground">({s.score}) {s.reasons.filter(Boolean).join(', ')}</span></span>
                    <button disabled={busy !== null} onClick={() => send(s.id)} className="h-8 shrink-0 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{busy === s.id ? 'Sending…' : 'Send lead'}</button>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-amber-800">Needs a partner: no signed partner can take this lead yet. <Link className="underline" href="/seller-pipeline">Recruit one{match.state ? ` for ${match.state}` : ''}</Link>.</p>}
          {match.rejected.length > 0 && (
            <details className="mt-2"><summary className="cursor-pointer text-muted-foreground">Why {match.rejected.length} other partner{match.rejected.length === 1 ? ' is' : 's are'} not suggested</summary>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">{match.rejected.map((r) => <li key={r.id}>{r.name}: {r.why.join('; ')}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {blockers.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-red-700">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
    </section>
  );
}
