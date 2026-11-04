// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/**
 * AVA state model (spec v2, section 8).
 *
 * Reducer = what is TRUE (validated events only).
 * Selector = what AVA SHOWS (derived from truth, priority-ordered, time-aware).
 * Both are pure; time is always passed in, never read from a clock.
 */
import manifest from './ava-animation-manifest.json';
import type { AvaEvent, MicPermission, Side } from './ava-events';

const TIMING = manifest.timing;

export interface ActiveTool {
  requestId: string;
  tool: string;
  mutating: boolean;
}

export interface TourState {
  tourId: string;
  stepId: string;
  anchorId: string;
  anchorResolved: boolean;
  side: Side;
}

export interface Transient {
  requestId: string | null;
  startedAtMs: number;
  reason?: string;
}

export interface AvaState {
  open: boolean;
  disabled: boolean;
  reducedMotion: boolean;
  micActive: boolean;
  micPermission: MicPermission;
  currentRequestId: string | null;
  reasoning: boolean;
  tools: Record<string, ActiveTool>;
  confirmation: { requestId: string; actionId: string; summary?: string } | null;
  answering: boolean;
  speaking: boolean;
  tour: TourState | null;
  success: Transient | null;
  warning: Transient | null;
  greetStartedAtMs: number | null;
  cancelStartedAtMs: number | null;
  /** Time of the last event of any kind; drives the sleeping face. */
  lastActivityMs: number;
  seenEventIds: string[];
}

export type Disposition = 'applied' | 'duplicate' | 'stale' | 'ignored';

export interface ReduceResult {
  state: AvaState;
  disposition: Disposition;
  /** Machine-readable reason, intended for animation telemetry. */
  note?: string;
}

export function createInitialState(): AvaState {
  return {
    open: false,
    disabled: false,
    reducedMotion: false,
    micActive: false,
    micPermission: 'unknown',
    currentRequestId: null,
    reasoning: false,
    tools: {},
    confirmation: null,
    answering: false,
    speaking: false,
    tour: null,
    success: null,
    warning: null,
    greetStartedAtMs: null,
    cancelStartedAtMs: null,
    lastActivityMs: 0,
    seenEventIds: []
  };
}

const ALWAYS_PROCESSED = new Set([
  'ava.opened',
  'ava.closed',
  'ava.enabled',
  'ava.disabled',
  'ava.settings.changed'
]);

const REQUEST_GUARDED = new Set([
  'ava.reasoning.ended',
  'ava.tool.started',
  'ava.confirmation.required',
  'ava.confirmation.accepted',
  'ava.confirmation.rejected',
  'ava.answer.started',
  'ava.answer.ended'
]);

const applied = (state: AvaState, note?: string): ReduceResult => ({ state, disposition: 'applied', note });
const stale = (state: AvaState, note: string): ReduceResult => ({ state, disposition: 'stale', note });
const ignored = (state: AvaState, note: string): ReduceResult => ({ state, disposition: 'ignored', note });

export function reduce(prev: AvaState, event: AvaEvent, nowMs: number): ReduceResult {
  if (prev.seenEventIds.includes(event.eventId)) {
    return { state: prev, disposition: 'duplicate' };
  }
  const s: AvaState = {
    ...prev,
    lastActivityMs: nowMs,
    seenEventIds: [...prev.seenEventIds, event.eventId].slice(-TIMING.seenEventIdCapacity)
  };

  if (!s.open && !ALWAYS_PROCESSED.has(event.type)) {
    return ignored(s, 'assistant_closed');
  }

  // These events are accepted only for the current request. Request-opening events
  // (voice input, reasoning) establish it; tool terminals and microphone/tour/speech
  // events are handled individually because they must always clear real-world state.
  if (REQUEST_GUARDED.has(event.type) && event.requestId !== s.currentRequestId) {
    return stale(s, 'request_superseded');
  }

  switch (event.type) {
    case 'ava.opened':
      if (s.open) return ignored(s, 'already_open');
      return applied({ ...s, open: true, greetStartedAtMs: nowMs });

    case 'ava.closed':
      return applied({
        ...createInitialState(),
        reducedMotion: s.reducedMotion,
        micPermission: s.micPermission,
        disabled: s.disabled,
        lastActivityMs: nowMs,
        seenEventIds: s.seenEventIds
      });

    case 'ava.disabled':
      return applied({ ...s, disabled: true });
    case 'ava.enabled':
      return applied({ ...s, disabled: false });

    case 'ava.settings.changed': {
      const { reducedMotion, micPermission } = event.payload;
      const next = { ...s };
      if (reducedMotion !== undefined) next.reducedMotion = reducedMotion;
      if (micPermission !== undefined) {
        next.micPermission = micPermission;
        if (micPermission === 'denied') next.micActive = false;
      }
      return applied(next);
    }

    case 'ava.input.started': {
      // Typing is not a request; only voice capture opens one.
      if (event.payload.modality === 'text') return ignored(s, 'text_input_not_a_request');
      // Never show a live waveform unless capture is actually permitted.
      if (s.micPermission === 'denied') return ignored(s, 'microphone_permission_denied');
      return applied({
        ...s,
        currentRequestId: event.requestId,
        greetStartedAtMs: null,
        micActive: true,
        reasoning: false,
        answering: false,
        success: null,
        warning: null
      });
    }
    case 'ava.input.ended':
      if (event.payload.modality !== 'voice') return ignored(s, 'text_input_not_a_request');
      return applied({ ...s, micActive: false });

    case 'ava.reasoning.started':
      return applied({
        ...s,
        currentRequestId: event.requestId,
        greetStartedAtMs: null,
        reasoning: true,
        answering: false,
        success: null,
        warning: null
      });
    case 'ava.reasoning.ended':
      return applied({ ...s, reasoning: false });

    case 'ava.tool.started': {
      const { callId, tool, mutating } = event.payload;
      return applied({
        ...s,
        reasoning: false,
        warning: null,
        tools: { ...s.tools, [callId]: { requestId: event.requestId, tool, mutating } }
      });
    }

    case 'ava.tool.succeeded':
    case 'ava.tool.failed':
    case 'ava.tool.timed_out': {
      const entry = s.tools[event.payload.callId];
      if (!entry) return stale(s, 'unknown_call');
      // Always clear the in-flight indicator, even for a superseded request.
      const { [event.payload.callId]: _removed, ...rest } = s.tools;
      const next: AvaState = { ...s, tools: rest };
      if (entry.requestId !== s.currentRequestId) {
        return applied(next, 'demoted_stale_request');
      }

      if (event.type === 'ava.tool.succeeded') {
        const lastForRequest = !Object.values(rest).some((t) => t.requestId === entry.requestId);
        const { backendConfirmed, completesTask } = event.payload;
        if (!backendConfirmed) return applied(next, 'not_backend_confirmed');
        if (!completesTask) return applied(next, 'intermediate_result');
        if (!lastForRequest) return applied(next, 'other_tools_in_flight');
        if (s.confirmation) return applied(next, 'confirmation_pending');
        return applied({ ...next, warning: null, success: { requestId: entry.requestId, startedAtMs: nowMs } });
      }

      const reason = event.type === 'ava.tool.timed_out' ? 'tool_timed_out' : 'tool_failed';
      return applied({
        ...next,
        success: null,
        warning: { requestId: entry.requestId, startedAtMs: nowMs, reason }
      });
    }

    case 'ava.confirmation.required':
      return applied({
        ...s,
        reasoning: false,
        confirmation: { requestId: event.requestId, actionId: event.payload.actionId, summary: event.payload.summary }
      });
    case 'ava.confirmation.accepted':
      if (s.confirmation?.actionId !== event.payload.actionId) return stale(s, 'unknown_action');
      return applied({ ...s, confirmation: null });
    case 'ava.confirmation.rejected':
      if (s.confirmation?.actionId !== event.payload.actionId) return stale(s, 'unknown_action');
      return applied({ ...s, confirmation: null, greetStartedAtMs: null, cancelStartedAtMs: nowMs });

    case 'ava.answer.started':
      return applied({ ...s, reasoning: false, answering: true, greetStartedAtMs: null });
    case 'ava.answer.ended':
      return applied({ ...s, answering: false });

    case 'ava.speech.started':
      return applied({ ...s, speaking: true });
    case 'ava.speech.ended':
      return applied({ ...s, speaking: false });

    case 'ava.tour.step': {
      const { tourId, stepId, anchorId, anchorResolved, side } = event.payload;
      return applied({
        ...s,
        greetStartedAtMs: null,
        tour: { tourId, stepId, anchorId, anchorResolved, side: side ?? 'auto' }
      });
    }
    case 'ava.tour.ended':
      return applied({ ...s, tour: null });

    case 'ava.interrupted':
      // Cancels AVA's own output. In-flight tools and pending confirmations remain true.
      return applied({
        ...s,
        speaking: false,
        answering: false,
        tour: null,
        success: null,
        warning: null,
        greetStartedAtMs: null,
        cancelStartedAtMs: event.payload.source === 'user' ? nowMs : s.cancelStartedAtMs
      });

    case 'ava.permission.denied': {
      const { scope, callId } = event.payload;
      if (scope === 'microphone') {
        return applied({
          ...s,
          micActive: false,
          micPermission: 'denied',
          warning: { requestId: null, startedAtMs: nowMs, reason: 'permission_denied_microphone' }
        });
      }
      if (event.requestId !== undefined && event.requestId !== s.currentRequestId) {
        return stale(s, 'request_superseded');
      }
      const tools = { ...s.tools };
      if (callId) delete tools[callId];
      return applied({
        ...s,
        tools,
        success: null,
        warning: { requestId: event.requestId ?? s.currentRequestId, startedAtMs: nowMs, reason: `permission_denied_${scope}` }
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export type FaceStateId =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'searching'
  | 'explaining'
  | 'guiding'
  | 'success'
  | 'warning'
  | 'confirming'
  | 'greeting'
  | 'error'
  | 'micDenied'
  | 'sleeping';

export type HeadMotion = 'listen' | 'think' | 'search' | 'confirm' | 'cancel';
export type ArmGestureKind = 'none' | 'greet' | 'explain' | 'guide' | 'success' | 'warning' | 'cancel';
export type ArmSide = 'left' | 'right' | 'both' | 'auto';
export type Announcement = 'warning' | 'confirmation_required' | 'completed';

export interface Presentation {
  visible: boolean;
  face: FaceStateId;
  overlays: { speaking: boolean; sparkle: boolean };
  head: HeadMotion | null;
  arms: { gesture: ArmGestureKind; side: ArmSide };
  hover: boolean;
  motion: 'full' | 'reduced';
  /** Present only when a tour step is active; `resolved:false` means show text, never point. */
  guide: { anchorId: string; resolved: boolean } | null;
  /** One-shot value for an aria-live region. Decorative changes are not announced. */
  announce: Announcement | null;
}

const within = (startedAtMs: number | null | undefined, durationMs: number, nowMs: number): boolean =>
  startedAtMs != null && nowMs - startedAtMs >= 0 && nowMs - startedAtMs < durationMs;

export function selectPresentation(s: AvaState, nowMs: number): Presentation {
  const motion = s.reducedMotion ? 'reduced' : 'full';
  const hidden = !s.open || s.disabled;

  const warning = within(s.warning?.startedAtMs, TIMING.warningHoldMs, nowMs);
  const success = within(s.success?.startedAtMs, TIMING.successMs, nowMs);
  const greeting = within(s.greetStartedAtMs, TIMING.greetMs, nowMs);
  const cancelling = within(s.cancelStartedAtMs, TIMING.cancelMs, nowMs);
  const listening = s.micActive && s.micPermission !== 'denied';
  const searching = Object.keys(s.tools).length > 0;
  const guiding = s.tour !== null && s.tour.anchorResolved;
  const explaining = s.answering || (s.tour !== null && !s.tour.anchorResolved);

  // Order mirrors manifest.priority.face.
  let face: FaceStateId = 'idle';
  if (warning) {
    const reason = s.warning?.reason;
    face = reason === 'tool_failed' ? 'error' : reason === 'permission_denied_microphone' ? 'micDenied' : 'warning';
  }
  else if (s.confirmation) face = 'confirming';
  else if (listening) face = 'listening';
  else if (success) face = 'success';
  else if (searching) face = 'searching';
  else if (s.reasoning) face = 'thinking';
  else if (guiding) face = 'guiding';
  else if (explaining) face = 'explaining';
  else if (greeting) face = 'greeting';
  else if (!cancelling && !s.speaking && nowMs - s.lastActivityMs >= TIMING.sleepAfterMs) face = 'sleeping';

  let head: HeadMotion | null = null;
  let arms: Presentation['arms'] = { gesture: 'none', side: 'both' };
  switch (face) {
    case 'warning':
    case 'error':
    case 'micDenied':
      arms = { gesture: 'warning', side: 'both' };
      break;
    case 'success':
      arms = { gesture: 'success', side: 'both' };
      break;
    case 'listening':
      head = 'listen';
      break;
    case 'thinking':
      head = 'think';
      break;
    case 'searching':
      head = 'search';
      break;
    case 'confirming':
      head = 'confirm';
      break;
    case 'guiding':
      arms = { gesture: 'guide', side: s.tour?.side ?? 'auto' };
      break;
    case 'explaining':
      if (s.answering) arms = { gesture: 'explain', side: 'auto' };
      break;
    case 'greeting':
      arms = { gesture: 'greet', side: 'right' };
      break;
    case 'idle':
      if (cancelling) {
        head = 'cancel';
        arms = { gesture: 'cancel', side: 'both' };
      }
      break;
  }

  if (s.reducedMotion) {
    head = null;
    arms = { gesture: 'none', side: 'both' };
  }

  const announce: Announcement | null =
    face === 'warning' || face === 'error' || face === 'micDenied' ? 'warning' : face === 'confirming' ? 'confirmation_required' : face === 'success' ? 'completed' : null;

  return {
    visible: !hidden,
    face: hidden ? 'idle' : face,
    overlays: { speaking: !hidden && s.speaking, sparkle: !hidden && face === 'success' && !s.reducedMotion },
    head: hidden ? null : head,
    arms: hidden ? { gesture: 'none', side: 'both' } : arms,
    hover: !hidden && !s.reducedMotion && face !== 'warning' && face !== 'error' && face !== 'micDenied',
    motion,
    guide: s.tour ? { anchorId: s.tour.anchorId, resolved: s.tour.anchorResolved } : null,
    announce: hidden ? null : announce
  };
}

/** Earliest time at which the presentation can change without a new event, or null. */
export function nextExpiryMs(s: AvaState, nowMs: number): number | null {
  const ends = [
    s.warning && s.warning.startedAtMs + TIMING.warningHoldMs,
    s.success && s.success.startedAtMs + TIMING.successMs,
    s.greetStartedAtMs != null ? s.greetStartedAtMs + TIMING.greetMs : null,
    s.cancelStartedAtMs != null ? s.cancelStartedAtMs + TIMING.cancelMs : null,
    s.open ? s.lastActivityMs + TIMING.sleepAfterMs : null
  ].filter((t): t is number => typeof t === 'number' && t > nowMs);
  return ends.length ? Math.min(...ends) : null;
}

// ---------------------------------------------------------------------------
// Manifest clip resolution
// ---------------------------------------------------------------------------

export function resolveClipIds(p: Presentation, autoSide: 'left' | 'right' = 'right'): string[] {
  if (!p.visible) return [];
  const ids: string[] = ['ava.idle.loop'];
  const headClips = manifest.headClips as Record<string, string>;
  if (p.head) ids.push(headClips[p.head]);

  if (p.arms.gesture !== 'none') {
    const table = (manifest.gestureClips as Record<string, Record<string, string>>)[p.arms.gesture];
    const side = p.arms.side === 'auto' ? autoSide : p.arms.side;
    const clip = table[side] ?? table.both;
    if (clip && !ids.includes(clip)) ids.push(clip);
  }
  if (p.overlays.speaking) ids.push(manifest.overlays.speaking.clip);
  return ids;
}
