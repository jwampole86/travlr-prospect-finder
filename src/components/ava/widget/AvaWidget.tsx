// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { FormEvent, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AvaStage, preloadAvaModel } from '../render/AvaStage';
import { setAssetBase } from '../render/assets';
import { initialViewMode, webglAvailable } from '../render/webgl';
import type { ViewMode } from '../render/webgl';
const StudioPanel = lazy(() => import('../ui/StudioPanel').then((m) => ({ default: m.StudioPanel })));
import { newRequestId, useAva } from '../runtime/useAva';
import { createOrchestrator } from '../runtime/orchestrator';
import { micLevel, openMic, MicSession } from '../runtime/mic';
import { cancelSpeech, speechSupported } from '../runtime/speech';
import { SttSession, sttSupported, startRecognition } from '../runtime/stt';
import { describeSources } from '../runtime/freshness';
import type { SourceNote } from '../runtime/brain';
import { suggestionsFor, toursForRole } from '../host/types';
import type { AvaHost, AvaRole } from '../host/types';
import { ChipRow } from './ChipRow';
import { nextFollowups } from '../runtime/followups';
import { FLOAT_W, VISIBLE, floatSpot } from './floatSpot';
import './ava-widget.css';

interface Message { role: 'user' | 'ava' | 'system'; text: string; sources?: SourceNote[] }
type Mode = 'closed' | 'mini' | 'expanded';

export function greetingFor(host: AvaHost): string {
  const canLeads = host.role === 'admin' || host.role === 'owner' || host.role === 'agent';
  const what = canLeads
    ? 'find leads, explain how AVYRO works and walk you through the screen'
    : 'explain how AVYRO works and show you around';
  return `Hi, I'm AVA, your AVYRO assistant. I can ${what}. What would you like to do?`;
}

const STATUS: Record<string, { text: string; tone: '' | 'busy' | 'warn' | 'asleep' }> = {
  idle: { text: 'Online', tone: '' }, greeting: { text: 'Online', tone: '' },
  listening: { text: 'Listening…', tone: 'busy' }, thinking: { text: 'Thinking…', tone: 'busy' }, searching: { text: 'Searching…', tone: 'busy' },
  explaining: { text: 'Answering…', tone: 'busy' }, guiding: { text: 'Showing you…', tone: 'busy' },
  success: { text: 'Done', tone: '' }, confirming: { text: 'Waiting for your OK', tone: 'busy' },
  warning: { text: 'Something went wrong', tone: 'warn' }, error: { text: 'Something went wrong', tone: 'warn' }, micDenied: { text: 'Microphone blocked', tone: 'warn' },
  sleeping: { text: 'Sleeping', tone: 'asleep' }
};

const Icon = {
  send: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg>,
  mic: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>
};

const HIGHLIGHT_CSS = '[data-ava-anchor].ava-highlight{outline:3px solid #00B2FF;outline-offset:3px;border-radius:12px;box-shadow:0 0 0 6px rgba(0,178,255,.25),0 0 24px rgba(0,178,255,.35);transition:box-shadow .25s,outline-color .25s}';

export interface AvaWidgetProps {
  host: AvaHost;
  /** Developer Animation Studio (sandbox only). */
  studio?: boolean;
  /** Sandbox-only: lets the Studio switch the demo role. */
  onRoleChange?: (role: AvaRole | null) => void;
  initialMode?: Mode;
  /** Distance of the launcher/panel from the bottom-right corner, for hosts with their own floating buttons. */
  offset?: { right: number; bottom: number };
}

export function AvaWidget({ host, studio = false, onRoleChange, initialMode = 'expanded', offset }: AvaWidgetProps) {
  setAssetBase(host.assetBase);
  const hostRef = useRef(host);
  hostRef.current = host;
  const { bus, state, presentation, log } = useAva(() => ({ route: hostRef.current.getRoute(), role: hostRef.current.role ?? undefined }));
  const [mode, setMode] = useState<Mode>(initialMode);
  const [turn, setTurn] = useState(0);
  const [view, setView] = useState<ViewMode>(() => initialViewMode());
  const [fellBack, setFellBack] = useState(false);
  const retries = useRef(0);
  const [messages, setMessages] = useState<Message[]>(() => [{ role: 'ava', text: greetingFor(host) }]);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [toursStarted, setToursStarted] = useState<string[]>([]);
  const [captionsOn, setCaptionsOn] = useState(() => { try { return window.localStorage.getItem('ava.captions') !== 'off'; } catch { return true; } });
  const [caption, setCaption] = useState<string | null>(null);
  const voiceRef = useRef(false);
  voiceRef.current = voiceReplies;
  const mic = useRef<MicSession | null>(null);
  const micReq = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null); // the floating layer: the character, which can leave its home to point at things
  const homeRef = useRef<HTMLDivElement>(null); // where the character lives in the panel; never moves
  const panelRef = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState(false);
  const parkRef = useRef<HTMLDivElement>(null);
  const [warm, setWarm] = useState(false);
  const [ready, setReady] = useState(false);
  // One 3D stage lives for the whole life of the widget. It is built in the background while AVA is closed and simply moved
  // into view when she is opened, so there is no model download, scene setup or shader compile left to wait for.
  const stageHost = useMemo(() => {
    const el = document.createElement('div');
    el.className = 'stage-host';
    return el;
  }, []);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view !== '3d') return;
    preloadAvaModel();
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = idle ? idle(() => setWarm(true), { timeout: 1500 }) : window.setTimeout(() => setWarm(true), 400);
    return () => { if (idle) (window as unknown as { cancelIdleCallback: (n: number) => void }).cancelIdleCallback(id); else window.clearTimeout(id); };
  }, [view]);

  useLayoutEffect(() => {
    const target = mode !== 'closed' ? stageRef.current : parkRef.current;
    if (target && stageHost.parentElement !== target) target.insertBefore(stageHost, target.firstChild);
  });

  // The greeting depends on the role, so refresh it if nothing has been said yet.
  const role = host.role;
  useEffect(() => {
    setMessages((m) => (m.length === 1 && m[0].role === 'ava' ? [{ role: 'ava', text: greetingFor(hostRef.current) }] : m));
  }, [role]);

  const orchestrator = useMemo(
    () => createOrchestrator(bus, new Proxy({} as AvaHost, { get: (_t, k) => (hostRef.current as unknown as Record<string | symbol, unknown>)[k] }), {
      addMessage: (r, text, sources) => setMessages((m) => [...m, { role: r, text, sources }]),
      voiceReplies: () => voiceRef.current,
      onCaption: setCaption
    }),
    [bus]
  );

  // Open on mount; mirror the OS reduced-motion preference.
  useEffect(() => {
    if (initialMode !== 'closed') bus.emit('ava.opened');
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => bus.emit('ava.settings.changed', undefined, { reducedMotion: mq.matches });
    if (mq.matches) apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [bus, initialMode]);


  // Highlight the real element AVA is pointing at (works on any page that marks anchors with data-ava-anchor).
  useEffect(() => {
    const id = document.createElement('style');
    id.textContent = HIGHLIGHT_CSS;
    document.head.appendChild(id);
    return () => id.remove();
  }, []);
  const pointedAt = presentation.guide?.resolved ? presentation.guide.anchorId : null;
  const reducedMotion = presentation.motion === 'reduced';
  useEffect(() => {
    if (!pointedAt) return;
    const el = document.querySelector(`[data-ava-anchor="${CSS.escape(pointedAt)}"]`);
    if (!el) return;
    el.classList.add('ava-highlight');
    el.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    return () => el.classList.remove('ava-highlight');
  }, [pointedAt, reducedMotion]);

  // Floating guide: while AVA points at something she leaves the panel and hovers beside it, then glides home when done.
  useEffect(() => {
    const layer = stageRef.current;
    const home = homeRef.current;
    if (!layer || !home) return;
    const reset = () => { layer.style.transform = ''; setFloating(false); };
    if (!pointedAt || mode === 'closed') { reset(); return; }
    const id = pointedAt;
    let raf = 0;
    let last = '';
    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      const el = document.querySelector(`[data-ava-anchor="${CSS.escape(id)}"]`);
      if (!el) return;
      const h = home.getBoundingClientRect();
      const t = el.getBoundingClientRect();
      const avoid = panelRef.current?.getBoundingClientRect() ?? null;
      const scale = FLOAT_W / h.width;
      const layerH = h.height * scale;
      // The character fills only the middle of her layer; place that visible part, not the whole transparent layer.
      const ox = FLOAT_W * VISIBLE.x, oy = layerH * VISIBLE.y;
      const spot = floatSpot({ w: window.innerWidth, h: window.innerHeight }, t, avoid, { w: FLOAT_W * VISIBLE.w, h: layerH * VISIBLE.h });
      const key = `${Math.round(spot.x - ox - h.left)},${Math.round(spot.y - oy - h.top)},${scale.toFixed(3)}`;
      if (key === last) return;
      last = key;
      layer.style.transform = `translate(${spot.x - ox - h.left}px, ${spot.y - oy - h.top}px) scale(${scale})`;
      setFloating(true);
    };
    tick();
    return () => { window.cancelAnimationFrame(raf); reset(); };
  }, [pointedAt, mode]);

  const changeMode = (next: Mode) => {
    setMode(next);
    if (next === 'closed') { orchestrator.stop('system'); closeMic(); bus.emit('ava.closed'); }
    else if (!state.open) bus.emit('ava.opened');
  };

  // 3D is the real AVA. If it dropped to the flat view because of an error (not because 2D was requested), try again
  // a few times in the background, and let the user retry right away too.
  useEffect(() => {
    if (!fellBack || view !== '2d' || !webglAvailable() || retries.current >= 3) return;
    const id = window.setTimeout(() => { retries.current += 1; setView('3d'); }, 15000 * (retries.current + 1));
    return () => window.clearTimeout(id);
  }, [fellBack, view]);

  const onStageReady = useCallback(() => setReady(true), []);
  useEffect(() => { setReady(false); }, [view]);
  const stt = useRef<SttSession | null>(null);
  const [draft, setDraft] = useState('');

  function closeMic() {
    stt.current?.stop();
    stt.current = null;
    if (mic.current) {
      mic.current.stop();
      mic.current = null;
      micLevel.current = () => 0;
      if (micReq.current) bus.emit('ava.input.ended', micReq.current, { modality: 'voice' });
      micReq.current = null;
    }
  }

  const note = (text: string) => setMessages((m) => [...m, { role: 'system', text }]);

  async function toggleMic() {
    if (mic.current) return closeMic();
    orchestrator.stop('user');
    try {
      const session = await openMic();
      mic.current = session;
      micLevel.current = session.level;
      micReq.current = newRequestId();
      bus.emit('ava.settings.changed', undefined, { micPermission: 'granted' });
      bus.emit('ava.input.started', micReq.current, { modality: 'voice' });
    } catch {
      bus.emit('ava.permission.denied', undefined, { scope: 'microphone' });
      note('Microphone permission was denied or unavailable. Text input still works.');
      return;
    }
    const session = startRecognition({
      onInterim: (text) => setDraft(text),
      onFinal: (text) => {
        setDraft('');
        closeMic();
        orchestrator.submit(text);
      },
      onError: (error) => {
        if (error === 'not-allowed') {
          bus.emit('ava.permission.denied', undefined, { scope: 'microphone' });
          note('Speech recognition was blocked. Allow microphone access for this site, or type your request.');
        } else if (error === 'no-speech') note("I didn't hear anything. Tap the microphone and try again.");
        else if (error === 'network') note('Speech recognition needs a network connection. Please type your request instead.');
        else if (error === 'audio-capture') note('No microphone was found. Please type your request instead.');
        else note('Speech recognition failed. Please type your request instead.');
      },
      onEnd: () => closeMic()
    });
    if (session) stt.current = session;
    else note('This browser has no speech recognition (try Chrome, Edge or Safari). The microphone level still shows, but please type your request.');
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    closeMic();
    orchestrator.submit(text);
  };
  const stop = () => { orchestrator.stop('user'); cancelSpeech(); };

  const toggleCaptions = (on: boolean) => {
    setCaptionsOn(on);
    try { window.localStorage.setItem('ava.captions', on ? 'on' : 'off'); } catch { /* ignore */ }
  };

  // Where the guided UI element is, relative to AVA's position on screen.
  const getGaze = useCallback(() => {
    const id = bus.getState().tour?.anchorId;
    const stage = stageRef.current;
    if (!id || !stage) return 0;
    const el = document.querySelector(`[data-ava-anchor="${CSS.escape(id)}"]`);
    if (!el) return 0;
    const a = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (s.left + s.width / 2);
    return Math.max(-1, Math.min(1, dx / (window.innerWidth * 0.4)));
  }, [bus]);
  const getMic = useCallback(() => micLevel.current(), []);

  const confirmation = state.confirmation;
  const faceLabel = presentation.face;
  const tours = toursForRole(host);
  const suggestions = suggestionsFor(host);
  const status = STATUS[faceLabel] ?? STATUS.idle;
  const busy = state.reasoning || Object.keys(state.tools).length > 0 || state.answering || state.speaking || !!state.tour;
  const firstTurn = messages.every((m) => m.role !== 'user');
  // A reply bubble shows from the moment a question is sent until the answer starts to appear.
  const activeTool = Object.values(state.tools)[0]?.tool;
  const composing = !state.micActive && (state.reasoning || !!activeTool) && !state.answering
    ? (activeTool === 'search_leads' || activeTool === 'leads.search' ? 'AVA is searching your leads and writing a reply…' : activeTool === 'search_knowledge' ? 'AVA is looking that up and writing a reply…' : 'AVA is writing a reply…')
    : null;
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }); }, [messages, composing]);
  // After every answer, offer what is most useful to ask next (not just on the first turn).
  const toursDone = useMemo(() => tours.filter((t) => toursStarted.includes(t.id) || messages.some((m) => m.role === 'ava' && m.text.includes(`"${t.title}" tour`))).map((t) => t.id), [tours, messages, toursStarted]);
  // The sources of this turn's answer: tour narration that follows an answer carries none, so look back to the user's last message.
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const answerSources = [...messages.slice(lastUser + 1)].reverse().find((m) => m.role === 'ava' && m.sources?.length)?.sources;
  const followups = useMemo(
    () => nextFollowups({ host, asked: messages.filter((m) => m.role === 'user').map((m) => m.text), sources: answerSources, toursDone }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, messages, toursDone]
  );
  const pos = offset ? { right: offset.right, bottom: offset.bottom } : undefined;

  return (
    <div className="ava-root">
      {studio && (
        <Suspense fallback={null}>
          <StudioPanel bus={bus} state={state} presentation={presentation} log={log} turn={turn} setTurn={setTurn} role={host.role} onRoleChange={onRoleChange} />
        </Suspense>
      )}


      {(mode !== 'closed' || (warm && view === '3d')) && createPortal(
        <AvaStage
              className="stage-canvas" active={mode !== 'closed'} onReady={onStageReady} presentation={presentation} getMicLevel={getMic} getGaze={getGaze} turnDeg={turn} mode={view}
              onFailure={() => { setView('2d'); setFellBack(true); note("The 3D view hit a problem, so I'm showing the simple view for now. I'll keep trying to bring 3D back."); }}
            />
        ,
        stageHost
      )}
      <div className="ava-park" ref={parkRef} aria-hidden="true" />

      {mode === 'closed' && (
        <button className="launcher" style={pos} onClick={() => changeMode('expanded')} onPointerEnter={() => setWarm(true)} onFocus={() => setWarm(true)} aria-label="Open AVA">AVA</button>
      )}

      {mode !== 'closed' && (
        <section className={`ava ${mode}`} style={pos} aria-label="AVA assistant">
          <div className="ava-stage" ref={homeRef}>
            <div className="ava-float" ref={stageRef} data-floating={floating ? 'true' : 'false'}
                 onClick={mode === 'mini' ? () => changeMode('expanded') : undefined}
                 role={mode === 'mini' ? 'button' : undefined} tabIndex={mode === 'mini' ? 0 : undefined}
                 onKeyDown={(e) => mode === 'mini' && (e.key === 'Enter' || e.key === ' ') && changeMode('expanded')}
                 aria-label={mode === 'mini' ? `Expand AVA, ${faceLabel}` : undefined}>
              {mode === 'mini' && <div className="stage-hit" aria-hidden="true" />}
              {!ready && view === '3d' && <div className="stage-loading" aria-hidden="true"><i /></div>}
              {view === '2d' && fellBack && webglAvailable() && (
                <button className="try3d" onClick={() => { retries.current = 0; setView('3d'); }}>Try 3D again</button>
              )}
              {faceLabel === 'sleeping' && (
                <div className={`zzz ${presentation.motion}`} aria-hidden="true"><span>Z</span><span>Z</span><span>Z</span></div>
              )}
              {captionsOn && caption && <div className="caption" aria-hidden="true" data-testid="caption">{caption}</div>}
              <span className={`badge ${faceLabel}`}>{faceLabel}{presentation.overlays.speaking ? ' · speaking' : ''}</span>
            </div>
          </div>

          {mode === 'expanded' && (
            <div className="panel" ref={panelRef}>
              <div className="panel-head">
                <div className="title">
                  <strong>AVA</strong>
                  <span className={`status ${status.tone}`}><i className="dot" />{status.text}</span>
                </div>
                <div className="head-actions">
                  <button className="icon-btn" onClick={() => changeMode('mini')} aria-label="Minimize AVA">–</button>
                  <button className="icon-btn" onClick={() => changeMode('closed')} aria-label="Close AVA">✕</button>
                </div>
              </div>

              {state.micActive ? (
                <div className="voice-view" role="status">
                  <p className="voice-label">Listening to you</p>
                  <h2>{draft || 'How can I assist you today?'}</h2>
                  <button className="orb" onClick={toggleMic} aria-label="Stop listening">{Icon.mic}</button>
                  <span className="orb-hint">Tap to stop</span>
                </div>
              ) : (
                <div className="messages" role="log" aria-live="polite" aria-label="Conversation" tabIndex={0}>
                  {messages.map((m, i) => (
                    <div key={i} className={`msg msg-${m.role}`}>
                      <p>{m.text}</p>
                      {/* Source notes (help article names, versions) are internal. Only the sandbox demo shows them, so its sample data is never mistaken for real data. */}
                      {host.offlineDemo && describeSources(m.sources).map((line, j) => <small key={j} className="sources">{line}</small>)}
                    </div>
                  ))}
                  {composing && (
                    <div className="msg msg-ava msg-typing" data-testid="reply-pending">
                      <p role="status" aria-label={composing}><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span><span className="typing-label">{composing}</span></p>
                    </div>
                  )}
                  {presentation.announce === 'warning' && <div className="msg msg-system"><p>Something went wrong. Nothing was completed.</p></div>}
                  <div ref={logEnd} />
                </div>
              )}

              {!state.micActive && !busy && !confirmation && (firstTurn ? suggestions.length > 0 || tours.length > 0 : followups.length > 0) && (
                <ChipRow label={firstTurn ? 'Quick actions' : 'Suggested next'}>
                  {firstTurn ? (
                    <>
                      {suggestions.map((q) => <button key={q} className="chip" onClick={() => orchestrator.submit(q)}>{q}</button>)}
                      {tours.map((t) => (
                        <button key={t.id} className="chip tour" title={t.summary} onClick={() => { setToursStarted((d) => [...d, t.id]); orchestrator.startTourById(t.id); }}>Tour: {t.title}</button>
                      ))}
                    </>
                  ) : followups.map((f) => f.kind === 'tour' && f.tourId ? (
                    <button key={f.label} className="chip tour" onClick={() => { setToursStarted((d) => [...d, f.tourId as string]); orchestrator.startTourById(f.tourId as string); }}>{f.label}</button>
                  ) : (
                    <button key={f.label} className="chip" onClick={() => orchestrator.submit(f.label)}>{f.label}</button>
                  ))}
                </ChipRow>
              )}
              {confirmation && (
                <div className="confirm" role="alertdialog" aria-label="Confirm action">
                  <span>Confirm: {confirmation.summary ?? 'make this change'}?</span>
                  <button className="primary" onClick={() => bus.emit('ava.confirmation.accepted', confirmation.requestId, { actionId: confirmation.actionId })}>Confirm</button>
                  <button onClick={() => bus.emit('ava.confirmation.rejected', confirmation.requestId, { actionId: confirmation.actionId })}>Cancel</button>
                </div>
              )}
              {busy && !state.micActive && !confirmation && (
                <div className="stop-row"><button className="stop-btn" onClick={stop} title="Stop AVA">■ Stop</button></div>
              )}
              <form onSubmit={submit} className="composer">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask AVA anything…" aria-label="Message AVA" />
                {!state.micActive && (
                  <button type="button" className="round soft" onClick={toggleMic} aria-pressed={false} aria-label="Speak to AVA" title={sttSupported() ? 'Speak to AVA' : 'Microphone level only: this browser has no speech recognition'}>{Icon.mic}</button>
                )}
                <button type="submit" className="round primary" aria-label="Send">{Icon.send}</button>
              </form>
              <div className="toggles">
                <label className="switch">
                  <input type="checkbox" checked={voiceReplies} disabled={!speechSupported()} onChange={(e) => setVoiceReplies(e.target.checked)} /> Spoken replies
                </label>
                <label className="switch">
                  <input type="checkbox" checked={captionsOn} onChange={(e) => toggleCaptions(e.target.checked)} /> Captions
                </label>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
