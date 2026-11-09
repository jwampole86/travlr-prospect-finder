// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { startWakeListener } from '../runtime/wake';
import type { WakeMatch } from '../runtime/wake';
import { describeSources } from '../runtime/freshness';
import type { SourceNote } from '../runtime/brain';
import { suggestionsFor, toursForRole } from '../host/types';
import type { AvaHost, AvaRole } from '../host/types';
import { ChipRow } from './ChipRow';
import { nextFollowups } from '../runtime/followups';
import { LearningClient, createLocalStore, createRemoteStore } from '../runtime/learning';
import { describeProfile, emptyProfile, personalizeSuggestions, topicId } from '../core/learning';
import type { Profile, Reason } from '../core/learning';
import { FLOAT_W, VISIBLE, floatSpot } from './floatSpot';
import { ACTION_STEPS, actionProgress } from '../runtime/cards';
import type { ActionStatus, AvaCard } from '../runtime/cards';
import { briefingDue, clampPosition, dayKey, defaultLayout, loadLayout, saveLayout } from './layout';
import type { LayoutPrefs } from './layout';
import './ava-widget.css';

interface Message { role: 'user' | 'ava' | 'system'; text: string; sources?: SourceNote[]; rateable?: boolean; topic?: string | null; rated?: 1 | -1; cards?: AvaCard[]; action?: { id: string; summary: string; status: ActionStatus } }
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
  mic: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>,
  move: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>,
  you: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
};

const HIGHLIGHT_CSS = '[data-ava-anchor].ava-highlight{outline:3px solid #00B2FF;outline-offset:3px;border-radius:12px;box-shadow:0 0 0 6px rgba(0,178,255,.25),0 0 24px rgba(0,178,255,.35);transition:box-shadow .25s,outline-color .25s}';

/** The life of one change AVA prepared: prepared, approved, done, confirmed. Shows the true outcome, including when it did not happen. */
function ActionSteps({ summary, status }: { summary: string; status: ActionStatus }) {
  const { complete, ended } = actionProgress(status);
  const words: Record<ActionStatus, string> = {
    awaiting: 'Waiting for your OK. Nothing has changed yet.',
    running: 'Approved. Making the change…',
    done: 'Done. The backend confirmed it.',
    failed: 'It did not go through. Nothing was changed.',
    cancelled: 'Cancelled. Nothing was changed.'
  };
  return (
    <div className={`steps ${ended ?? ''}`} data-testid="ava-action" data-status={status} role="group" aria-label={`Change: ${summary}`}>
      <ol>
        {ACTION_STEPS.map((label, i) => (
          <li key={label} className={i < complete ? 'on' : i === complete && !ended ? 'now' : ''}>{label}</li>
        ))}
      </ol>
      <small role="status">{words[status]}</small>
    </div>
  );
}

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
  // A person who hid her is not greeted by her again on the next page: she starts as the small edge tab.
  const startMode: Mode = typeof window !== 'undefined' && loadLayout().hidden ? 'closed' : initialMode;
  const [mode, setMode] = useState<Mode>(startMode);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [turn, setTurn] = useState(0);
  const [view, setView] = useState<ViewMode>(() => initialViewMode());
  const [fellBack, setFellBack] = useState(false);
  const retries = useRef(0);
  const [messages, setMessages] = useState<Message[]>(() => [{ role: 'ava', text: greetingFor(host) }]);
  const [voiceReplies, setVoiceReplies] = useState(false);
  // "Hey AVA" is available as soon as the browser has been given the microphone: there is no switch to find. It never listens before
  // that, and a small Pause control stops it for the session. Revoking the microphone in the browser ends it for good.
  const [profile, setProfile] = useState<Profile>(() => emptyProfile());
  const learning = useMemo(() => new LearningClient(host.offlineDemo ? createLocalStore() : createRemoteStore(host), setProfile), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [panelView, setPanelView] = useState<'chat' | 'you'>('chat');
  const [layout, setLayout] = useState<LayoutPrefs>(() => (typeof window === 'undefined' ? defaultLayout() : loadLayout()));
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const updateLayout = useCallback((patch: Partial<LayoutPrefs>) => {
    const next = { ...layoutRef.current, ...patch };
    layoutRef.current = next;
    saveLayout(next);
    setLayout(next);
  }, []);
  const sectionRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; right: number; bottom: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const [rating, setRating] = useState<number | null>(null);
  const [micGranted, setMicGranted] = useState(false);
  const [wakePaused, setWakePaused] = useState(() => { try { return window.localStorage.getItem('ava.wake.paused') === 'yes'; } catch { return false; } });
  const [wakeBroken, setWakeBroken] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [wakeCycle, setWakeCycle] = useState(0);
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
      addMessage: (r, text, sources, meta) => setMessages((m) => [...m, { role: r, text, sources, rateable: meta?.rateable, cards: meta?.cards, action: meta?.action ? { ...meta.action, status: 'awaiting' as const } : undefined, topic: topicId((sources ?? []).find((x) => x.kind === 'knowledge')?.citations?.[0]) }]),
      onAction: (id, status) => setMessages((m) => m.map((x) => (x.action?.id === id ? { ...x, action: { ...x.action, status } } : x))),
      onLearn: (e) => learning.record(e),
      voiceReplies: () => voiceRef.current,
      onCaption: setCaption
    }),
    [bus]
  );

  // Open on mount; mirror the OS reduced-motion preference.
  useEffect(() => {
    if (modeRef.current !== 'closed') bus.emit('ava.opened');
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
    const reset = () => { layer.style.transform = ''; layer.style.removeProperty('--ava-k'); setFloating(false); };
    if (!pointedAt || mode === 'closed' || layout.focus) { reset(); return; }
    const id = pointedAt;
    let raf = 0;
    let last = '';
    // Set when this effect is cleaned up. A frame that was already queued must never put her back out after she has gone home.
    let done = false;
    const tick = () => {
      if (done) return;
      raf = window.requestAnimationFrame(tick);
      const el = document.querySelector(`[data-ava-anchor="${CSS.escape(id)}"]`);
      if (!el) return;
      const h = home.getBoundingClientRect();
      // Her home box is measured with the layer's own transform out of the picture (it is a separate, untransformed box).
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
      layer.style.setProperty('--ava-k', String(scale)); // lets the status pill stay normal-sized while she is scaled up
      layer.style.transform = `translate(${spot.x - ox - h.left}px, ${spot.y - oy - h.top}px) scale(${scale})`;
      setFloating(true);
    };
    tick();
    return () => { done = true; window.cancelAnimationFrame(raf); reset(); };
  }, [pointedAt, mode, layout.focus]);

  // What she explains while guiding appears in the chat, so the chat must be on screen: a tour that starts while she is minimised
  // opens the panel.
  const guiding = !!state.tour;
  useEffect(() => { if (guiding && mode === 'mini' && !layout.focus) setMode('expanded'); }, [guiding, mode, layout.focus]);

  const changeMode = (next: Mode) => {
    if (next !== 'closed' && layoutRef.current.hidden) updateLayout({ hidden: false });
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
    const recognition = stt.current;
    stt.current = null; // cleared first: stopping recognition ends the session, which closes the microphone again
    recognition?.stop();
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
      setMicGranted(true); // a browser without the permission query learns it from this first successful use
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
        learning.record({ kind: 'input', modality: 'voice' });
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

  const toggleMicRef = useRef(toggleMic);
  toggleMicRef.current = toggleMic;
  useEffect(() => {
    void learning.init();
    const leave = () => { void learning.flush(); };
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); void learning.flush(); };
  }, [learning]);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Follow the browser's own microphone permission (it is remembered per site, so "Hey AVA" is ready on later visits too).
  useEffect(() => {
    let status: PermissionStatus | undefined;
    let gone = false;
    let known = false;
    let was = false;
    const apply = () => {
      if (gone || !status) return;
      const granted = status.state === 'granted';
      setMicGranted(granted);
      if (!granted) setWakeBroken(false);
      // Said once, when the user allows the microphone during this visit (not when it was already allowed on arrival).
      if (known && granted && !was && sttSupported()) {
        note('Microphone allowed. You can now just say "Hey AVA" any time this page is open (your browser\'s speech service listens for the phrase, and nothing reaches me until it hears it).');
      }
      known = true;
      was = granted;
    };
    (async () => {
      try {
        status = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
        if (!status) return;
        apply();
        status.onchange = apply;
      } catch { /* browsers without a microphone permission query learn it from the first successful use instead */ }
    })();
    return () => { gone = true; if (status) status.onchange = null; };
  }, []);

  const setPaused = (paused: boolean) => {
    setWakePaused(paused);
    try { window.localStorage.setItem('ava.wake.paused', paused ? 'yes' : 'no'); } catch { /* ignore */ }
  };

  const onWake = (match: WakeMatch) => {
    const st = stateRef.current;
    if (layoutRef.current.hidden) updateLayout({ hidden: false });
    if (!st.open || modeRef.current !== 'expanded') {
      setMode('expanded');
      if (!st.open) bus.emit('ava.opened');
    }
    orchestrator.stop('user');
    cancelSpeech();
    learning.record({ kind: 'wake_used' });
    setWakeCycle((n) => n + 1);
    if (match.rest) {
      orchestrator.submit(match.rest);
    } else {
      setMessages((m) => [...m, { role: 'ava', text: "Yes? I'm listening." }]);
      // The wake recogniser has just let go of the microphone; give the browser a moment before opening it again.
      window.setTimeout(() => { if (!mic.current) void toggleMicRef.current(); }, 350);
    }
  };
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  // Listen for the wake phrase whenever the microphone has been allowed and nothing else is using it or speaking.
  const listenForWake = micGranted && !wakePaused && !wakeBroken && sttSupported() && !state.micActive && !state.speaking;
  useEffect(() => {
    if (!listenForWake) { setWakeListening(false); return; }
    let cancelled = false;
    let listener: ReturnType<typeof startWakeListener> = null;
    (async () => {
      if (cancelled) return;
      listener = startWakeListener({
        onWake: (match) => onWakeRef.current(match),
        onListening: (on) => { if (!cancelled) setWakeListening(on); },
        onFatal: (reason) => {
          setWakeBroken(true);
          note(reason === 'not-allowed' ? '"Hey AVA" is off because the browser blocked speech access. You can still use the microphone button.'
            : reason === 'audio-capture' ? '"Hey AVA" is off because no microphone was found.'
            : reason === 'unsupported' ? '"Hey AVA" needs speech recognition, which this browser does not have (try Chrome, Edge or Safari).'
            : '"Hey AVA" is off because the browser\'s speech service keeps failing. Reload the page to try again.');
        }
      });
    })();
    return () => { cancelled = true; listener?.stop(); setWakeListening(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenForWake, wakeCycle]);

  const rate = (index: number, value: 1 | -1, reason?: Reason) => {
    const m = messages[index];
    if (!m?.rateable) return;
    setMessages((all) => all.map((x, i) => (i === index ? { ...x, rated: value } : x)));
    setRating(value === -1 && !reason ? index : null);
    learning.record({ kind: 'feedback', rating: value, topic: m.topic ?? null, ...(reason ? { reason } : {}) });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    closeMic();
    learning.record({ kind: 'input', modality: 'text' });
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
  const personalized = personalizeSuggestions(profile, suggestionsFor(host), toursForRole(host).map((t) => ({ id: t.id, title: t.title })));
  const tours = personalized.tours.map((t) => toursForRole(host).find((x) => x.id === t.id)!).filter(Boolean);
  const suggestions = personalized.suggestions;
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
  const launcherPos = offset ? { right: offset.right, bottom: offset.bottom } : undefined;
  // Where she sits: where the person last put her, or the host's own corner.
  const pos = layout.right !== undefined && layout.bottom !== undefined ? { right: layout.right, bottom: layout.bottom } : launcherPos;

  const viewport = () => ({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight });
  const moveTo = (p: { right: number; bottom: number }, save: boolean) => {
    const r = sectionRef.current?.getBoundingClientRect();
    const c = clampPosition(p, { w: r?.width ?? 0, h: r?.height ?? 0 }, viewport());
    const next = { ...layoutRef.current, ...c };
    layoutRef.current = next;
    setLayout(next);
    if (save) saveLayout(next);
  };
  const dragStart = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, a, label, textarea')) return;
    justDragged.current = false; // a new gesture: only the click that ends a drag is ignored, never a later tap
    const r = sectionRef.current?.getBoundingClientRect();
    if (!r) return;
    const v = viewport();
    drag.current = { x: e.clientX, y: e.clientY, right: v.w - r.right, bottom: v.h - r.bottom, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const dragMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    moveTo({ right: d.right - dx, bottom: d.bottom - dy }, false);
  };
  const dragEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    justDragged.current = true; // the click that ends a drag must not also count as a tap on her
    window.setTimeout(() => { justDragged.current = false; }, 80);
    saveLayout(layoutRef.current);
  };
  const resetPosition = () => updateLayout({ right: undefined, bottom: undefined });
  const nudge = (e: ReactKeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 96 : 24;
    const dir: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key === 'Home') { e.preventDefault(); resetPosition(); return; }
    const d = dir[e.key];
    const r = sectionRef.current?.getBoundingClientRect();
    if (!d || !r) return;
    e.preventDefault();
    const v = viewport();
    moveTo({ right: v.w - r.right + d[0], bottom: v.h - r.bottom + d[1] }, true);
  };

  // A saved position from a bigger window must never leave her off the edge of a smaller one.
  useEffect(() => {
    const fit = () => {
      const l = layoutRef.current;
      const r = sectionRef.current?.getBoundingClientRect();
      if (l.right === undefined || l.bottom === undefined || !r) return;
      const c = clampPosition({ right: l.right, bottom: l.bottom }, { w: r.width, h: r.height }, { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight });
      if (c.right !== l.right || c.bottom !== l.bottom) updateLayout(c);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [mode, panelView, layout.right, layout.bottom, updateLayout]);

  // The first time she is opened each day she says what needs the person, if they have not turned that off.
  const briefed = useRef(false);
  const staff = host.role === 'admin' || host.role === 'owner' || host.role === 'agent';
  useEffect(() => {
    if (!host.briefing || !staff || mode !== 'expanded' || briefed.current || !briefingDue(layoutRef.current)) return;
    briefed.current = true;
    // Counted as given as soon as it starts, so a quick reload cannot repeat it; given back if it could not be fetched.
    const previous = layoutRef.current.briefedOn;
    updateLayout({ briefedOn: dayKey() });
    void orchestrator.briefing(true).then((ok) => { if (!ok) updateLayout({ briefedOn: previous }); });
  }, [host.briefing, staff, mode, layout.focus, layout.briefing, layout.hidden, orchestrator, updateLayout]);

  const hideAva = () => { changeMode('closed'); updateLayout({ hidden: true }); };

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

      {mode === 'closed' && layout.hidden && (
        <button className="edge-tab" onClick={() => changeMode('expanded')} aria-label="Show AVA" title="Show AVA">AVA</button>
      )}
      {mode === 'closed' && !layout.hidden && (
        <button className={`launcher${wakeListening ? ' wake' : ''}`} style={launcherPos} onClick={() => changeMode('expanded')} onPointerEnter={() => setWarm(true)} onFocus={() => setWarm(true)} aria-label="Open AVA">AVA</button>
      )}

      {mode !== 'closed' && (
        <section className={`ava ${mode}`} style={pos} ref={sectionRef} data-focus={layout.focus ? 'true' : undefined} aria-label="AVA assistant">
          <div className="ava-stage" ref={homeRef}>
            <div className="ava-float" ref={stageRef} data-floating={floating ? 'true' : 'false'}
                 onPointerDown={mode === 'mini' ? dragStart : undefined} onPointerMove={mode === 'mini' ? dragMove : undefined} onPointerUp={mode === 'mini' ? dragEnd : undefined} onPointerCancel={mode === 'mini' ? dragEnd : undefined}
                 onClick={mode === 'mini' ? () => { if (!justDragged.current) changeMode('expanded'); } : undefined}
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
              <div className="panel-head" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd} onDoubleClick={resetPosition} title="Drag to move AVA; double-click to put her back">
                <div className="title">
                  <strong>AVA</strong>
                  <span className={`status ${status.tone}`}><i className="dot" />{status.text}</span>
                </div>
                <div className="head-actions">
                  <button className="icon-btn" onKeyDown={nudge} aria-label="Move AVA (arrow keys; Home puts her back)" title="Move AVA: drag the header, or focus this and use the arrow keys"><span className="icon">{Icon.move}</span></button>
                  <button className="icon-btn" onClick={() => setPanelView((v) => (v === 'you' ? 'chat' : 'you'))} aria-label="Your AVA" aria-pressed={panelView === 'you'} title="What AVA has learned about you"><span className="icon">{Icon.you}</span></button>
                  <button className="icon-btn" onClick={() => changeMode('mini')} aria-label="Minimize AVA">–</button>
                  <button className="icon-btn" onClick={() => changeMode('closed')} aria-label="Close AVA">✕</button>
                </div>
              </div>

              {panelView === 'you' ? (
                <div className="you-view" role="region" aria-label="Your AVA">
                  <h3>Your AVA</h3>
                  <p className="you-intro">AVA learns from how you use her so she can help you better. She keeps counts and ids only (which tours you finished, which screens you open, whether answers helped). She never keeps what you type or say, or any lead or contact details.</p>
                  {profile.personalization ? (
                    <dl className="you-list">{describeProfile(profile, Object.fromEntries(toursForRole(host).map((t) => [t.id, t.title]))).map((l) => (<div key={l.label}><dt>{l.label}</dt><dd>{l.detail}</dd></div>))}</dl>
                  ) : <p className="you-off">Personalization is off, so AVA is not learning from your use and treats every visit the same.</p>}
                  <label className="switch"><input type="checkbox" checked={profile.personalization} onChange={(e) => void learning.setConsent({ personalization: e.target.checked })} /> Tailor AVA to me</label>
                  <label className="switch"><input type="checkbox" checked={profile.sharing} onChange={(e) => void learning.setConsent({ sharing: e.target.checked })} /> Share anonymous usage to improve AVYRO <small>(no name, no text; just which features and help topics are used)</small></label>
                  <h3 className="you-sub">How AVA sits on your screen</h3>
                  {host.briefing && staff && (
                    <label className="switch"><input type="checkbox" checked={layout.briefing} onChange={(e) => updateLayout({ briefing: e.target.checked })} /> Morning briefing <small>(a short summary of what needs you, the first time you open me each day)</small></label>
                  )}
                  <label className="switch"><input type="checkbox" checked={layout.focus} onChange={(e) => updateLayout({ focus: e.target.checked })} /> Focus mode <small>(I stay out of the way: no briefing, I don't open or fly out on my own; I still answer when you ask)</small></label>
                  <div className="you-actions">
                    <button type="button" onClick={resetPosition} disabled={layout.right === undefined}>Put AVA back in her corner</button>
                    <button type="button" onClick={hideAva}>Hide AVA</button>
                  </div>
                  <div className="you-actions">
                    <button type="button" onClick={() => void learning.erase()}>Forget what AVA has learned</button>
                    <button type="button" className="primary" onClick={() => setPanelView('chat')}>Back to chat</button>
                  </div>
                </div>
              ) : state.micActive ? (
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
                      {m.action && <ActionSteps summary={m.action.summary} status={m.action.status} />}
                      {m.cards && m.cards.length > 0 && (
                        <div className="cards" role="group" aria-label="Suggested actions">
                          {m.cards.map((c) => (
                            <div key={c.id} className="card" data-testid="ava-card">
                              <div className="card-head"><strong>{c.title}</strong>{c.meta && <small>{c.meta}</small>}</div>
                              {c.why && <ul className="why" aria-label="Why">{c.why.map((w) => <li key={w}>{w}</li>)}</ul>}
                              {c.actions.length > 0 && (
                                <div className="card-actions">
                                  {c.actions.map((a) => (
                                    <button key={a.label} type="button" className={`chip small${a.kind === 'prepare' ? ' change' : ''}`}
                                      title={a.kind === 'prepare' ? 'I will ask for your OK before anything changes' : undefined}
                                      onClick={() => void orchestrator.cardAction(a)}>{a.label}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {m.rateable && (
                        <div className="rate" role="group" aria-label="Was this helpful?">
                          {m.rated === undefined ? (
                            <>
                              <button type="button" onClick={() => rate(i, 1)} aria-label="Helpful" title="Helpful">👍</button>
                              <button type="button" onClick={() => rate(i, -1)} aria-label="Not helpful" title="Not helpful">👎</button>
                            </>
                          ) : rating === i ? (
                            <>
                              <span className="rate-why">What was off?</span>
                              {([['too_long', 'Too long'], ['too_short', 'Too short'], ['not_helpful', 'Not helpful'], ['wrong', 'Wrong']] as const).map(([r, label]) => (
                                <button key={r} type="button" className="chip small" onClick={() => rate(i, -1, r)}>{label}</button>
                              ))}
                            </>
                          ) : <span className="rate-thanks">Thanks, I'll use that.</span>}
                        </div>
                      )}
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

              {!state.micActive && panelView === 'chat' && !busy && !confirmation && (firstTurn ? suggestions.length > 0 || tours.length > 0 : followups.length > 0) && (
                <ChipRow label={firstTurn ? 'Quick actions' : 'Suggested next'}>
                  {firstTurn ? (
                    <>
                      {host.briefing && staff && <button className="chip" onClick={() => void orchestrator.briefing(false)}>Brief me on today</button>}
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
                {sttSupported() && micGranted && !wakeBroken && (
                  <span className="wake-status" title={'Say "Hey AVA" to wake her. Your browser\'s speech service listens for the phrase, and nothing reaches AVA until it hears it.'}>
                    <span className={`wake-dot ${wakeListening ? 'on' : ''}`} role="status" aria-label={wakeListening ? 'Listening for Hey AVA' : 'Hey AVA is paused'} />
                    {wakePaused ? 'Hey AVA paused' : 'Say "Hey AVA"'}
                    <button type="button" className="wake-pause" onClick={() => setPaused(!wakePaused)}>{wakePaused ? 'Resume' : 'Pause'}</button>
                  </span>
                )}
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
