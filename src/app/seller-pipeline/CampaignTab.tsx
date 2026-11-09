'use client';

import React, { useState } from 'react';
import { Card } from '@/app/campaigns/shared';
import { CHOICES, CHOICE_ORDER, MESSAGES, messagesForChoice, type CampaignVars } from '@/lib/seller/outreachCampaign';
import { MessageCard } from './CampaignMessages';
import { Field, inputCls } from './ui';

export default function CampaignTab() {
  const [vars, setVars] = useState<CampaignVars>({ first_name: '', agent_name: '', address: '' });
  const entry = MESSAGES.filter((m) => m.step === 'entry');
  const followUps = MESSAGES.filter((m) => m.step === 'follow_up');

  return (
    <div className="space-y-5" data-ava-anchor="seller-campaign">
      <Card className="p-5">
        <h2 className="text-base font-semibold">Owner outreach campaign</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
          Ask one question first: sale, long-term rental, short-term rental, or still deciding. When the owner answers 1, 2, 3 or 4 to that text, AVYRO records
          the answer on their opportunity and sets the next step for your team, who then send the matching message below.
          Nothing is sent automatically, an answer never routes an owner on its own, and a STOP reply withdraws every permission.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Owner's first name"><input className={inputCls} value={vars.first_name} onChange={(e) => setVars({ ...vars, first_name: e.target.value })} placeholder="there" /></Field>
          <Field label="Your name"><input className={inputCls} value={vars.agent_name} onChange={(e) => setVars({ ...vars, agent_name: e.target.value })} placeholder="your AVYRO team" /></Field>
          <Field label="Property address"><input className={inputCls} value={vars.address} onChange={(e) => setVars({ ...vars, address: e.target.value })} placeholder="your property" /></Field>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">The first text must keep the line &ldquo;Reply with 1, 2, 3 or 4&rdquo;: that is how AVYRO knows a 1 to 4 reply is an answer to it.</p>
      </Card>

      <section aria-labelledby="camp-entry" className="space-y-2">
        <h3 id="camp-entry" className="text-sm font-semibold">1. First message</h3>
        <div className="grid items-start gap-3 lg:grid-cols-2">{entry.map((m) => <MessageCard key={m.id} message={m} vars={vars} />)}</div>
      </section>

      <section aria-labelledby="camp-branch" className="space-y-3">
        <h3 id="camp-branch" className="text-sm font-semibold">2. After they answer</h3>
        {CHOICE_ORDER.map((c) => (
          <Card key={c} className="p-4">
            <p className="text-sm font-semibold">{CHOICES[c].number}. {CHOICES[c].label} <span className="font-normal text-muted-foreground">&rarr; {CHOICES[c].destination}: {CHOICES[c].nextAction}</span></p>
            <div className="mt-2 grid items-start gap-3 lg:grid-cols-2">{messagesForChoice(c).map((m) => <MessageCard key={m.id} message={m} vars={vars} />)}</div>
          </Card>
        ))}
      </section>

      <section aria-labelledby="camp-follow" className="space-y-2">
        <h3 id="camp-follow" className="text-sm font-semibold">3. If they do not reply</h3>
        <div className="grid items-start gap-3 lg:grid-cols-2">{followUps.map((m) => <MessageCard key={m.id} message={m} vars={vars} />)}</div>
        <p className="text-xs text-muted-foreground">After two touches with no reply, hold the owner for nurture and send only soft re-engagement.</p>
      </section>
    </div>
  );
}
