// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { describe, expect, it } from 'vitest';
import { describeSources, relativeTime } from './freshness';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('relativeTime', () => {
  it('formats recent and old times, never the future', () => {
    expect(relativeTime(ago(10_000), NOW)).toBe('just now');
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe('5 min ago');
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe('3 hours ago');
    expect(relativeTime(ago(1 * 3_600_000), NOW)).toBe('1 hour ago');
    expect(relativeTime(ago(5 * 86_400_000), NOW)).toBe('5 days ago');
    expect(relativeTime(new Date(NOW + 60_000).toISOString(), NOW)).toBe('just now');
    expect(relativeTime('nonsense', NOW)).toBeNull();
    expect(relativeTime(undefined, NOW)).toBeNull();
  });
});

describe('describeSources', () => {
  it('shows live lead data with its freshness', () => {
    const [line] = describeSources([{ kind: 'leads', label: 'AVYRO leads', live: true, count: 5, asOf: ago(20_000), newestRecordAt: ago(3 * 3_600_000) }], NOW);
    expect(line).toBe('AVYRO leads · 5 results · newest record updated 3 hours ago · checked just now');
  });
  it('labels sample data as not live', () => {
    const [line] = describeSources([{ kind: 'leads', label: 'Sample leads', live: false, count: 1 }], NOW);
    expect(line).toBe('Sample leads · 1 result · sample data, not live');
  });
  it('cites help articles with their version', () => {
    const [line] = describeSources([{ kind: 'knowledge', label: 'Approved help', live: true, version: '2026.10', citations: ['Help: Lead verification'] }], NOW);
    expect(line).toBe('Help: Lead verification · approved help 2026.10');
  });
  it('returns nothing when no data was used', () => {
    expect(describeSources(undefined)).toEqual([]);
    expect(describeSources([])).toEqual([]);
  });
});
