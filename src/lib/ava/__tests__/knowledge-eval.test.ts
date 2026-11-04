import { describe, expect, it } from 'vitest';
import { scoreQa } from '../server/qa-eval.mjs';
import { searchEntries } from '../server/knowledge.mjs';
import { KNOWLEDGE } from '../knowledge';
import qa from '../evals/qa.json';

describe('AVA answer quality on the real in-app help content', () => {
  const result = scoreQa(KNOWLEDGE.entries, qa);

  it('is built from the app help copy and versioned', () => {
    expect(KNOWLEDGE.entries.length).toBeGreaterThan(40);
    expect(KNOWLEDGE.version).toMatch(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/);
    for (const e of KNOWLEDGE.entries) {
      expect(e.answer.length).toBeGreaterThan(20);
      expect(e.source).toBeTruthy();
    }
    expect(new Set(KNOWLEDGE.entries.map((e) => e.id)).size).toBe(KNOWLEDGE.entries.length);
  });

  it('finds the right article for at least 95% of curated supported questions', () => {
    console.log(`AVA retrieval accuracy: ${result.supportedCorrect}/${result.supported} (${(result.accuracy * 100).toFixed(1)}%); refused ${result.refused}/${result.unsupported}`);
    if (result.failures.some((f) => f.expected)) console.log('Known retrieval misses:', JSON.stringify(result.failures.filter((f) => f.expected), null, 1));
    expect(result.accuracy).toBeGreaterThanOrEqual(0.95);
  });

  it('declines unsupported questions instead of guessing', () => {
    expect(result.failures.filter((f) => !f.expected)).toEqual([]);
    expect(result.refusalRate).toBe(1);
  });

  it('declines an empty question', () => {
    expect(searchEntries(KNOWLEDGE.entries, '')).toEqual([]);
  });
});
