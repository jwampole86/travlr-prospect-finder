'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Clock, Loader2, MapPin, LogIn, LogOut, AlertTriangle } from 'lucide-react';

interface Job {
  id: string; cleaning_type: string; scheduled_date: string; time_window: string | null; special_instructions: string | null; status: string; same_day: boolean;
  checklist: Array<{ label: string; done: boolean }>; issues: string | null; cleaner_notes: string | null; checked_in_at: string | null; checked_out_at: string | null;
  beforePhotos: string[]; afterPhotos: string[]; editable: boolean;
}

// Private page for the cleaner assigned to one job: check in, tick the checklist, add photos, check out. No account needed.
export default function CleanerJobPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [job, setJob] = useState<Job | null>(null);
  const [property, setProperty] = useState<{ address: string; city: string | null; state: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [issues, setIssues] = useState('');
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/cleaner/job?token=${token}`);
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'This job link is not valid.'); return; }
    setJob(data.job); setProperty(data.property);
    setNotes((n) => n || data.job.cleaner_notes || ''); setIssues((i) => i || data.job.issues || '');
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setError(null); setNotice(null);
    const res = await fetch('/api/cleaner/job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action, ...extra }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? 'Something went wrong'); else if (action === 'check_out') setNotice('Thank you. The job is complete and waiting for review.');
    await load(); setBusy(null);
  }

  async function upload(kind: 'before' | 'after', files: FileList | null) {
    if (!files?.length) return;
    setBusy(`photo-${kind}`); setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData(); form.set('token', token); form.set('kind', kind); form.set('file', file);
      const res = await fetch('/api/cleaner/job/photo', { method: 'POST', body: form });
      if (!res.ok) { setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Upload failed'); break; }
    }
    await load(); setBusy(null);
  }

  if (error && !job) return <div className="min-h-screen flex items-center justify-center px-6 text-center"><div><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" /><p className="mt-3 font-semibold text-foreground">{error}</p><p className="mt-1 text-sm text-muted-foreground">Ask your coordinator for a new link.</p></div></div>;
  if (!job) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const done = job.checklist.filter((c) => c.done).length;
  const open = job.editable;
  const toggle = (i: number) => {
    const items = job.checklist.map((c, idx) => ({ label: c.label, done: idx === i ? !c.done : c.done }));
    setJob({ ...job, checklist: items }); // show the tick at once; the save follows
    act('checklist', { items });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-card border-b border-border px-4 py-4">
        <div className="max-w-xl mx-auto">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">{job.cleaning_type}{job.same_day ? ' · same-day turnover' : ''}</p>
          <h1 className="text-lg font-bold text-foreground mt-0.5">{property?.address ?? 'Cleaning job'}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1"><MapPin className="w-3.5 h-3.5" />{[property?.city, property?.state].filter(Boolean).join(', ')}</p>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5"><Clock className="w-3.5 h-3.5" />{job.scheduled_date}{job.time_window ? `, ${job.time_window}` : ''}</p>
          <span className="mt-2 inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-foreground">{job.status}</span>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-5 space-y-5">
        {job.special_instructions && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground"><p className="font-semibold mb-1">Notes from the coordinator</p>{job.special_instructions}</div>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{notice}</p>}
        {!open && <p className="text-sm text-muted-foreground">This job is {job.status.toLowerCase()}. You cannot change it any more.</p>}

        {open && !job.checked_in_at && (
          <button onClick={() => act('check_in')} disabled={busy === 'check_in'} className="w-full min-h-[52px] rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><LogIn className="w-5 h-5" />Check in at the property</button>
        )}

        {open && job.checked_in_at && (
          <>
            <section className="rounded-xl border border-border bg-card">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between"><h2 className="text-sm font-bold text-foreground">Checklist</h2><span className="text-xs text-muted-foreground">{done} of {job.checklist.length}</span></div>
              <ul className="divide-y divide-border">
                {job.checklist.map((c, i) => (
                  <li key={c.label}>
                    <label className="flex items-center gap-3 px-4 py-3.5 min-h-[52px] cursor-pointer">
                      <input type="checkbox" checked={c.done} onChange={() => toggle(i)} className="w-5 h-5 accent-[hsl(var(--primary))]" />
                      <span className={`text-sm ${c.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            {(['before', 'after'] as const).map((kind) => {
              const photos = kind === 'before' ? job.beforePhotos : job.afterPhotos;
              const ref = kind === 'before' ? beforeRef : afterRef;
              return (
                <section key={kind} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-foreground capitalize">{kind} photos{kind === 'after' ? ' (required)' : ''}</h2><span className="text-xs text-muted-foreground">{photos.length}</span></div>
                  {photos.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{photos.map((u) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={u} src={u} alt="" className="aspect-square w-full object-cover rounded-lg" />)}</div>}
                  <input ref={ref} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => { upload(kind, e.target.files); e.target.value = ''; }} />
                  <button onClick={() => ref.current?.click()} disabled={busy === `photo-${kind}`} className="mt-3 w-full min-h-[48px] rounded-xl border border-border font-medium text-sm flex items-center justify-center gap-2 hover:bg-muted disabled:opacity-60">{busy === `photo-${kind}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}Add {kind} photos</button>
                </section>
              );
            })}

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h2 className="text-sm font-bold text-foreground">Notes and issues</h2>
              <textarea value={issues} onChange={(e) => setIssues(e.target.value)} rows={2} placeholder="Damage, missing items or anything the owner should know" className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg" />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Other notes" className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg" />
              <button onClick={() => act('note', { notes, issues })} disabled={busy === 'note'} className="w-full min-h-[44px] rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-60">Save notes</button>
            </section>

            <button onClick={() => act('check_out')} disabled={busy === 'check_out'} className="w-full min-h-[52px] rounded-xl bg-foreground text-background font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><LogOut className="w-5 h-5" />Finish and check out</button>
          </>
        )}
      </main>
    </div>
  );
}
