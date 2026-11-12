'use client';

import React, { useMemo, useState } from 'react';
import { Check, Copy, Hourglass } from 'lucide-react';
import { GROUP_LABEL, GROUP_NOTE, OBJECTION_REASONS, fillScript, scriptsFor, type ScriptGroup, type ScriptVars } from '@/lib/seller/earnWhileYouWait';

const GROUPS: ScriptGroup[] = ['owner_emails', 'owner_replies', 'broker_scripts', 'broker_objections'];

/**
 * For a home already listed with a broker: copy-and-paste rental-only scripts for the owner and for the listing broker.
 * Nothing is sent from here. Anything the lead does not tell us stays as {{name}} so it is filled in before sending.
 */
export default function EarnWhileYouWaitPanel({ vars }: { vars: ScriptVars }) {
  const [group, setGroup] = useState<ScriptGroup>('owner_emails');
  const [copied, setCopied] = useState<string | null>(null);
  const scripts = useMemo(() => scriptsFor(group), [group]);

  async function copy(id: string, subject: string | undefined, body: string) {
    const text = [subject ? `Subject: ${fillScript(subject, vars)}` : null, fillScript(body, vars)].filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Hourglass size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Earn while you wait (NAVEO Stays)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        This home is already listed with a broker, so the sale stays with them. These scripts offer only the rental side, where the listing agreement and local rules allow it. Drafts: have counsel review them before first use, and make sure the fee wording matches the Stays agreement.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border ${group === g ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:text-foreground'}`}
          >
            {GROUP_LABEL[g]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{GROUP_NOTE[group]}</p>
      <div className="space-y-2">
        {scripts.map((s) => (
          <details key={s.id} className="rounded-lg border border-border bg-background">
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-foreground">
              <span>{s.title}</span>
              {s.stop && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Stop after this</span>}
            </summary>
            <div className="space-y-2 border-t border-border px-3 py-2">
              {s.when && <p className="text-[11px] italic text-muted-foreground">{s.when}</p>}
              {s.subject && <p className="text-xs"><span className="font-semibold">Subject:</span> {fillScript(s.subject, vars)}</p>}
              <pre className="whitespace-pre-wrap font-sans text-xs text-foreground">{fillScript(s.body, vars)}</pre>
              <button type="button" onClick={() => copy(s.id, s.subject, s.body)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                {copied === s.id ? <Check size={12} /> : <Copy size={12} />} {copied === s.id ? 'Copied' : 'Copy'}
              </button>
            </div>
          </details>
        ))}
      </div>
      {group.endsWith('replies') || group === 'broker_objections' ? (
        <p className="text-[11px] text-muted-foreground">Log the reason on the lead ({OBJECTION_REASONS.join(', ')}) so the same offer is not sent again. A hard no, or a request to stop, ends the rental conversation.</p>
      ) : null}
    </div>
  );
}
