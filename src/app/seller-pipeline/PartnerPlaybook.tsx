'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/app/campaigns/shared';
import { ARELLO_URL, LICENSE_LOOKUPS } from '@/lib/seller/partnerReferrals';
import { CALL_SCRIPT, OUTREACH_STEPS, PARTNER_SUMMARY, mailtoHref, render, unfilled, type OutreachVars } from '@/lib/seller/partnerOutreach';
import { Field, btnCls, inputCls } from './ui';

type Prospect = { id: string; name: string; contact_name: string | null; contact_email: string | null; markets?: string[]; license_state: string | null; states: string[] };
const STORE = 'avyro.partner.outreach.me';

/** The recruiting approach: who to look for, the email sequence, the call script and the one-page summary. Nothing here is sent automatically. */
export default function PartnerPlaybook({ prospects = [] }: { prospects?: Prospect[] }) {
  const [who, setWho] = useState('');
  const [me, setMe] = useState({ your_name: '', your_phone: '', your_email: '' });
  const [market, setMarket] = useState('');
  const [stepId, setStepId] = useState(OUTREACH_STEPS[0].id);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { try { const s = window.localStorage.getItem(STORE); if (s) setMe(JSON.parse(s)); } catch { /* ignore */ } }, []);
  const saveMe = (next: typeof me) => { setMe(next); try { window.localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* ignore */ } };

  const prospect = prospects.find((p) => p.id === who);
  const vars: Partial<OutreachVars> = {
    first_name: prospect?.contact_name?.split(' ')[0] ?? '',
    market: market || prospect?.markets?.[0] || '',
    ...me
  };
  const step = OUTREACH_STEPS.find((s) => s.id === stepId) ?? OUTREACH_STEPS[0];
  const msg = render(step, vars);
  const missing = unfilled(msg.subject + msg.body);

  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1800); } catch { /* ignore */ }
  }

  return (
    <Card className="p-5">
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Recruiting playbook: who to look for, the email sequence and the call</summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2 text-sm">
          <div className="space-y-4">
            <div>
              <p className="font-medium">Who</p>
              <p className="text-xs text-muted-foreground mt-1">Active licensed brokers or team leads who already accept referrals and will report outcomes, especially investment, second-home and short-term-rental specialists in your top markets. Start with 5 to 10 per market. Skip brand-new agents and anyone who refuses status updates or wants payment outside the brokerage.</p>
            </div>
            <div>
              <p className="font-medium">Check the license first, on the official site</p>
              <ul className="mt-1 text-xs space-y-1">
                {Object.entries(LICENSE_LOOKUPS).map(([st, l]) => <li key={st}><a className="text-primary underline" href={l.url} target="_blank" rel="noreferrer">{st}: {l.label}</a></li>)}
                <li><a className="text-primary underline" href={ARELLO_URL} target="_blank" rel="noreferrer">Any state: ARELLO (cross-check only)</a></li>
              </ul>
            </div>
            <div>
              <p className="font-medium">The 10-minute call</p>
              <p className="mt-1 text-xs text-muted-foreground">&ldquo;{CALL_SCRIPT.opening}&rdquo;</p>
              <p className="mt-2 text-xs font-medium">Cover</p>
              <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">{CALL_SCRIPT.points.map((p) => <li key={p}>{p}</li>)}</ul>
              <p className="mt-2 text-xs font-medium">Ask</p>
              <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">{CALL_SCRIPT.questions.map((q) => <li key={q}>{q}</li>)}</ul>
              <p className="mt-2 text-xs text-muted-foreground">Close: &ldquo;{CALL_SCRIPT.close}&rdquo;</p>
              <p className="mt-2 text-xs text-muted-foreground">Pass only if they accept referrals, agree to the status updates and hold an active license in the lead&rsquo;s state. Sign the agreement before the first lead, and have your attorney review the arrangement in each state.</p>
            </div>
            <div>
              <div className="flex items-center justify-between"><p className="font-medium">One-page partner summary</p><button className={`${btnCls} !h-8`} onClick={() => copy('summary', PARTNER_SUMMARY)}>{copied === 'summary' ? 'Copied' : 'Copy'}</button></div>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-xs leading-relaxed font-sans">{PARTNER_SUMMARY}</pre>
            </div>
          </div>

          <div>
            <p className="font-medium">Emails</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label="For prospect (fills the name and market)">
                <select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="">Choose a prospect</option>
                  {prospects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Market"><input className={inputCls} placeholder="Tucson" value={market} onChange={(e) => setMarket(e.target.value)} /></Field>
              <Field label="Your name"><input className={inputCls} value={me.your_name} onChange={(e) => saveMe({ ...me, your_name: e.target.value })} /></Field>
              <Field label="Your phone"><input className={inputCls} value={me.your_phone} onChange={(e) => saveMe({ ...me, your_phone: e.target.value })} /></Field>
              <Field label="Your email" className="sm:col-span-2"><input type="email" className={inputCls} value={me.your_email} onChange={(e) => saveMe({ ...me, your_email: e.target.value })} /></Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Email in the sequence">
              {OUTREACH_STEPS.map((s) => (
                <button key={s.id} role="tab" aria-selected={s.id === stepId} className={`${btnCls} !h-8 !text-xs ${s.id === stepId ? '!bg-muted font-medium' : ''}`} onClick={() => setStepId(s.id)}>{s.label}</button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Subject: {msg.subject}</p>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-xs leading-relaxed font-sans">{msg.body}</pre>
            {missing.length > 0 && <p className="mt-2 text-xs text-amber-800">Still to fill in: {missing.join(', ').replace(/_/g, ' ')}.</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={`${btnCls} !h-8`} onClick={() => copy('email', `Subject: ${msg.subject}\n\n${msg.body}`)}>{copied === 'email' ? 'Copied' : 'Copy email'}</button>
              <a className={`${btnCls} !h-8 ${missing.length ? 'pointer-events-none opacity-50' : ''}`} href={mailtoHref(prospect?.contact_email, msg.subject, msg.body)}>Open in your email app</a>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Keep it short, lead with &ldquo;paid only on close&rdquo;, and require the signed agreement before any lead is sent. Send the day-3 and day-7 emails only if there has been no reply; the Partners list below shows when each is due.</p>
          </div>
        </div>
      </details>
    </Card>
  );
}
