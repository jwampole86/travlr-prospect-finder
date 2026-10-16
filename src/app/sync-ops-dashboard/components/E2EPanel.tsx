import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import type { E2ERow } from '../lib/types';

const STATUS = {
  pass: { label: 'Pass', cls: 'bg-success/10 text-success', icon: CheckCircle2 },
  warn: { label: 'Warn', cls: 'bg-warning/10 text-warning', icon: AlertTriangle },
  fail: { label: 'Fail', cls: 'bg-danger/10 text-danger', icon: XCircle },
} as const;

function Meter({ pct }: { pct: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${pct >= 60 ? 'bg-success' : pct > 0 ? 'bg-warning' : 'bg-danger/60'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right font-mono text-xs tabular-nums text-foreground">{pct}%</span>
    </div>
  );
}

export default function E2EPanel({ rows, running }: { rows: E2ERow[]; running: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center">
        <ShieldCheck size={28} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{running ? 'Validating portfolios…' : 'No validation run yet'}</p>
        <p className="mt-1 text-xs text-muted-foreground">Checks that every portfolio has leads that are scored, enriched, outreach-ready and still arriving.</p>
      </div>
    );
  }

  const tally = { pass: 0, warn: 0, fail: 0 };
  rows.forEach((r) => { tally[r.status]++; });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(tally) as (keyof typeof tally)[]).map((k) => {
          const s = STATUS[k];
          return (
            <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${s.cls}`}>
              <s.icon size={12} /> {tally[k]} {s.label.toLowerCase()}
            </span>
          );
        })}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Portfolio</th>
              <th className="px-3 py-2.5 text-right font-medium">Leads</th>
              <th className="px-3 py-2.5 text-right font-medium">Scored</th>
              <th className="px-3 py-2.5 text-right font-medium">Enriched</th>
              <th className="px-3 py-2.5 text-right font-medium">Outreach-ready</th>
              <th className="px-3 py-2.5 text-center font-medium">Fresh 24h</th>
              <th className="px-3 py-2.5 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const s = STATUS[r.status];
              return (
                <tr key={r.stateCode} className="transition-colors hover:bg-muted/10">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.portfolio}</div>
                    {r.issues.map((issue) => (
                      <div key={issue} className="mt-0.5 flex items-center gap-1 text-[10px] text-danger">
                        <AlertTriangle size={9} /> {issue}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-foreground">{r.leads.toLocaleString()}</td>
                  <td className="px-3 py-3"><Meter pct={r.scoredPct} /></td>
                  <td className="px-3 py-3"><Meter pct={r.enrichedPct} /></td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-foreground">{r.outreachReady.toLocaleString()}</td>
                  <td className="px-3 py-3 text-center">
                    {r.fresh ? <CheckCircle2 size={14} className="mx-auto text-success" /> : <XCircle size={14} className="mx-auto text-muted-foreground" />}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>
                      <s.icon size={9} /> {s.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
