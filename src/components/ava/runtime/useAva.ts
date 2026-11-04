// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AvaEvent, AvaEventType } from '../core/ava-events';
import { parseAvaEvent } from '../core/ava-events';
import {
  AvaState,
  Presentation,
  ReduceResult,
  createInitialState,
  nextExpiryMs,
  reduce,
  selectPresentation
} from '../core/ava-state';

export interface LogEntry {
  at: number;
  type: string;
  requestId?: string;
  disposition: string;
  note?: string;
}

export interface AvaBus {
  /** Builds, validates and delivers one event. Application code only; never the LLM. */
  emit: (type: AvaEventType, requestId?: string, payload?: Record<string, unknown>) => ReduceResult | null;
  /** Observe accepted events (used by the orchestrator to await confirmations). */
  subscribe: (listener: (event: AvaEvent, result: ReduceResult) => void) => () => void;
  getState: () => AvaState;
}

let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}`;
export const newRequestId = () => newId('req');

export function useAva(getEventContext: () => { route: string; role?: string } = () => ({ route: window.location.pathname })) {
  const ctxRef = useRef(getEventContext);
  ctxRef.current = getEventContext;
  const stateRef = useRef<AvaState>(createInitialState());
  const listeners = useRef(new Set<(e: AvaEvent, r: ReduceResult) => void>());
  const [state, setState] = useState<AvaState>(stateRef.current);
  const [now, setNow] = useState(() => performance.now());
  const [log, setLog] = useState<LogEntry[]>([]);

  const bus = useMemo<AvaBus>(
    () => ({
      emit(type, requestId, payload = {}) {
        const event = parseAvaEvent({
          type,
          eventId: newId('evt'),
          requestId,
          timestamp: new Date().toISOString(),
          context: ctxRef.current(),
          payload
        });
        const at = performance.now();
        if (!event) {
          setLog((l) => [{ at, type, requestId, disposition: 'invalid' }, ...l].slice(0, 60));
          return null;
        }
        const result = reduce(stateRef.current, event, at);
        stateRef.current = result.state;
        setState(result.state);
        setNow(at);
        setLog((l) =>
          [{ at, type, requestId, disposition: result.disposition, note: result.note }, ...l].slice(0, 60)
        );
        listeners.current.forEach((fn) => fn(event, result));
        return result;
      },
      subscribe(fn) {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
      getState: () => stateRef.current
    }),
    []
  );

  // One timer per timed transition (success/warning/greet/cancel windows).
  useEffect(() => {
    const t = performance.now();
    const next = nextExpiryMs(state, t);
    if (next === null) return;
    const id = window.setTimeout(() => setNow(performance.now()), next - t + 5);
    return () => window.clearTimeout(id);
  }, [state, now]);

  const presentation: Presentation = useMemo(() => selectPresentation(state, now), [state, now]);
  const reset = useCallback(() => {
    stateRef.current = createInitialState();
    setState(stateRef.current);
    setLog([]);
  }, []);

  return { bus, state, presentation, log, reset };
}
