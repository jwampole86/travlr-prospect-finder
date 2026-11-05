/**
 * Decides whether the scheduled sync should skip a data source because its provider is down.
 *
 * A source whose last few pulls all failed is paused, so the sync stops spending minutes and request quota on calls that cannot
 * work. It is probed again after a while (one state per run), and the first success closes the circuit.
 */
export interface SourcePullEvent {
  source: string;
  ok: boolean;
  at: string;
}

export const BREAKER_FAILURES = 4;
export const BREAKER_PROBE_AFTER_MS = 3 * 60 * 60 * 1000;

export type CircuitState = { open: boolean; probe: boolean; failures: number; lastFailureAt: string | null };

/** `events` must be newest first. */
export function circuitFor(events: SourcePullEvent[], source: string, now: number): CircuitState {
  const mine = events.filter((e) => e.source.toLowerCase() === source.toLowerCase());
  let failures = 0;
  for (const e of mine) {
    if (e.ok) break;
    failures++;
  }
  if (failures < BREAKER_FAILURES) return { open: false, probe: false, failures, lastFailureAt: mine[0]?.at ?? null };
  const lastFailureAt = mine[0].at;
  const sinceLast = now - Date.parse(lastFailureAt);
  return { open: true, probe: sinceLast >= BREAKER_PROBE_AFTER_MS, failures, lastFailureAt };
}
