'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/app/campaigns/shared';
import { CHOICES, CHOICE_ORDER, READY_CAMPAIGNS, messagesForChoice, messagesForListing, type CampaignVars } from '@/lib/seller/outreachCampaign';
import { MessageCard } from './CampaignMessages';
import { Field, api, inputCls } from './ui';
import { OUTREACH_BRANDS } from '@/lib/brands';

export default function CampaignTab() {
  const [vars, setVars] = useState<CampaignVars>({ first_name: '', agent_name: '', address: '' });
  const [listing, setListing] = useState<'rent' | 'sale'>('rent');
  const [address, setAddress] = useState<string | null | undefined>(undefined);
  useEffect(() => { api<{ address: string | null }>('/api/seller/campaign-footer').then((r) => setAddress(r.address)).catch(() => setAddress(null)); }, []);
  // Every message names the NAVEO that matches the property: Stays for a home for rent, Homes for one for sale.
  const brand = listing === 'sale' ? OUTREACH_BRANDS.homes : OUTREACH_BRANDS.stays;
  const shown: CampaignVars = { ...vars, brand: brand.name, company_address: address ?? undefined };
  const entry = messagesForListing(listing, 'entry');
  const followUps = messagesForListing(listing, 'follow_up');

  return (
    <div className="space-y-5" data-ava-anchor="seller-campaign">
      <Card className="p-5">
        <h2 className="text-base font-semibold">Owner outreach campaign</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
          Ask one question first: sale, long-term rental, short-term rental, or still deciding. When the owner answers 1, 2, 3 or 4 to that text, AVYRO records
          the answer on their opportunity and sets the next step for your team, who then send the matching message below.
          Nothing is sent automatically, an answer never routes an owner on its own, and a STOP reply withdraws every permission.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Field label="The property is">
            <select className={inputCls} value={listing} onChange={(e) => setListing(e.target.value as 'rent' | 'sale')} aria-label="The property is">
              <option value="rent">For rent (from NAVEO Stays)</option>
              <option value="sale">For sale (from NAVEO Homes)</option>
            </select>
          </Field>
          <Field label="Owner's first name"><input className={inputCls} value={vars.first_name} onChange={(e) => setVars({ ...vars, first_name: e.target.value })} placeholder="there" /></Field>
          <Field label="Your name"><input className={inputCls} value={vars.agent_name} onChange={(e) => setVars({ ...vars, agent_name: e.target.value })} placeholder="the NAVEO team" /></Field>
          <Field label="Property address"><input className={inputCls} value={vars.address} onChange={(e) => setVars({ ...vars, address: e.target.value })} placeholder="your property" /></Field>
        </div>
        {listing === 'rent' && <p className="mt-2 text-[11px] text-muted-foreground">The first text must keep the line &ldquo;Reply with 1, 2, 3 or 4&rdquo;: that is how AVYRO knows a 1 to 4 reply is an answer to it.</p>}
        {listing === 'sale' && <p className="mt-2 text-[11px] text-muted-foreground">For a home that is for sale, the first message offers NAVEO Homes support through a sale, then NAVEO Stays as a short-term rental while it is listed. One ask, no promises, and it never mentions property management.</p>}
      </Card>

      <Card className="p-4 border-amber-300 bg-amber-50/60">
        <h3 className="text-sm font-semibold">Before you send</h3>
        <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
          <li>Text only owners who agreed to texts, and email only owners who agreed to email. Never anyone marked Do Not Contact or who replied STOP.</li>
          <li>AVYRO&rsquo;s own text sending skips owners who opted out or are suppressed. These messages are copied and sent from your own tools, so check permission yourself first.</li>
          <li>Every text ends with the opt-out line, and every email ends with a way to unsubscribe. Honor a STOP or an unsubscribe right away.</li>
        </ul>
      </Card>

      <section aria-labelledby="camp-ready" className="space-y-3" data-ava-anchor="seller-campaign-ready">
        <h3 id="camp-ready" className="text-sm font-semibold">Ready-made campaigns</h3>
        {READY_CAMPAIGNS.map((c) => {
          const cb = c.brand === 'homes' ? OUTREACH_BRANDS.homes : OUTREACH_BRANDS.stays;
          const cv: CampaignVars = { ...vars, brand: cb.name, company_address: address ?? undefined };
          return (
            <Card key={c.id} className="p-4">
              <p className="text-sm font-semibold">{c.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Who: {c.audience}</p>
              <p className="text-xs text-muted-foreground">Permission: {c.consent}</p>
              <div className="mt-2 grid items-start gap-3 lg:grid-cols-2">{c.messages.map((m) => <MessageCard key={m.id} message={m} vars={cv} />)}</div>
            </Card>
          );
        })}
        <p className="text-xs text-muted-foreground">Suggested timing: email on day 0, a bump on day 3 or 4, then a final note on day 7. For texts, send the first and one bump on day 2 or 3 and no more. The day 30 email is a single, low-pressure check-in.</p>
      </section>

      <section aria-labelledby="camp-entry" className="space-y-2">
        <h3 id="camp-entry" className="text-sm font-semibold">1. First message</h3>
        <div className="grid items-start gap-3 lg:grid-cols-2">{entry.map((m) => <MessageCard key={m.id} message={m} vars={shown} />)}</div>
      </section>

      <section aria-labelledby="camp-branch" className="space-y-3">
        <h3 id="camp-branch" className="text-sm font-semibold">2. After they answer</h3>
        {CHOICE_ORDER.map((c) => (
          <Card key={c} className="p-4">
            <p className="text-sm font-semibold">{CHOICES[c].number}. {CHOICES[c].label} <span className="font-normal text-muted-foreground">&rarr; {CHOICES[c].destination}: {CHOICES[c].nextAction}</span></p>
            <div className="mt-2 grid items-start gap-3 lg:grid-cols-2">{messagesForChoice(c).map((m) => <MessageCard key={m.id} message={m} vars={shown} />)}</div>
          </Card>
        ))}
      </section>

      <section aria-labelledby="camp-follow" className="space-y-2">
        <h3 id="camp-follow" className="text-sm font-semibold">3. If they do not reply</h3>
        <div className="grid items-start gap-3 lg:grid-cols-2">{followUps.map((m) => <MessageCard key={m.id} message={m} vars={shown} />)}</div>
        <p className="text-xs text-muted-foreground">After two touches with no reply, hold the owner for nurture and send only soft re-engagement.</p>
      </section>
    </div>
  );
}
