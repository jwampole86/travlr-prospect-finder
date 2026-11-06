// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import type { AvaHost } from '../host/types';
import { applyEvent, emptyProfile, type LearnEvent, type Profile } from '../core/learning';

/** Where a person's profile lives: in this browser (the sandbox demo) or on the server (the real app). */
export interface LearningStore {
  load(): Promise<Profile>;
  record(events: LearnEvent[]): Promise<Profile | null>;
  setConsent(patch: { personalization?: boolean; sharing?: boolean }): Promise<Profile>;
  erase(): Promise<Profile>;
}

const KEY = 'ava.profile.v1';

export function createLocalStore(): LearningStore {
  const read = (): Profile => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const p = raw ? (JSON.parse(raw) as Profile) : null;
      return p && p.v === 1 ? p : emptyProfile();
    } catch { return emptyProfile(); }
  };
  const write = (p: Profile) => { try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } return p; };
  return {
    async load() { return read(); },
    async record(events) { return write(events.reduce((p, e) => applyEvent(p, e), read())); },
    async setConsent(patch) { return write({ ...read(), ...patch, updatedAt: new Date().toISOString() }); },
    async erase() { try { window.localStorage.removeItem(KEY); } catch { /* ignore */ } return emptyProfile(); },
  };
}

export function createRemoteStore(host: AvaHost): LearningStore {
  const url = (path: string) => `${host.apiBase}${path}`;
  const headers = async () => ({ 'content-type': 'application/json', ...(host.getAuthHeaders ? await host.getAuthHeaders() : {}) });
  const call = async (path: string, init: RequestInit): Promise<Profile | null> => {
    try {
      const res = await fetch(url(path), { ...init, headers: await headers(), credentials: 'same-origin' });
      if (!res.ok) return null;
      const body = (await res.json()) as { profile?: Profile };
      return body.profile ?? null;
    } catch { return null; }
  };
  return {
    async load() { return (await call('/api/ava/profile', { method: 'GET' })) ?? emptyProfile(); },
    async record(events) { return call('/api/ava/learn', { method: 'POST', body: JSON.stringify({ events }) }); },
    async setConsent(patch) { return (await call('/api/ava/profile', { method: 'PATCH', body: JSON.stringify(patch) })) ?? { ...emptyProfile(), ...patch }; },
    async erase() { return (await call('/api/ava/profile', { method: 'DELETE' })) ?? emptyProfile(); },
  };
}

const FLUSH_MS = 4000;
const FLUSH_AT = 10;

/**
 * Holds the person's profile in memory, applies each event to it straight away (so suggestions react at once), and sends events to
 * the store in small batches. Nothing is sent while personalization is off.
 */
export class LearningClient {
  profile: Profile = emptyProfile();
  private queue: LearnEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private store: LearningStore, private onChange: (p: Profile) => void) {}

  async init() { this.profile = await this.store.load(); this.onChange(this.profile); }

  record(e: LearnEvent) {
    if (!this.profile.personalization) return;
    this.profile = applyEvent(this.profile, e);
    this.onChange(this.profile);
    this.queue.push(e);
    if (this.queue.length >= FLUSH_AT) void this.flush();
    else if (!this.timer) this.timer = setTimeout(() => void this.flush(), FLUSH_MS);
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const batch = this.queue.splice(0, FLUSH_AT * 2);
    if (!batch.length) return;
    const saved = await this.store.record(batch);
    if (saved) { this.profile = saved; this.onChange(saved); }
  }

  async setConsent(patch: { personalization?: boolean; sharing?: boolean }) {
    await this.flush();
    this.profile = await this.store.setConsent(patch);
    this.onChange(this.profile);
  }

  async erase() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.queue = [];
    this.profile = await this.store.erase();
    this.onChange(this.profile);
  }
}
