// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import manifest from './ava-animation-manifest.json';
import { AVA_EVENT_TYPES, AvaEvent, parseAvaEvent } from './ava-events';
import {
  AvaState,
  createInitialState,
  nextExpiryMs,
  reduce,
  resolveClipIds,
  selectPresentation
} from './ava-state';

let n = 0;
const ev = (type: string, requestId?: string, payload: object = {}): AvaEvent =>
  ({ type, eventId: `evt_${++n}`, requestId, timestamp: '2026-10-22T18:00:00Z', context: {}, payload }) as AvaEvent;

/** Applies events at the given times and returns the final state. */
function run(steps: Array<[number, AvaEvent]>, from: AvaState = createInitialState()): AvaState {
  return steps.reduce((s, [t, e]) => reduce(s, e, t).state, from);
}
const open = (t = 0) => run([[t, ev('ava.opened')]]);
const tool = (req: string, callId: string, mutating = false) =>
  ev('ava.tool.started', req, { tool: 'leads.search', callId, mutating });
const succeeded = (req: string, callId: string, confirmed = true, completes = true) =>
  ev('ava.tool.succeeded', req, { tool: 'leads.search', callId, backendConfirmed: confirmed, completesTask: completes });

const face = (s: AvaState, t: number) => selectPresentation(s, t).face;

test('opening greets once, then settles to idle', () => {
  const s = open(1000);
  assert.equal(selectPresentation(s, 1100).arms.gesture, 'greet');
  assert.equal(selectPresentation(s, 1000 + manifest.timing.greetMs + 1).arms.gesture, 'none');
});

test('a new request ends the greeting early and it never resumes', () => {
  const s = run([[0, ev('ava.opened')], [100, ev('ava.reasoning.started', 'r1')], [200, ev('ava.reasoning.ended', 'r1')]]);
  assert.equal(selectPresentation(s, 300).arms.gesture, 'none');
});

test('closed assistant ignores events and is invisible', () => {
  const r = reduce(createInitialState(), ev('ava.reasoning.started', 'r1'), 0);
  assert.equal(r.disposition, 'ignored');
  assert.equal(selectPresentation(r.state, 0).visible, false);
});

test('happy path: thinking -> searching -> success only after confirmed completion', () => {
  let s = open();
  s = run([[10, ev('ava.reasoning.started', 'r1')]], s);
  assert.equal(face(s, 11), 'thinking');
  s = run([[20, tool('r1', 'c1')]], s);
  assert.equal(face(s, 21), 'searching');
  s = run([[30, succeeded('r1', 'c1')]], s);
  assert.equal(face(s, 31), 'success');
  assert.equal(selectPresentation(s, 31).overlays.sparkle, true);
  assert.equal(face(s, 30 + manifest.timing.successMs), 'idle');
});

test('tool.started never produces success', () => {
  const s = run([[0, ev('ava.opened')], [1, ev('ava.reasoning.started', 'r1')], [2, tool('r1', 'c1')]]);
  assert.notEqual(face(s, 3), 'success');
});

test('unconfirmed or intermediate results never celebrate', () => {
  for (const [confirmed, completes] of [[false, true], [true, false]]) {
    const s = run([
      [0, ev('ava.opened')],
      [1, ev('ava.reasoning.started', 'r1')],
      [2, tool('r1', 'c1')],
      [3, succeeded('r1', 'c1', confirmed, completes)]
    ]);
    assert.equal(face(s, 4), 'idle');
    assert.deepEqual(s.tools, {});
  }
});

test('no celebration while another tool for the request is still running', () => {
  const s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.reasoning.started', 'r1')],
    [2, tool('r1', 'c1')],
    [3, tool('r1', 'c2')],
    [4, succeeded('r1', 'c1')]
  ]);
  assert.equal(face(s, 5), 'searching');
});

test('timeout and failure clear searching and show warning without success', () => {
  for (const [type, expected] of [['ava.tool.timed_out', 'warning'], ['ava.tool.failed', 'error']]) {
    const s = run([
      [0, ev('ava.opened')],
      [1, ev('ava.reasoning.started', 'r1')],
      [2, tool('r1', 'c1')],
      [3, ev(type, 'r1', { tool: 'leads.search', callId: 'c1' })]
    ]);
    const p = selectPresentation(s, 4);
    assert.equal(p.face, expected);
    assert.equal(p.announce, 'warning');
    assert.equal(p.hover, false);
    assert.deepEqual(s.tools, {});
    assert.equal(face(s, 3 + manifest.timing.warningHoldMs), 'idle');
  }
});

test('stale success from an earlier request cannot override a newer request', () => {
  let s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.reasoning.started', 'r1')],
    [2, tool('r1', 'c1')],
    [3, ev('ava.reasoning.started', 'r2')]
  ]);
  const r = reduce(s, succeeded('r1', 'c1'), 4);
  assert.equal(r.note, 'demoted_stale_request');
  assert.deepEqual(r.state.tools, {}); // indicator still cleared
  assert.equal(r.state.success, null);
  assert.equal(face(r.state, 5), 'thinking');
});

test('stale tool.started for a superseded request is rejected', () => {
  const s = run([[0, ev('ava.opened')], [1, ev('ava.reasoning.started', 'r2')]]);
  const r = reduce(s, tool('r1', 'c1'), 2);
  assert.equal(r.disposition, 'stale');
  assert.deepEqual(r.state.tools, {});
});

test('duplicate eventId is dropped', () => {
  const s = open();
  const e = ev('ava.reasoning.started', 'r1');
  const first = reduce(s, e, 1);
  assert.equal(reduce(first.state, e, 2).disposition, 'duplicate');
});

test('seen event ids are bounded', () => {
  let s = open();
  for (let i = 0; i < manifest.timing.seenEventIdCapacity + 50; i++) {
    s = reduce(s, ev('ava.speech.started'), i).state;
  }
  assert.equal(s.seenEventIds.length, manifest.timing.seenEventIdCapacity);
});

test('listening requires active mic and granted permission', () => {
  let s = open();
  s = run([[1, ev('ava.input.started', 'r1', { modality: 'voice' })]], s);
  assert.equal(face(s, 2), 'listening');
  assert.equal(selectPresentation(s, 2).head, 'listen');
  s = run([[3, ev('ava.input.ended', 'r1', { modality: 'voice' })]], s);
  assert.equal(face(s, 4), 'idle');
});

test('text typing does not change AVA or end a voice session', () => {
  let s = run([[0, ev('ava.opened')], [1, ev('ava.input.started', 'r1', { modality: 'voice' })]]);
  s = run([[2, ev('ava.input.ended', 'r2', { modality: 'text' })]], s);
  assert.equal(face(s, 3), 'listening');
});

test('mic permission denied: no waveform, warning shown, later voice input ignored', () => {
  let s = run([[0, ev('ava.opened')], [1, ev('ava.permission.denied', undefined, { scope: 'microphone' })]]);
  assert.equal(face(s, 2), 'micDenied');
  const r = reduce(s, ev('ava.input.started', 'r1', { modality: 'voice' }), 10_000);
  assert.equal(r.disposition, 'ignored');
  assert.notEqual(face(r.state, 10_001), 'listening');
});

test('confirmation holds until accepted or rejected; success is deferred', () => {
  let s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.reasoning.started', 'r1')],
    [2, ev('ava.confirmation.required', 'r1', { actionId: 'a1' })]
  ]);
  const p = selectPresentation(s, 100_000);
  assert.equal(p.face, 'confirming');
  assert.equal(p.announce, 'confirmation_required');
  s = run([[3, ev('ava.confirmation.rejected', 'r1', { actionId: 'a1' })]], s);
  assert.equal(face(s, 4), 'idle');
  assert.equal(selectPresentation(s, 4).arms.gesture, 'cancel');
  assert.equal(selectPresentation(s, 4 + manifest.timing.cancelMs).arms.gesture, 'none');
});

test('wrong actionId cannot resolve a confirmation', () => {
  const s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.reasoning.started', 'r1')],
    [2, ev('ava.confirmation.required', 'r1', { actionId: 'a1' })]
  ]);
  const r = reduce(s, ev('ava.confirmation.accepted', 'r1', { actionId: 'other' }), 3);
  assert.equal(r.disposition, 'stale');
  assert.equal(face(r.state, 4), 'confirming');
});

test('speaking and guiding run simultaneously', () => {
  const s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.speech.started')],
    [2, ev('ava.tour.step', undefined, { tourId: 't', stepId: 's1', anchorId: 'lead-results', anchorResolved: true, side: 'left' })]
  ]);
  const p = selectPresentation(s, 3);
  assert.equal(p.face, 'guiding');
  assert.equal(p.overlays.speaking, true);
  assert.deepEqual(p.arms, { gesture: 'guide', side: 'left' });
  assert.deepEqual(resolveClipIds(p), ['ava.idle.loop', 'ava.guide.left', 'ava.speak.loop']);
});

test('missing tour anchor: explain with fallback, never point', () => {
  const s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.tour.step', undefined, { tourId: 't', stepId: 's1', anchorId: 'gone', anchorResolved: false })]
  ]);
  const p = selectPresentation(s, 2);
  assert.equal(p.face, 'explaining');
  assert.equal(p.arms.gesture, 'none');
  assert.deepEqual(p.guide, { anchorId: 'gone', resolved: false });
});

test('interruption clears speech, gestures and tour but not real tool activity', () => {
  let s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.reasoning.started', 'r1')],
    [2, tool('r1', 'c1', true)],
    [3, ev('ava.speech.started')],
    [4, ev('ava.tour.step', undefined, { tourId: 't', stepId: 's', anchorId: 'x', anchorResolved: true })],
    [5, ev('ava.interrupted', undefined, { source: 'user' })]
  ]);
  const p = selectPresentation(s, 6);
  assert.equal(p.overlays.speaking, false);
  assert.equal(p.guide, null);
  assert.equal(p.face, 'searching'); // a mutating tool is still truly running
  assert.equal(Object.keys(s.tools).length, 1);
});

test('closing resets everything but keeps user settings', () => {
  let s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.settings.changed', undefined, { reducedMotion: true })],
    [2, ev('ava.reasoning.started', 'r1')],
    [3, tool('r1', 'c1')],
    [4, ev('ava.closed')]
  ]);
  assert.equal(s.reducedMotion, true);
  assert.deepEqual(s.tools, {});
  assert.equal(selectPresentation(s, 5).visible, false);
});

test('reduced motion removes head/arm/hover/sparkle but keeps face truth', () => {
  const s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.settings.changed', undefined, { reducedMotion: true })],
    [2, ev('ava.reasoning.started', 'r1')],
    [3, tool('r1', 'c1')],
    [4, succeeded('r1', 'c1')]
  ]);
  const p = selectPresentation(s, 5);
  assert.equal(p.face, 'success');
  assert.equal(p.motion, 'reduced');
  assert.equal(p.head, null);
  assert.equal(p.arms.gesture, 'none');
  assert.equal(p.hover, false);
  assert.equal(p.overlays.sparkle, false);
});

test('disabled hides AVA until re-enabled', () => {
  let s = run([[0, ev('ava.opened')], [1, ev('ava.disabled', undefined, { reason: 'kill-switch' })]]);
  assert.equal(selectPresentation(s, 2).visible, false);
  s = run([[3, ev('ava.enabled')]], s);
  assert.equal(selectPresentation(s, 4).visible, true);
});

test('nextExpiryMs reports the earliest timed transition', () => {
  const s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.reasoning.started', 'r1')],
    [2, tool('r1', 'c1')],
    [1000, succeeded('r1', 'c1')]
  ]);
  assert.equal(nextExpiryMs(s, 1001), 1000 + manifest.timing.successMs);
  // Only the sleep timer remains once the success window has elapsed.
  assert.equal(nextExpiryMs(s, 1000 + manifest.timing.successMs + 1), 1000 + manifest.timing.sleepAfterMs);
  assert.equal(nextExpiryMs(s, 1000 + manifest.timing.sleepAfterMs), null);
});

test('every clip id the selector can emit exists in the manifest', () => {
  const known = new Set(manifest.clips.map((c) => c.id));
  const refs = [
    ...Object.values(manifest.headClips),
    ...Object.values(manifest.gestureClips).flatMap((g) => Object.values(g)),
    manifest.overlays.speaking.clip
  ];
  for (const id of refs) assert.ok(known.has(id), `unknown clip ${id}`);
});

test('manifest face states cover every presentable face and priority list', () => {
  const ids = Object.keys(manifest.faceStates).sort();
  const ladder = manifest.priority.face.filter((f) => f !== 'disabled').sort();
  assert.deepEqual(ids, ladder);
});

test('manifest envelopes stay within the approved v1 limits', () => {
  const e = manifest.envelopes;
  assert.ok(e.headYawDeg.max <= 25 && e.shoulderDeg.max <= 45 && e.shoulderDeg.min >= -15);
  assert.ok(e.bodyYawDeg.max <= 8 && e.bodyPitchRollDeg.max <= 3);
});

test('parseAvaEvent accepts valid and rejects malformed events', () => {
  const good = { type: 'ava.tool.started', eventId: 'e1', requestId: 'r1', timestamp: 't', context: { route: '/leads' }, payload: { tool: 'x', callId: 'c', mutating: false } };
  assert.ok(parseAvaEvent(good));
  assert.equal(parseAvaEvent({ ...good, requestId: undefined }), null);
  assert.equal(parseAvaEvent({ ...good, payload: { tool: 'x', callId: 'c' } }), null);
  assert.equal(parseAvaEvent({ ...good, type: 'ava.tool.exploded' }), null);
  assert.equal(parseAvaEvent({ ...good, type: 'constructor' }), null);
  assert.equal(parseAvaEvent({ type: 'ava.interrupted', eventId: 'e', timestamp: 't', payload: { source: 'alien' } }), null);
  assert.equal(parseAvaEvent(null), null);
  assert.equal(AVA_EVENT_TYPES.length, 24);
});

test('greeting face shows only during the welcome window, then idle, then sleeping', () => {
  const s = run([[0, ev('ava.opened')]]);
  assert.equal(face(s, 10), 'greeting');
  assert.equal(selectPresentation(s, 10).arms.gesture, 'greet');
  assert.equal(face(s, manifest.timing.greetMs + 1), 'idle');
  assert.equal(face(s, manifest.timing.sleepAfterMs - 1), 'idle');
  assert.equal(face(s, manifest.timing.sleepAfterMs), 'sleeping');
  assert.equal(nextExpiryMs(s, manifest.timing.greetMs + 1), manifest.timing.sleepAfterMs);
});

test('any event wakes a sleeping AVA and restarts the sleep timer', () => {
  let s = run([[0, ev('ava.opened')]]);
  const wake = manifest.timing.sleepAfterMs + 100;
  assert.equal(face(s, wake), 'sleeping');
  s = reduce(s, ev('ava.reasoning.started', 'r1'), wake).state;
  assert.equal(face(s, wake + 1), 'thinking');
  s = reduce(s, ev('ava.reasoning.ended', 'r1'), wake + 2).state;
  assert.equal(face(s, wake + 3), 'idle');
  assert.equal(face(s, wake + 2 + manifest.timing.sleepAfterMs), 'sleeping');
});

test('AVA never sleeps while speaking, and a hidden AVA reports idle', () => {
  let s = run([[0, ev('ava.opened')], [1, ev('ava.speech.started')]]);
  assert.equal(face(s, manifest.timing.sleepAfterMs * 2), 'idle');
  s = reduce(s, ev('ava.disabled'), 5).state;
  assert.equal(face(s, manifest.timing.sleepAfterMs * 2), 'idle');
});

test('microphone denial gets its own face and never shows a waveform', () => {
  const s = run([[0, ev('ava.opened')], [1, ev('ava.permission.denied', undefined, { scope: 'microphone' })]]);
  const p = selectPresentation(s, 2);
  assert.equal(p.face, 'micDenied');
  assert.equal(p.announce, 'warning');
  assert.equal(p.hover, false);
  assert.equal(face(s, 2 + manifest.timing.warningHoldMs), 'idle');
});

test('permission denied for a tool stays the generic warning face', () => {
  const s = run([
    [0, ev('ava.opened')],
    [1, ev('ava.reasoning.started', 'r1')],
    [2, ev('ava.permission.denied', 'r1', { scope: 'tool', tool: 'leads.search' })]
  ]);
  assert.equal(face(s, 3), 'warning');
});
