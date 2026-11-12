'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Handshake, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { REFERRAL_STATUS_LABEL, canMoveTo, type ReferralStatus } from '@/lib/seller/partnerReferrals';
import { withinProtection } from '@/lib/seller/partnerFees';
import PartnerComms from '@/components/seller/PartnerComms';
import type { PartnerCandidate } from '@/lib/seller/partnerDiscovery';

type Referral = { id: string; partner_id: string; status: ReferralStatus; sent_at: string; status_at: string; fee_percent: number | null; protection_ends_at: string | null; payee_name_snapshot: string | null; payment_method_snapshot: string | null; fee_status: string };
type Listing = { forSale: boolean; brokerage: string | null; agent: string | null; phone: string | null; mls: string | null; mlsSource: string | null; ownerListed: boolean };
type InState = { id: string; name: string; brokerage: string | null; phone: string | null; email: string | null; licenseVerified: boolean; acceptsReferrals: string; agreementOnFile: boolean };
type Match = { partnersInState?: InState[]; listing?: Listing | null; alreadyListed?: { label: string; reason: string | null; explanation: string }; state: string | null; stateBlockers: string[]; suggestions: Array<{ id: string; name: string; score: number; reasons: string[] }>; rejected: Array<{ id: string; name: string; why: string[] }>; needsPartner: boolean };
type Partner = { id: string; name: string };

async function call<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, { method: init?.method ?? 'GET', cache: 'no-store', ...(init?.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || `Request failed (${res.status})`) as Error & { blockers?: string[] }; e.blockers = j.blockers; throw e; }
  return j as T;
}

// Two people can share one source page (a directory listing), so the name is part of the key.
const candidateKey = (c: PartnerCandidate) => `${c.name}|${c.sourceUrl}`;

const FLOW: ReferralStatus[] = ['received', 'contacted', 'listed', 'under_contract', 'closed'];

/**
 * Admin only. On a lead: who it is with (if anyone), the status the partner last reported, and the best signed partners to send it to.
 * Sending is the same guarded step as on the Referrals tab: owner permission, a cleared state, a verified partner and the agreed terms.
 */
export default function PartnerMatchPanel({ leadId, city }: { leadId: string; city?: string | null }) {
  const [referral, setReferral] = useState<Referral | null | undefined>(undefined);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [found, setFound] = useState<PartnerCandidate[] | null>(null);
  const [foundFocus, setFoundFocus] = useState<'listing' | 'buyer'>('listing');
  const [added, setAdded] = useState<Set<string>>(new Set());

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
  // Searches the public web for brokerages in the lead's state; only reads, and nothing about the lead or owner is sent.
  const findBrokers = (state: string, focus: 'listing' | 'buyer' = 'listing') => run('find', async () => {
    const r = await call<{ candidates: PartnerCandidate[] }>('/api/seller/partners/discover', { method: 'POST', body: { state, city: city || undefined, focus } });
    setFound(r.candidates); setFoundFocus(focus);
  });
  // Saves a result on the Partners tab as someone to recruit. It is not a partner until the agreement, license and state clearance are done.
  const addProspect = (c: PartnerCandidate, state: string) => run(`add-${candidateKey(c)}`, async () => {
    await call('/api/seller/partners', { method: 'POST', body: {
      name: c.name, brokerage: c.brokerage, contact_name: c.name, contact_email: c.email, contact_phone: c.phone, states: [state], services: ['sale_partner'],
      recruit_status: 'to_contact', partner_role: 'agent', niche: foundFocus === 'buyer' ? "Buyer's agent" : undefined, accepts_referrals: c.acceptsReferrals === 'yes' ? 'yes' : c.acceptsReferrals === 'no' ? 'no' : undefined,
      notes: `${foundFocus === 'buyer' ? "Buyer's agent for already-listed properties. " : ''}Found online and ranked ${c.matchScore}% by AVA: ${c.sourceUrl}${c.why ? ` — ${c.why}` : ''}${c.referralUrl ? `. Referrals: ${c.referralUrl}` : ''}. Contact details are from those pages; confirm them and the license before outreach.`,
    } });
    setAdded((prev) => new Set(prev).add(candidateKey(c)));
  });
  const record = (status: ReferralStatus) => run(status, () => call('/api/seller/referrals', { method: 'PATCH', body: { id: referral!.id, status } }));

  // The ranked results, shown under whichever search was run (a listing partner or, for a listed property, a buyer's agent).
  const renderFound = (state: string) => found && (
    found.length === 0 ? <p className="mt-2 text-muted-foreground">No brokers with a checkable web page came back. Try again, or recruit from the Partners tab.</p> : (
                  <div className="mt-3">
                    <p className="text-muted-foreground">Ranked by AVA, best match first, from public web pages. Confirm the contact details and the license before reaching out.</p>
                    <ul className="mt-2 space-y-3">
                      {found.map((c, i) => (
                        <li key={candidateKey(c)} className="rounded-lg border border-border p-3">
                          <div className="flex items-start gap-2">
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.matchScore >= 70 ? 'bg-emerald-100 text-emerald-800' : c.matchScore >= 45 ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}`} title={c.signals.join('\n')}>
                              #{i + 1} · {c.matchScore}% match
                            </span>
                            <p className="min-w-0 break-words text-sm font-medium">{c.name}{c.brokerage && c.brokerage !== c.name ? <span className="font-normal text-muted-foreground"> · {c.brokerage}</span> : null}</p>
                          </div>
                          {c.city && <p className="mt-1 text-muted-foreground">{c.city}, {state}</p>}
                          {c.why && <p className="mt-1 break-words">{c.why}</p>}
                          <p className="mt-2 flex flex-wrap gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 ${c.acceptsReferrals === 'yes' ? 'bg-emerald-100 text-emerald-800' : c.acceptsReferrals === 'no' ? 'bg-red-100 text-red-800' : 'bg-muted text-muted-foreground'}`}>
                              Referrals: {c.acceptsReferrals === 'yes' ? 'accepts' : c.acceptsReferrals === 'no' ? 'says no' : 'not stated'}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 ${c.handlesInvestment === 'yes' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>Investment / second homes: {c.handlesInvestment === 'yes' ? 'yes' : 'not stated'}</span>
                            <span className={`rounded-full px-2 py-0.5 ${c.licensedInState === 'yes' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>Licensed in {state}: {c.licensedInState === 'yes' ? 'per its page' : 'check'}</span>
                          </p>
                          {c.referralEvidence && <p className="mt-1 break-words text-muted-foreground">Referrals: {c.referralEvidence}{c.referralUrl ? <> <a className="inline-flex items-center gap-0.5 underline" href={c.referralUrl} target="_blank" rel="noopener noreferrer">page <ExternalLink size={10} /></a></> : null}</p>}
                          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                            {c.phone && <a className="text-primary underline" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a>}
                            {c.email && <a className="break-all text-primary underline" href={`mailto:${c.email}`}>{c.email}</a>}
                            {c.website && <a className="inline-flex items-center gap-0.5 text-primary underline" href={c.website} target="_blank" rel="noopener noreferrer">Website <ExternalLink size={10} /></a>}
                            <a className="inline-flex items-center gap-0.5 text-muted-foreground underline" href={c.sourceUrl} target="_blank" rel="noopener noreferrer">Source <ExternalLink size={10} /></a>
                          </p>
                          {!c.phone && !c.email && <p className="mt-1 text-muted-foreground">No phone or email on that page; use the website.</p>}
                          <div className="mt-3 border-t border-border pt-3">
                            {added.has(candidateKey(c))
                              ? <span className="text-xs text-emerald-700">Added to Partners</span>
                              : <button disabled={busy !== null} onClick={() => addProspect(c, state!)} className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{busy === `add-${candidateKey(c)}` ? 'Adding…' : 'Add to recruiting'}</button>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
  );

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
          <PartnerComms referralId={referral.id} status={referral.status} />
          {referral.status === 'closed' && <p className="mt-2 text-xs text-muted-foreground">Fee: {referral.fee_status.replace('_', ' ')}. Record the commission and payment on the Referrals tab.</p>}
          {reopenable && <p className="mt-2 text-xs text-amber-800">Dead, but still inside the protection period. Record it on the Referrals tab if the owner lists or closes with this partner.</p>}
        </div>
      )}

      {/* Who the property is listed with comes first: a listed property is not sent to a listing partner, so the broker's name decides the path. */}
      {match?.listing && (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs" aria-label="Current listing broker">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Current listing broker</p>
          {match.listing.brokerage || match.listing.agent ? (
            <>
              <p className="mt-1 text-sm font-semibold">{match.listing.brokerage ?? match.listing.agent}</p>
              <p className="mt-0.5 text-muted-foreground">
                {match.listing.brokerage && match.listing.agent ? `Agent ${match.listing.agent}` : null}
                {match.listing.phone ? <>{match.listing.brokerage && match.listing.agent ? ' · ' : ''}<a className="text-primary underline" href={`tel:${match.listing.phone.replace(/[^\d+]/g, '')}`}>{match.listing.phone}</a></> : null}
                {match.listing.mls ? ` · MLS ${match.listing.mls}${match.listing.mlsSource ? ` (${match.listing.mlsSource})` : ''}` : null}
              </p>
            </>
          ) : match.listing.ownerListed ? (
            <p className="mt-1 text-sm font-semibold">Listed by the owner, no broker</p>
          ) : (
            <p className="mt-1 text-muted-foreground">No listing broker on file for this property.</p>
          )}
        </div>
      )}

      {(!referral || referral.status === 'dead') && match?.alreadyListed && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="text-sm font-semibold">{match.alreadyListed.label}</p>
          {match.alreadyListed.reason && <p className="mt-0.5">{match.alreadyListed.reason}</p>}
          <p className="mt-1">{match.alreadyListed.explanation}</p>
          <p className="mt-2 font-medium">Alternative: match them with a buyer</p>
          <p className="mt-0.5">When you have an interested buyer, introduce them to a licensed buyer&rsquo;s agent in {match.state ?? 'this state'}. Find candidates below, then add the best fit to your recruiting list.</p>
          {(match.partnersInState?.length ?? 0) > 0 && (
            <div className="mt-2 rounded-md border border-amber-200 bg-white p-2 text-amber-950">
              <p className="font-medium">Your partners licensed in {match.state}</p>
              <ul className="mt-1 space-y-1">
                {match.partnersInState!.map((p) => (
                  <li key={p.id} className="break-words">
                    <span className="font-medium">{p.name}</span>{p.brokerage && p.brokerage !== p.name ? ` · ${p.brokerage}` : ''}
                    <span className="text-amber-800"> · license {p.licenseVerified ? 'verified' : 'not verified'} · referrals {p.acceptsReferrals} · agreement {p.agreementOnFile ? 'on file' : 'not on file'}</span>
                    {p.phone && <> · <a className="underline" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a></>}
                    {p.email && <> · <a className="break-all underline" href={`mailto:${p.email}`}>{p.email}</a></>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {match.state && (
            <button disabled={busy !== null} onClick={() => findBrokers(match.state!, 'buyer')} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50">
              {busy === 'find' ? <Loader2 className="animate-spin" size={13} /> : <Search size={13} />} {found && foundFocus === 'buyer' ? 'Search again' : `Find buyer's agents in ${city ? `${city}, ` : ''}${match.state}`}
            </button>
          )}
          {foundFocus === 'buyer' && match.state && renderFound(match.state)}
        </div>
      )}

      {(!referral || referral.status === 'dead') && match && !match.alreadyListed && (
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
          ) : (
            <div>
              <p className="text-amber-800">Needs a partner: no signed partner can take this lead yet. <Link className="underline" href="/seller-pipeline">Recruit one{match.state ? ` for ${match.state}` : ''}</Link>.</p>
              {match.state && (
                <button disabled={busy !== null} onClick={() => findBrokers(match.state!)} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
                  {busy === 'find' ? <Loader2 className="animate-spin" size={13} /> : <Search size={13} />} {found ? 'Search again' : `Find brokers in ${city ? `${city}, ` : ''}${match.state}`}
                </button>
              )}
              {foundFocus === 'listing' && renderFound(match.state ?? '')}
            </div>
          )}
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
