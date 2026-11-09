'use client';

import React, { useState } from 'react';
import { Check, Copy, Mail, MessageSquare } from 'lucide-react';
import { cx } from '@/app/campaigns/shared';
import { renderMessage, type CampaignMessage, type CampaignVars } from '@/lib/seller/outreachCampaign';
import { btnCls } from './ui';

/** One campaign message, filled in for an owner, with a Copy button. Copying sends nothing: a person pastes it into their own text or email. */
export function MessageCard({ message, vars }: { message: CampaignMessage; vars: CampaignVars }) {
  const [subject, setSubject] = useState(0);
  const [copied, setCopied] = useState<'subject' | 'body' | null>(null);
  const body = renderMessage(message.body, vars);
  const subjectText = message.subjects ? renderMessage(message.subjects[subject] ?? message.subjects[0], vars) : null;

  async function copy(what: 'subject' | 'body', text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what); window.setTimeout(() => setCopied(null), 1600); } catch { /* the text is selectable on screen */ }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-3" data-testid={`campaign-${message.id}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          {message.channel === 'sms' ? <MessageSquare size={13} className="text-primary" /> : <Mail size={13} className="text-primary" />}
          {message.title}
        </p>
        <button type="button" onClick={() => copy('body', body)} className={cx(btnCls, '!h-7 !px-2.5 text-xs')} aria-label={`Copy ${message.title}`}>
          {copied === 'body' ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      {subjectText !== null && message.subjects && (
        <div className="mt-2 flex items-center gap-2">
          {message.subjects.length > 1 ? (
            <select value={subject} onChange={(e) => setSubject(Number(e.target.value))} aria-label="Subject line" className="h-7 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs">
              {message.subjects.map((s, i) => <option key={s} value={i}>{renderMessage(s, vars)}</option>)}
            </select>
          ) : <p className="min-w-0 flex-1 truncate text-xs"><span className="text-muted-foreground">Subject: </span>{subjectText}</p>}
          <button type="button" onClick={() => copy('subject', subjectText)} className={cx(btnCls, '!h-7 !px-2.5 text-xs')} aria-label="Copy subject">{copied === 'subject' ? 'Copied' : 'Copy subject'}</button>
        </div>
      )}
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground/90">{body}</pre>
    </div>
  );
}
