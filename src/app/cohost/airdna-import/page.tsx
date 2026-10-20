'use client';

import { useState } from 'react';
import AppLayout from '@/components/AppLayout';

interface Summary { rows: number; matched: number; alreadyHadContact: number; updated: number; unmatched: Array<{ row: number; name: string }>; withPhone: number; withEmail: number; columns: Record<string, string | null>; applied: boolean; problem?: string; error?: string }

export default function AirdnaImportPage() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Summary | null>(null);

  async function run(apply: boolean) {
    setBusy(true); setOut(null);
    try {
      const res = await fetch('/api/cohost/airdna-contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, apply }) });
      setOut(await res.json());
    } catch { setOut({ error: 'Could not reach the server.' } as Summary); } finally { setBusy(false); }
  }
  const loadFile = async (f: File | undefined) => { if (f) setText(await f.text()); };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Import AirDNA owner contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            After you request contacts in AirDNA (Property Manager, All Listings, Request info), paste the table or upload its CSV. Each row needs the listing&apos;s Airbnb or Vrbo link
            or id, so it can be matched to a co-host listing, plus the owner&apos;s name, phone and email. Run a preview first: nothing is saved until you import.
          </p>
        </div>
        <input type="file" accept=".csv,.tsv,.txt" onChange={e => loadFile(e.target.files?.[0])} className="text-sm" />
        <textarea value={text} onChange={e => setText(e.target.value)} rows={12} placeholder="Paste the contacts table here, including the header row" className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs" />
        <div className="flex gap-2">
          <button disabled={busy || text.length < 10} onClick={() => run(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">Preview</button>
          <button disabled={busy || text.length < 10 || !out || out.applied || !!out.problem || out.matched === 0} onClick={() => run(true)} className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Import matched contacts</button>
        </div>
        {out && (
          <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
            {out.error || out.problem ? <p className="text-danger">{out.error || out.problem}</p> : (
              <>
                <p className="font-semibold">{out.applied ? `Imported ${out.updated} contacts.` : 'Preview (nothing saved yet)'}</p>
                <p>{out.rows} rows read · {out.matched} matched to a listing · {out.withPhone} with a phone · {out.withEmail} with an email{out.alreadyHadContact ? ` · ${out.alreadyHadContact} already imported` : ''}</p>
                <p className="text-xs text-muted-foreground">Columns used: {Object.entries(out.columns).map(([k, v]) => `${k}: ${v ?? 'not found'}`).join(' · ')}</p>
                {out.unmatched.length > 0 && <p className="text-xs text-muted-foreground">Not matched (first {out.unmatched.length}): {out.unmatched.map(u => `row ${u.row} ${u.name}`).join('; ')}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
