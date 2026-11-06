// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { describe, expect, it } from 'vitest';
import { briefingDue, clampPosition, dayKey, defaultLayout, parseLayout } from './layout';

describe('layout preferences', () => {
  it('starts with AVA in her usual place, the briefing on and focus mode off', () => {
    expect(parseLayout(null)).toEqual({ hidden: false, focus: false, briefing: true });
  });

  it('reads back what was saved and ignores anything odd', () => {
    expect(parseLayout(JSON.stringify({ right: 40.4, bottom: 90, hidden: true, focus: true, briefing: false, briefedOn: '2026-11-06' })))
      .toEqual({ right: 40, bottom: 90, hidden: true, focus: true, briefing: false, briefedOn: '2026-11-06' });
    expect(parseLayout('not json')).toEqual(defaultLayout());
    expect(parseLayout(JSON.stringify({ right: 'far', bottom: 1e9, briefedOn: '<script>' }))).toEqual(defaultLayout());
    expect(parseLayout(JSON.stringify({ right: 20 }))).toEqual(defaultLayout()); // half a position is no position
  });
});

describe('clampPosition', () => {
  const box = { w: 600, h: 500 };
  const view = { w: 1200, h: 800 };
  it('leaves a position that fits alone', () => {
    expect(clampPosition({ right: 100, bottom: 100 }, box, view)).toEqual({ right: 100, bottom: 100 });
  });
  it('keeps her whole window on screen on every side', () => {
    expect(clampPosition({ right: -300, bottom: -50 }, box, view)).toEqual({ right: 8, bottom: 8 });
    expect(clampPosition({ right: 5000, bottom: 5000 }, box, view)).toEqual({ right: 1200 - 600 - 8, bottom: 800 - 500 - 8 });
  });
  it('copes with a screen smaller than her window', () => {
    expect(clampPosition({ right: 300, bottom: 300 }, box, { w: 400, h: 300 })).toEqual({ right: 8, bottom: 8 });
  });
});

describe('briefingDue', () => {
  const today = '2026-11-06';
  it('is due once a day', () => {
    expect(briefingDue({ ...defaultLayout() }, today)).toBe(true);
    expect(briefingDue({ ...defaultLayout(), briefedOn: today }, today)).toBe(false);
    expect(briefingDue({ ...defaultLayout(), briefedOn: '2026-11-05' }, today)).toBe(true);
  });
  it('stays quiet when switched off, in focus mode or hidden', () => {
    expect(briefingDue({ ...defaultLayout(), briefing: false }, today)).toBe(false);
    expect(briefingDue({ ...defaultLayout(), focus: true }, today)).toBe(false);
    expect(briefingDue({ ...defaultLayout(), hidden: true }, today)).toBe(false);
  });
  it('formats the local day', () => {
    expect(dayKey(new Date(2026, 10, 6, 23, 59))).toBe('2026-11-06');
  });
});
