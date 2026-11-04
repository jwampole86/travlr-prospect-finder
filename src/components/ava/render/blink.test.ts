// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import manifest from '../core/ava-animation-manifest.json';
import { blinkScale } from './faceCanvas';

const STEP = 0.01;
const sample = (face: Parameters<typeof blinkScale>[0], seconds: number) => {
  const closed: number[] = [];
  for (let t = 0; t < seconds; t += STEP) if (blinkScale(face, t, false) < 0.5) closed.push(t);
  return closed;
};

test('blinks start 3-6 s apart (manifest interval) and only on open-eyed faces', () => {
  const [minGap, maxGap] = manifest.faceStates.idle.animation.blink.intervalMs.map((ms) => ms / 1000);
  const closed = sample('idle', 120);
  const starts = closed.filter((t, i) => i === 0 || t - closed[i - 1] > 0.3);
  assert.ok(starts.length > 15);
  assert.ok(starts[0] >= minGap - STEP && starts[0] <= maxGap + STEP);
  for (let i = 1; i < starts.length; i++) {
    // A double blink adds a second close within ~0.25 s, which the filter above merges.
    const gap = starts[i] - starts[i - 1];
    assert.ok(gap >= minGap - 0.3 && gap <= maxGap + 0.3, `gap ${gap}`);
  }
  for (const face of ['listening', 'thinking', 'searching', 'sleeping', 'error', 'micDenied'] as const) {
    assert.equal(sample(face, 30).length, 0, face);
  }
  assert.ok(sample('greeting', 30).length > 0 && sample('confirming', 30).length > 0);
  assert.equal(blinkScale('idle', starts[0] + 0.05, true), 1);
});
