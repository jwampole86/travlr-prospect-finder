'use client';

import React from 'react';
import { Card } from '@/app/campaigns/shared';
import { ARELLO_URL, LICENSE_LOOKUPS } from '@/lib/seller/partnerReferrals';

/** The recruiting approach: who to look for, what to ask and what to send. Guidance for people; nothing here is sent automatically. */
export const BROKER_EMAIL = {
  subject: 'Referral partner who reports outcomes: {{state}}',
  body: `Hi {{name}},

I'm with NAVEO Homes. We send permissioned, property-specific seller leads (often second homes and investment properties) in {{state}}.

I'm looking for licensed brokers and team leads who already accept referrals and can share light status updates (contacted, listed, under contract, closed or dead) so we can improve what we send.

If that matches how you work, are you open to a 10-minute call?

{{your_name}}
NAVEO Homes`
};

export const QUALIFYING_QUESTIONS = [
  'Do you currently accept company or agent referrals?',
  'Roughly what referral fee do you typically work with?',
  'If we send a permissioned seller lead, can you update us on status: contacted, listed, under contract, closed or dead?',
  'What is the easiest way to send updates: a short email, a shared sheet or a CRM note?',
  'Are there markets or property types you do not want?'
];

export default function PartnerPlaybook() {
  return (
    <Card className="p-5">
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Recruiting playbook: who to look for and what to say</summary>
        <div className="mt-3 grid gap-5 lg:grid-cols-2 text-sm">
          <div className="space-y-3">
            <div>
              <p className="font-medium">Who</p>
              <p className="text-xs text-muted-foreground mt-1">Brokers and team leads who already accept referrals, especially investment, second-home and short-term-rental specialists. Skip brand-new agents and agents who say they never pay for leads.</p>
            </div>
            <div>
              <p className="font-medium">Pass criteria</p>
              <p className="text-xs text-muted-foreground mt-1">Accepts referrals, agrees to the five status updates, and holds an active license in the state of the leads (checked on the state&rsquo;s own site).</p>
            </div>
            <div>
              <p className="font-medium">First call, in order</p>
              <ol className="mt-1 list-decimal pl-5 text-xs text-muted-foreground space-y-1">{QUALIFYING_QUESTIONS.map((q) => <li key={q}>{q}</li>)}</ol>
            </div>
            <div>
              <p className="font-medium">Check the license on the official site</p>
              <ul className="mt-1 text-xs space-y-1">
                {Object.entries(LICENSE_LOOKUPS).map(([st, l]) => <li key={st}><a className="text-primary underline" href={l.url} target="_blank" rel="noreferrer">{st}: {l.label}</a></li>)}
                <li><a className="text-primary underline" href={ARELLO_URL} target="_blank" rel="noreferrer">Any state: ARELLO (cross-check only)</a></li>
              </ul>
            </div>
            <div>
              <p className="font-medium">The relationship, in one sentence</p>
              <p className="text-xs text-muted-foreground mt-1">We source and qualify owner leads; the broker handles all licensed brokerage activity; we earn a referral fee; they send back simple status updates so we send better leads next time. Have your attorney review the arrangement in each state before a lead is sent.</p>
            </div>
          </div>
          <div>
            <p className="font-medium">First email</p>
            <p className="mt-1 text-xs text-muted-foreground">Subject: {BROKER_EMAIL.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-xs leading-relaxed font-sans">{BROKER_EMAIL.body}</pre>
            <button className="mt-2 h-8 px-3 rounded-lg border border-border text-xs hover:bg-muted" onClick={() => navigator.clipboard?.writeText(`Subject: ${BROKER_EMAIL.subject}\n\n${BROKER_EMAIL.body}`)}>Copy email</button>
          </div>
        </div>
      </details>
    </Card>
  );
}
