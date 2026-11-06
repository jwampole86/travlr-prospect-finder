import { describe, expect, it } from 'vitest';
import { emptyProfile, type Profile } from '@/components/ava/core/learning';
import { handleLearning, type LearningDeps } from '../learningHandler';
import type { LearningStore } from '../learningStore';

function fakeStore(initial: Profile = emptyProfile('2026-11-06T10:00:00Z')) {
  const state = { profile: initial as Profile | null, signals: [] as Array<Record<string, unknown>> };
  const store: LearningStore = {
    async get() { return state.profile ?? emptyProfile('2026-11-06T10:00:00Z'); },
    async save(_u, p) { state.profile = p; },
    async erase() { state.profile = null; },
    async signals(rows) { state.signals.push(...rows); },
  };
  return { state, store };
}
const deps = (store: LearningStore, over: Partial<LearningDeps> = {}): LearningDeps => ({ enabled: () => true, getActor: async () => ({ id: 'u1', role: 'agent' }), allow: () => true, store: () => store, ...over });
const req = (method: string, body?: unknown, path = 'profile') => new Request(`http://x/api/ava/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('learning endpoints', () => {
  it('are off, closed to signed-out people and homeowners, and rate limited', async () => {
    const { store } = fakeStore();
    expect((await handleLearning(req('GET'), 'profile', deps(store, { enabled: () => false }))).status).toBe(404);
    expect((await handleLearning(req('GET'), 'profile', deps(store, { getActor: async () => null }))).status).toBe(401);
    expect((await handleLearning(req('GET'), 'profile', deps(store, { getActor: async () => ({ id: 'h', role: 'homeowner' }) }))).status).toBe(403);
    expect((await handleLearning(req('GET'), 'profile', deps(store, { allow: () => false }))).status).toBe(429);
  });

  it('learns from valid events and drops invalid ones, keeping nothing but ids and counts', async () => {
    const { state, store } = fakeStore();
    const res = await handleLearning(req('POST', { events: [
      { kind: 'tour_completed', tourId: 'lead-filters' },
      { kind: 'question', topic: 'lead-verification', text: 'my secret', userId: 'someone-else' },
      { kind: 'transcript', text: 'what I said' },
      { kind: 'page_opened', page: '../etc' },
    ] }, 'learn'), 'learn', deps(store));
    expect(res.status).toBe(200);
    expect(state.profile!.tours['lead-filters'].done).toBe(1);
    expect(state.profile!.topics['lead-verification'].asked).toBe(1);
    expect(Object.keys(state.profile!.pages)).toHaveLength(0);
    expect(JSON.stringify(state.profile)).not.toMatch(/secret|said|someone-else/);
  });

  it('learns nothing, and shares nothing, while personalization is off', async () => {
    const { state, store } = fakeStore({ ...emptyProfile('2026-11-06T10:00:00Z'), personalization: false, sharing: true });
    await handleLearning(req('POST', { events: [{ kind: 'page_opened', page: 'pipeline' }] }, 'learn'), 'learn', deps(store));
    expect(state.profile!.pages).toEqual({});
    expect(state.signals).toEqual([]);
  });

  it('shares anonymous signals only when the person chose to, with no user id and no personal habits', async () => {
    const off = fakeStore();
    await handleLearning(req('POST', { events: [{ kind: 'page_opened', page: 'pipeline' }] }, 'learn'), 'learn', deps(off.store));
    expect(off.state.signals).toEqual([]);

    const on = fakeStore({ ...emptyProfile('2026-11-06T10:00:00Z'), sharing: true });
    await handleLearning(req('POST', { events: [
      { kind: 'page_opened', page: 'pipeline' }, { kind: 'input', modality: 'voice' }, { kind: 'wake_used' },
      { kind: 'feedback', rating: -1, topic: 'lead-verification', reason: 'too_long' },
    ] }, 'learn'), 'learn', deps(on.store));
    expect(on.state.signals).toEqual([
      { kind: 'page_opened', key: 'pipeline', role: 'agent' },
      { kind: 'feedback', key: 'lead-verification', rating: -1, reason: 'too_long', role: 'agent' },
    ]);
    for (const row of on.state.signals) expect(Object.keys(row)).not.toContain('user_id');
  });

  it('lets a person change their consent, and only with real booleans', async () => {
    const { state, store } = fakeStore();
    await handleLearning(req('PATCH', { sharing: true }), 'profile', deps(store));
    expect(state.profile!.sharing).toBe(true);
    await handleLearning(req('PATCH', { personalization: 'yes', sharing: 'no' }), 'profile', deps(store));
    expect(state.profile).toMatchObject({ personalization: true, sharing: true });
    await handleLearning(req('PATCH', { personalization: false }), 'profile', deps(store));
    expect(state.profile!.personalization).toBe(false);
  });

  it('lets a person erase what AVA has learned', async () => {
    const { state, store } = fakeStore();
    await handleLearning(req('POST', { events: [{ kind: 'page_opened', page: 'pipeline' }] }, 'learn'), 'learn', deps(store));
    expect(state.profile).not.toBeNull();
    const res = await handleLearning(req('DELETE'), 'profile', deps(store));
    expect(state.profile).toBeNull();
    expect((await res.json()).profile.pages).toEqual({});
  });

  it('always works on the signed-in person only: a user id in the request changes nothing', async () => {
    const { state, store } = fakeStore();
    const seen: string[] = [];
    const spy: LearningStore = { ...store, async save(u, p) { seen.push(u); await store.save(u, p); } };
    await handleLearning(new Request('http://x/api/ava/learn?userId=victim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'victim', events: [{ kind: 'page_opened', page: 'pipeline' }] }) }), 'learn', deps(spy));
    expect(seen).toEqual(['u1']);
    expect(state.profile!.pages.pipeline.n).toBe(1);
  });

  it('refuses oversized or malformed bodies', async () => {
    const { store } = fakeStore();
    expect((await handleLearning(new Request('http://x/api/ava/learn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' }), 'learn', deps(store))).status).toBe(400);
    expect((await handleLearning(new Request('http://x/api/ava/learn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: [], pad: 'x'.repeat(9000) }) }), 'learn', deps(store))).status).toBe(400);
    expect((await handleLearning(new Request('http://x/api/ava/learn', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }), 'learn', deps(store))).status).toBe(400);
  });
});
