import { describe, expect, it } from 'vitest';
import { BREAKER_FAILURES, BREAKER_PROBE_AFTER_MS, circuitFor, type SourcePullEvent } from './sourceCircuit';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const ev = (source: string, ok: boolean, minutesAgo: number): SourcePullEvent => ({ source, ok, at: new Date(NOW - minutesAgo * 60_000).toISOString() });
const fails = (n: number, startMinutesAgo = 10) => Array.from({ length: n }, (_, i) => ev('HotPads', false, startMinutesAgo + i * 30));

describe('circuitFor', () => {
  it('stays closed while failures are few', () => {
    expect(circuitFor(fails(BREAKER_FAILURES - 1), 'HotPads', NOW).open).toBe(false);
  });

  it('opens after enough consecutive failures and skips the source', () => {
    const c = circuitFor(fails(BREAKER_FAILURES), 'HotPads', NOW);
    expect(c).toMatchObject({ open: true, probe: false, failures: BREAKER_FAILURES });
  });

  it('is closed again by the newest success, however many failures came before it', () => {
    const events = [ev('HotPads', true, 5), ...fails(10, 40)];
    expect(circuitFor(events, 'HotPads', NOW)).toMatchObject({ open: false, failures: 0 });
  });

  it('lets one probe through once the last failure is old enough', () => {
    const old = Array.from({ length: BREAKER_FAILURES }, (_, i) => ev('HotPads', false, BREAKER_PROBE_AFTER_MS / 60_000 + 5 + i * 30));
    expect(circuitFor(old, 'HotPads', NOW)).toMatchObject({ open: true, probe: true });
  });

  it('only looks at the named source, case-insensitively', () => {
    const events = [...fails(BREAKER_FAILURES), ev('Trulia', true, 1)];
    expect(circuitFor(events, 'hotpads', NOW).open).toBe(true);
    expect(circuitFor(events, 'Trulia', NOW).open).toBe(false);
    expect(circuitFor([], 'HotPads', NOW)).toMatchObject({ open: false, lastFailureAt: null });
  });
});
