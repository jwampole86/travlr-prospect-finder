import type { LearnEvent, Profile } from '@/components/ava/core/learning';
import { emptyProfile } from '@/components/ava/core/learning';
import type { AvaDb } from './travlrBackend';

/** Reads and writes one person's learning profile and, for people who chose to share, the anonymous signals. */
export interface LearningStore {
  get(userId: string): Promise<Profile>;
  save(userId: string, profile: Profile): Promise<void>;
  erase(userId: string): Promise<void>;
  /** Anonymous: no user id. Only called for people who turned sharing on. */
  signals(rows: Array<{ role: string; kind: string; key: string | null; rating?: number; reason?: string }>): Promise<void>;
}

const isProfile = (p: unknown): p is Profile => !!p && typeof p === 'object' && (p as Profile).v === 1 && typeof (p as Profile).personalization === 'boolean';

export function createLearningStore(db: AvaDb, organizationId: string | null | undefined): LearningStore {
  return {
    async get(userId) {
      const { data } = await db.from('ava_user_profiles').select('profile').eq('user_id', userId).maybeSingle();
      return isProfile(data?.profile) ? data.profile : emptyProfile();
    },
    async save(userId, profile) {
      const org = organizationId;
      const { error } = await db.from('ava_user_profiles').upsert({ user_id: userId, ...(org ? { organization_id: org } : {}), profile, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
    },
    async erase(userId) {
      const { error } = await db.from('ava_user_profiles').delete().eq('user_id', userId);
      if (error) throw new Error(error.message);
    },
    async signals(rows) {
      if (!rows.length) return;
      const org = organizationId;
      const { error } = await db.from('ava_usage_signals').insert(rows.map((r) => ({ ...(org ? { organization_id: org } : {}), role: r.role, kind: r.kind, key: r.key, rating: r.rating ?? null, reason: r.reason ?? null })));
      if (error) console.warn('[ava learning] signals not stored:', error.message);
    },
  };
}

/** The anonymous signal (if any) an event produces. Carries an id and a count of one, never any text. */
export function signalFor(e: LearnEvent): { kind: string; key: string | null; rating?: number; reason?: string } | null {
  switch (e.kind) {
    case 'tour_completed': case 'tour_stopped': return { kind: e.kind, key: e.tourId };
    case 'page_opened': return { kind: 'page_opened', key: e.page };
    case 'tool_used': return { kind: 'tool_used', key: e.tool };
    case 'question': return e.topic ? { kind: 'question', key: e.topic } : null;
    case 'feedback': return { kind: 'feedback', key: e.topic, rating: e.rating, ...(e.reason ? { reason: e.reason } : {}) };
    default: return null; // input habits and the wake word are personal to the person and are not shared
  }
}
