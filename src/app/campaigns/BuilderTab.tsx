'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, MessageSquareText, Rocket, Sparkles, Users, X, ChevronRight, ChevronLeft, ShieldCheck } from 'lucide-react';
import { AudienceInfo, BuilderForm, Card, Chip, Notice, SectionTitle, Skeleton, TONES, cx, fmtDate, fromLocalInput, post, toLocalInput } from './shared';

interface Preview { audienceSize: number; count: number; sampled: number; sendableInSample: number; blockers: Record<string, number>; avgSegments: number; costLow: number; costHigh: number; samples: Array<{ state: string | null; message: string; segments: number; generatedBy: string; sendAt: string | null }> }
interface Plan { batch: string; total: number; target: number; ids: string[] }
interface Tally { scheduled: number; landline: number; invalid: number; skipped: Record<string, number>; segments: number }
type Run = { phase: 'idle' } | { phase: 'planning' } | { phase: 'running'; plan: Plan; tally: Tally; next: number } | { phase: 'paused'; plan: Plan; tally: Tally; next: number; error: string } | { phase: 'done'; plan: Plan; tally: Tally; stopped: boolean };

const SKIP_LABEL: Record<string, string> = {
  landline: 'landline', invalid_number: 'invalid number', no_estimate: 'no estimate available', no_address: 'missing address', no_phone: 'no phone', contacted_recently: 'texted recently', phone_already_texted: 'phone already texted',
  no_send_window: 'outside local sending hours', no_longer_eligible: 'no longer eligible', for_sale: 'home is for sale', not_a_rental: 'not a rental listing', agent_listed: 'listed by an agent', no_owner_name: 'owner not named', opted_out: 'opted out', do_not_contact: 'do not contact', twilio_error: 'carrier rejected', quiet_hours: 'quiet hours', target_reached: 'target reached', too_long: 'message too long',
};
const STEPS = ['Audience', 'Message and timing', 'Review and schedule'];

export const defaultForm = (): BuilderForm => {
  const d = new Date(Date.now() + 24 * 3_600_000); d.setHours(10, 0, 0, 0);
  return { name: '', audience: '', states: [], minScore: 0, maxTexts: 50, tone: 'mix', startAt: d.toISOString(), spreadHours: 2 };
};

export default function BuilderTab({ form, setForm, banner, onClearBanner, onViewResults }: {
  form: BuilderForm; setForm: (f: BuilderForm) => void; banner: string | null; onClearBanner: () => void; onViewResults: (batch: string) => void;
}) {
  const [audiences, setAudiences] = useState<AudienceInfo[] | null>(null);
  const [chunk, setChunk] = useState(8);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [run, setRun] = useState<Run>({ phase: 'idle' });
  const [launchError, setLaunchError] = useState<string | null>(null);
  const stop = useRef(false);

  useEffect(() => { if (banner) setStep(0); }, [banner]);
  useEffect(() => {
    if (run.phase !== 'running' && run.phase !== 'planning') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [run.phase]);
  useEffect(() => {
    post<{ audiences: AudienceInfo[]; chunkSize: number }>('/api/campaigns/builder', { action: 'audiences' })
      .then(r => { setAudiences(r.audiences); setChunk(r.chunkSize); }).catch(e => setLoadError((e as Error).message));
  }, []);

  const aud = audiences?.find(a => a.id === form.audience) ?? null;
  const matches = useMemo(() => aud ? aud.points.filter(([s, sc]) => (!form.states.length || form.states.includes(s)) && sc >= form.minScore).length : 0, [aud, form.states, form.minScore]);
  const count = Math.max(0, Math.min(form.maxTexts, matches));
  const startMs = Date.parse(form.startAt);
  const startOk = !Number.isNaN(startMs) && startMs >= Date.now() + 30 * 60_000;
  const nameOk = form.name.trim().length >= 3;
  const params = { name: form.name.trim(), audience: form.audience, states: form.states, minScore: form.minScore, maxTexts: count, tone: form.tone, startAt: form.startAt, spreadHours: form.spreadHours };
  const stepOk = [!!aud && matches > 0 && nameOk && count > 0, startOk, true];

  // Any change to the settings makes an earlier preview and confirmation stale.
  const sig = JSON.stringify(params);
  useEffect(() => { setPreview(null); setPreviewError(null); setConfirmed(false); }, [sig]);

  useEffect(() => {
    if (step !== 2 || preview || previewing || previewError || !stepOk[0] || !stepOk[1]) return;
    setPreviewing(true); setPreviewError(null);
    post<Preview>('/api/campaigns/builder', { action: 'preview', params }).then(setPreview).catch(e => setPreviewError((e as Error).message)).finally(() => setPreviewing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, preview, sig]);

  const set = <K extends keyof BuilderForm>(k: K, v: BuilderForm[K]) => setForm({ ...form, [k]: v });

  async function work(plan: Plan, tally: Tally, from: number) {
    stop.current = false;
    let t = { ...tally, skipped: { ...tally.skipped } }; let i = from;
    setRun({ phase: 'running', plan, tally: t, next: i });
    while (i < plan.ids.length && t.scheduled < plan.target) {
      if (stop.current) { setRun({ phase: 'done', plan, tally: t, stopped: true }); return; }
      try {
        const r = await post<{ scheduled: number; landline: number; invalid: number; segments: number; skipped: Record<string, number> }>('/api/campaigns/builder', { action: 'schedule', params, ids: plan.ids.slice(i, i + chunk), budget: plan.target - t.scheduled });
        t = { scheduled: t.scheduled + r.scheduled, landline: t.landline + r.landline, invalid: t.invalid + r.invalid, segments: t.segments + r.segments, skipped: Object.entries(r.skipped).reduce((a, [k, v]) => ({ ...a, [k]: (a[k] ?? 0) + v }), t.skipped) };
        i += chunk; setRun({ phase: 'running', plan, tally: t, next: i });
      } catch (e) { setRun({ phase: 'paused', plan, tally: t, next: i, error: (e as Error).message }); return; }
    }
    await post('/api/campaigns/builder', { action: 'finish', params, screened: t.scheduled + t.landline + t.invalid, landline: t.landline, invalid: t.invalid }).catch(() => null);
    setRun({ phase: 'done', plan, tally: t, stopped: false });
  }

  async function launch() {
    setLaunchError(null); setRun({ phase: 'planning' });
    try { const plan = await post<Plan>('/api/campaigns/builder', { action: 'plan', params }); await work(plan, { scheduled: 0, landline: 0, invalid: 0, segments: 0, skipped: {} }, 0); }
    catch (e) { setLaunchError((e as Error).message); setRun({ phase: 'idle' }); }
  }

  function reset() { setRun({ phase: 'idle' }); setForm(defaultForm()); setStep(0); setConfirmed(false); setPreview(null); }

  // ── Progress and result ──
  if (run.phase !== 'idle') {
    const plan = 'plan' in run ? run.plan : null; const tally = 'tally' in run ? run.tally : null;
    const done = run.phase === 'done';
    const pctDone = plan && tally ? Math.min(100, Math.round((tally.scheduled / Math.max(1, plan.target)) * 100)) : 0;
    return (
      <Card className="p-6 sm:p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <span className={cx('w-11 h-11 rounded-2xl flex items-center justify-center text-white', done ? 'bg-emerald-500' : 'bg-primary')}>{done ? <CheckCircle2 size={22} /> : <Rocket size={22} />}</span>
          <div>
            <h2 className="text-lg font-semibold">{run.phase === 'planning' ? 'Checking the audience' : done ? (run.stopped ? 'Stopped. Scheduled texts stay scheduled.' : 'Campaign scheduled') : run.phase === 'paused' ? 'Paused' : 'Scheduling your texts'}</h2>
            <p className="text-sm text-muted-foreground">{plan?.batch ?? form.name}</p>
          </div>
        </div>
        {tally && plan && (
          <>
            <div className="h-3 rounded-full bg-muted overflow-hidden"><div className={cx('h-full transition-all duration-500', done ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pctDone}%` }} /></div>
            <div className="flex justify-between text-sm mt-2"><span><b>{tally.scheduled}</b> of {plan.target} scheduled</span><span className="text-muted-foreground">{pctDone}%</span></div>
            {Object.keys(tally.skipped).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">{Object.entries(tally.skipped).filter(([k]) => k !== 'target_reached').map(([k, v]) => <Chip key={k}>{v} skipped: {SKIP_LABEL[k] ?? k}</Chip>)}</div>
            )}
          </>
        )}
        {run.phase === 'paused' && <div className="mt-4"><Notice tone="amber"><span>{run.error} Texts already scheduled are safe. You can resume where it stopped.</span></Notice>
          <div className="flex gap-2 mt-3"><button onClick={() => work(run.plan, run.tally, run.next)} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Resume</button><button onClick={() => setRun({ phase: 'done', plan: run.plan, tally: run.tally, stopped: true })} className="h-9 px-4 rounded-xl border border-border text-sm">Stop here</button></div></div>}
        {run.phase === 'running' && <button onClick={() => { stop.current = true; }} className="mt-5 h-9 px-4 rounded-xl border border-border text-sm hover:bg-muted inline-flex items-center gap-1.5"><X size={14} /> Stop after this batch</button>}
        {done && tally && plan && (
          <div className="mt-5 space-y-4">
            <Notice tone="green"><ShieldCheck size={16} className="mt-0.5 shrink-0" /><span>{tally.scheduled} texts are held by Twilio and will send at their scheduled times in each homeowner&apos;s local daytime, even if you close this page. You can cancel any that have not sent from the Results tab.</span></Notice>
            <div className="flex flex-wrap gap-2"><button onClick={() => onViewResults(plan.batch)} className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">View in Results</button><button onClick={reset} className="h-10 px-5 rounded-xl border border-border text-sm hover:bg-muted">Create another</button></div>
          </div>
        )}
      </Card>
    );
  }

  if (loadError) return <Notice tone="red">{loadError}</Notice>;
  if (!audiences) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {banner && <Notice tone="blue"><Sparkles size={15} className="mt-0.5 shrink-0" /><span className="flex-1">Filled in from the AI plan: <b>{banner}</b>. Review and adjust anything below.</span><button onClick={onClearBanner} aria-label="Dismiss"><X size={14} /></button></Notice>}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const reachable = i === 0 || stepOk.slice(0, i).every(Boolean);
          return (
            <React.Fragment key={s}>
              <button disabled={!reachable} onClick={() => setStep(i)} className={cx('flex items-center gap-2 rounded-full pl-1.5 pr-4 py-1.5 text-sm whitespace-nowrap border transition-colors', step === i ? 'bg-primary text-primary-foreground border-primary' : reachable ? 'bg-card border-border hover:border-primary/50' : 'bg-card border-border opacity-50')}>
                <span className={cx('w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center', step === i ? 'bg-primary-foreground/20' : i < step ? 'bg-emerald-500 text-white' : 'bg-muted')}>{i < step ? '\u2713' : i + 1}</span>{s}
              </button>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>

      {step === 0 && (
        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle icon={<Users size={15} className="text-primary" />} title="Who should get this campaign?" hint="Only homeowners we are converting to short-term rentals who have not been texted before appear here. Existing hosts and anyone who opted out are always excluded." />
            <div className="grid md:grid-cols-2 gap-3">
              {audiences.map(a => (
                <button key={a.id} disabled={!a.size} onClick={() => setForm({ ...form, audience: a.id, states: [], minScore: 0, maxTexts: Math.min(form.maxTexts, a.size || 1) })}
                  className={cx('text-left rounded-xl border p-4 transition-all flex flex-col justify-start', form.audience === a.id ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:border-primary/50 hover:shadow-sm', !a.size && 'opacity-50 cursor-not-allowed')}>
                  <div className="flex items-start justify-between gap-2"><span className="font-medium text-sm">{a.label}</span><Chip tone={a.size ? 'blue' : 'muted'}>{a.size} available</Chip></div>
                  <p className="text-xs text-muted-foreground mt-1">{a.blurb}</p>
                  {a.size > 0 && <p className="text-[11px] text-muted-foreground mt-2">Average prospect score {a.avgScore}</p>}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">Audiences overlap, and a homeowner is only ever texted once across all campaigns.</p>
          </Card>

          {aud && (
            <Card className="p-5 space-y-5">
              <SectionTitle title="Narrow it down" hint="Optional. The number of matching homeowners updates as you change these." right={<Chip tone="primary">{matches} match</Chip>} />
              {aud.topStates.length > 0 && (
                <div><p className="text-xs font-medium text-muted-foreground mb-2">States (none selected means all)</p>
                  <div className="flex flex-wrap gap-1.5">{aud.topStates.map(s => { const on = form.states.includes(s.state); return (
                    <button key={s.state} onClick={() => set('states', on ? form.states.filter(x => x !== s.state) : [...form.states, s.state])} className={cx('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50')}>{s.state} <span className="opacity-70">{s.count}</span></button>); })}</div></div>
              )}
              <div className="grid sm:grid-cols-2 gap-6">
                <label className="block"><span className="text-xs font-medium text-muted-foreground flex justify-between"><span>Minimum prospect score</span><b className="text-foreground">{form.minScore || 'any'}</b></span>
                  <input type="range" min={0} max={90} step={5} value={form.minScore} onChange={e => set('minScore', Number(e.target.value))} className="w-full mt-2 accent-primary" /></label>
                <label className="block"><span className="text-xs font-medium text-muted-foreground flex justify-between"><span>Number of texts</span><b className="text-foreground">{count}</b></span>
                  <input type="range" min={1} max={Math.max(1, Math.min(500, matches))} value={Math.min(form.maxTexts, Math.max(1, matches))} onChange={e => set('maxTexts', Number(e.target.value))} className="w-full mt-2 accent-primary" /></label>
              </div>
              <label className="block"><span className="text-xs font-medium text-muted-foreground">Campaign name</span>
                <input value={form.name} onChange={e => set('name', e.target.value)} maxLength={60} placeholder="e.g. Hawaii luxury test" className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" /></label>
            </Card>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle icon={<MessageSquareText size={15} className="text-primary" />} title="Tone" hint="The wording itself is written for each homeowner from their own estimate and checked automatically: no guarantees, TRAVLR named, and a reply YES or NO opt-out. You choose the tone." />
            <div className="grid sm:grid-cols-3 gap-3">{TONES.map(t => (
              <button key={t.id} onClick={() => set('tone', t.id)} className={cx('text-left rounded-xl border p-4 transition-all flex flex-col justify-start', form.tone === t.id ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:border-primary/50')}>
                <p className="font-medium text-sm">{t.title}</p><p className="text-xs text-muted-foreground mt-1">{t.blurb}</p></button>))}</div>
          </Card>
          <Card className="p-5">
            <SectionTitle icon={<CalendarClock size={15} className="text-primary" />} title="When to send" hint="Each text goes out between 9am and 8pm in the homeowner's own time zone. If your start time is outside that, it moves to the next daytime hour." />
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className="text-xs font-medium text-muted-foreground">Start (your local time)</span>
                <input type="datetime-local" value={toLocalInput(form.startAt)} min={toLocalInput(new Date(Date.now() + 31 * 60_000).toISOString())} onChange={e => e.target.value && set('startAt', fromLocalInput(e.target.value))} className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" /></label>
              <label className="block"><span className="text-xs font-medium text-muted-foreground">Spread the sends over</span>
                <select value={form.spreadHours} onChange={e => set('spreadHours', Number(e.target.value) as BuilderForm['spreadHours'])} className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm">
                  <option value={0}>Send everything at the start time</option><option value={1}>1 hour</option><option value={2}>2 hours</option><option value={4}>4 hours</option></select></label>
            </div>
            {!startOk && <div className="mt-3"><Notice tone="amber">Pick a start at least 30 minutes from now, so every text can be scheduled with the carrier in time.</Notice></div>}
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle title="Review" hint="Nothing has been sent. These are real drafts of what homeowners in this campaign would receive." />
            <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div><dt className="text-xs text-muted-foreground">Campaign</dt><dd className="font-medium">{form.name}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Audience</dt><dd className="font-medium">{aud?.label}{form.states.length ? ` (${form.states.join(', ')})` : ''}{form.minScore ? `, score ${form.minScore}+` : ''}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Texts</dt><dd className="font-medium">up to {count}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Starts</dt><dd className="font-medium">{fmtDate(form.startAt)}{form.spreadHours ? `, over ${form.spreadHours}h` : ''}</dd></div>
            </dl>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={<MessageSquareText size={15} className="text-primary" />} title="Sample messages" />
            {previewing && <div className="grid md:grid-cols-3 gap-3"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>}
            {previewError && <Notice tone="red">{previewError}</Notice>}
            {preview && (
              <>
                <div className="grid md:grid-cols-3 gap-4">{preview.samples.map((s, i) => (
                  <div key={i} className="rounded-2xl bg-muted/60 p-3">
                    <div className="rounded-2xl rounded-bl-md bg-gradient-to-br from-sky-500 to-blue-600 text-white text-[13px] leading-snug px-3.5 py-2.5 whitespace-pre-wrap break-words shadow-sm">{s.message}</div>
                    <p className="text-[11px] text-muted-foreground mt-2 px-1">{s.state} · {s.segments} segment{s.segments > 1 ? 's' : ''} · {s.generatedBy === 'ai' ? 'AI-written' : 'template'}{s.sendAt ? ` · ${fmtDate(s.sendAt)}` : ''}</p>
                  </div>))}</div>
                {preview.sampled > 0 && preview.sendableInSample < preview.sampled && <div className="mt-3"><Notice tone="amber">{preview.sampled - preview.sendableInSample} of {preview.sampled} sampled homeowners could not be texted ({Object.entries(preview.blockers).map(([k, v]) => `${v} ${SKIP_LABEL[k] ?? k}`).join(', ')}). Those are skipped automatically, so the final count may be lower than {count}.</Notice></div>}
                <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
                  <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Estimated cost</p><p className="font-semibold">${preview.costLow.toFixed(2)} to ${preview.costHigh.toFixed(2)}</p><p className="text-[11px] text-muted-foreground">Twilio plus carrier fees, about {preview.avgSegments} segments each</p></div>
                  <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Phone screening</p><p className="font-semibold">Automatic</p><p className="text-[11px] text-muted-foreground">Landlines and invalid numbers are dropped before scheduling</p></div>
                  <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Safeguards</p><p className="font-semibold">Built in</p><p className="text-[11px] text-muted-foreground">Never co-host owners, opt-outs, anyone texted before, or outside 9am to 8pm</p></div>
                </div>
              </>
            )}
          </Card>

          {launchError && <Notice tone="red">{launchError}</Notice>}
          <Card className="p-5 flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-start gap-2.5 text-sm max-w-2xl cursor-pointer"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1 accent-primary" />
              <span>I have read the sample messages and want to schedule up to <b>{count}</b> texts to homeowners who have not been texted before.</span></label>
            <button onClick={launch} disabled={!confirmed || !preview || previewing} className="h-11 inline-flex items-center gap-2 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90"><Rocket size={16} /> Schedule campaign</button>
          </Card>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} className="h-10 inline-flex items-center gap-1 px-4 rounded-xl border border-border text-sm hover:bg-muted disabled:opacity-40"><ChevronLeft size={15} /> Back</button>
        {step < 2 && <button onClick={() => setStep(s => s + 1)} disabled={!stepOk[step]} className="h-10 inline-flex items-center gap-1 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">Continue <ChevronRight size={15} /></button>}
      </div>
    </div>
  );
}
