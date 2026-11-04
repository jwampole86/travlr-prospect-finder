// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/**
 * AVA event contract (spec v2). Events are emitted by application code after
 * validation, never by the LLM's free text. See spec section 7.
 */

export interface AvaContext {
  route?: string;
  role?: string;
}

interface EventBase<T extends string, P> {
  type: T;
  /** Unique per event; duplicates are dropped. */
  eventId: string;
  /** ISO-8601, informational only. The reducer uses the client receive time. */
  timestamp: string;
  context: AvaContext;
  payload: P;
}

type Scoped<T extends string, P> = EventBase<T, P> & { requestId: string };
type Unscoped<T extends string, P> = EventBase<T, P> & { requestId?: string };

export type Side = 'left' | 'right' | 'auto';
export type MicPermission = 'unknown' | 'granted' | 'denied';

export type AvaEvent =
  | Unscoped<'ava.opened', Record<string, never>>
  | Unscoped<'ava.closed', Record<string, never>>
  | Unscoped<'ava.disabled', { reason: string }>
  | Unscoped<'ava.enabled', Record<string, never>>
  | Unscoped<'ava.settings.changed', { reducedMotion?: boolean; micPermission?: MicPermission }>
  | Scoped<'ava.input.started', { modality: 'voice' | 'text' }>
  | Scoped<'ava.input.ended', { modality: 'voice' | 'text' }>
  | Scoped<'ava.reasoning.started', Record<string, never>>
  | Scoped<'ava.reasoning.ended', Record<string, never>>
  | Scoped<'ava.tool.started', { tool: string; callId: string; mutating: boolean; uiTarget?: string }>
  | Scoped<
      'ava.tool.succeeded',
      { tool: string; callId: string; backendConfirmed: boolean; completesTask: boolean }
    >
  | Scoped<'ava.tool.failed', { tool: string; callId: string; reason?: 'error' | 'denied' | 'blocked' }>
  | Scoped<'ava.tool.timed_out', { tool: string; callId: string }>
  | Scoped<'ava.confirmation.required', { actionId: string; summary?: string }>
  | Scoped<'ava.confirmation.accepted', { actionId: string }>
  | Scoped<'ava.confirmation.rejected', { actionId: string }>
  | Scoped<'ava.answer.started', Record<string, never>>
  | Scoped<'ava.answer.ended', Record<string, never>>
  | Unscoped<'ava.speech.started', Record<string, never>>
  | Unscoped<'ava.speech.ended', Record<string, never>>
  | Unscoped<
      'ava.tour.step',
      { tourId: string; stepId: string; anchorId: string; anchorResolved: boolean; side?: Side }
    >
  | Unscoped<'ava.tour.ended', { tourId: string }>
  | Unscoped<'ava.interrupted', { source: 'user' | 'system' }>
  | Unscoped<
      'ava.permission.denied',
      { scope: 'microphone' | 'tool' | 'action'; tool?: string; callId?: string }
    >;

export type AvaEventType = AvaEvent['type'];

type FieldRule = { kind: 'string' | 'boolean'; optional?: boolean; oneOf?: readonly string[] };

const str: FieldRule = { kind: 'string' };
const bool: FieldRule = { kind: 'boolean' };
const optStr: FieldRule = { kind: 'string', optional: true };
const optBool: FieldRule = { kind: 'boolean', optional: true };
const oneOf = (values: readonly string[], optional = false): FieldRule => ({
  kind: 'string',
  oneOf: values,
  optional
});

interface EventRule {
  requestId: boolean;
  payload: Record<string, FieldRule>;
}

const RULES: Record<AvaEventType, EventRule> = {
  'ava.opened': { requestId: false, payload: {} },
  'ava.closed': { requestId: false, payload: {} },
  'ava.disabled': { requestId: false, payload: { reason: str } },
  'ava.enabled': { requestId: false, payload: {} },
  'ava.settings.changed': {
    requestId: false,
    payload: { reducedMotion: optBool, micPermission: oneOf(['unknown', 'granted', 'denied'], true) }
  },
  'ava.input.started': { requestId: true, payload: { modality: oneOf(['voice', 'text']) } },
  'ava.input.ended': { requestId: true, payload: { modality: oneOf(['voice', 'text']) } },
  'ava.reasoning.started': { requestId: true, payload: {} },
  'ava.reasoning.ended': { requestId: true, payload: {} },
  'ava.tool.started': {
    requestId: true,
    payload: { tool: str, callId: str, mutating: bool, uiTarget: optStr }
  },
  'ava.tool.succeeded': {
    requestId: true,
    payload: { tool: str, callId: str, backendConfirmed: bool, completesTask: bool }
  },
  'ava.tool.failed': {
    requestId: true,
    payload: { tool: str, callId: str, reason: oneOf(['error', 'denied', 'blocked'], true) }
  },
  'ava.tool.timed_out': { requestId: true, payload: { tool: str, callId: str } },
  'ava.confirmation.required': { requestId: true, payload: { actionId: str, summary: optStr } },
  'ava.confirmation.accepted': { requestId: true, payload: { actionId: str } },
  'ava.confirmation.rejected': { requestId: true, payload: { actionId: str } },
  'ava.answer.started': { requestId: true, payload: {} },
  'ava.answer.ended': { requestId: true, payload: {} },
  'ava.speech.started': { requestId: false, payload: {} },
  'ava.speech.ended': { requestId: false, payload: {} },
  'ava.tour.step': {
    requestId: false,
    payload: {
      tourId: str,
      stepId: str,
      anchorId: str,
      anchorResolved: bool,
      side: oneOf(['left', 'right', 'auto'], true)
    }
  },
  'ava.tour.ended': { requestId: false, payload: { tourId: str } },
  'ava.interrupted': { requestId: false, payload: { source: oneOf(['user', 'system']) } },
  'ava.permission.denied': {
    requestId: false,
    payload: { scope: oneOf(['microphone', 'tool', 'action']), tool: optStr, callId: optStr }
  }
};

export const AVA_EVENT_TYPES = Object.keys(RULES) as AvaEventType[];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function fieldOk(value: unknown, rule: FieldRule): boolean {
  if (value === undefined) return rule.optional === true;
  if (typeof value !== rule.kind) return false;
  return !rule.oneOf || rule.oneOf.includes(value as string);
}

/** Validates an untrusted object. Returns null when it is not a well-formed AVA event. */
export function parseAvaEvent(input: unknown): AvaEvent | null {
  if (!isRecord(input)) return null;
  const { type, eventId, timestamp, requestId, payload } = input;
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(RULES, type)) return null;
  if (typeof eventId !== 'string' || eventId === '') return null;
  if (typeof timestamp !== 'string') return null;

  const rule = RULES[type as AvaEventType];
  if (rule.requestId) {
    if (typeof requestId !== 'string' || requestId === '') return null;
  } else if (requestId !== undefined && typeof requestId !== 'string') {
    return null;
  }

  const body = payload === undefined ? {} : payload;
  if (!isRecord(body)) return null;
  for (const [key, fieldRule] of Object.entries(rule.payload)) {
    if (!fieldOk(body[key], fieldRule)) return null;
  }

  const context = isRecord(input.context) ? (input.context as AvaContext) : {};
  return { ...(input as object), context, payload: body } as AvaEvent;
}
