import { applyEvent, emptyProfile, parseEvent, type LearnEvent, type Profile } from '@/components/ava/core/learning';
import type { LearningStore } from './learningStore';
import { signalFor } from './learningStore';

export interface LearningDeps {
  enabled: () => boolean;
  getActor: (req: Request) => Promise<{ id: string; role: string; organizationId?: string | null } | null>;
  allow: (actorId: string) => boolean | Promise<boolean>;
  /** The store for this person (it needs their organization). */
  store: (actor: { id: string; role: string; organizationId?: string | null }) => LearningStore;
}

const STAFF = new Set(['admin', 'owner', 'agent']);
const MAX_BODY = 8 * 1024;
const MAX_EVENTS = 20;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * /api/ava/profile (GET read, PATCH consent, DELETE erase) and /api/ava/learn (POST events). A person can only ever reach their own
 * profile, nothing is learned while they have personalization off, and anonymous signals are written only if they chose to share.
 */
export async function handleLearning(req: Request, route: 'profile' | 'learn', deps: LearningDeps): Promise<Response> {
  if (!deps.enabled()) return json({ error: 'not_found' }, 404);
  const actor = await deps.getActor(req);
  if (!actor) return json({ error: 'unauthenticated' }, 401);
  if (!STAFF.has(actor.role)) return json({ error: 'forbidden' }, 403);
  if (!(await deps.allow(actor.id))) return json({ error: 'rate_limited' }, 429);

  const store = deps.store(actor);
  try {
    if (route === 'profile') {
      if (req.method === 'GET') return json({ profile: await store.get(actor.id) });
      if (req.method === 'DELETE') { await store.erase(actor.id); return json({ profile: emptyProfile() }); }
      if (req.method !== 'PATCH') return json({ error: 'method_not_allowed' }, 405);
      const body = await readBody(req);
      if (!body) return json({ error: 'bad_request' }, 400);
      const current = await store.get(actor.id);
      const next: Profile = { ...current, updatedAt: new Date().toISOString() };
      if (typeof body.personalization === 'boolean') next.personalization = body.personalization;
      if (typeof body.sharing === 'boolean') next.sharing = body.sharing;
      await store.save(actor.id, next);
      return json({ profile: next });
    }

    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const body = await readBody(req);
    if (!body || !Array.isArray(body.events)) return json({ error: 'bad_request' }, 400);
    const events = (body.events as unknown[]).slice(0, MAX_EVENTS).map(parseEvent).filter((e): e is LearnEvent => e !== null);
    const current = await store.get(actor.id);
    // Nothing is learned, and nothing is shared, while personalization is off.
    if (!current.personalization || !events.length) return json({ profile: current });
    const next = events.reduce((p, e) => applyEvent(p, e), current);
    await store.save(actor.id, next);
    if (next.sharing) await store.signals(events.map(signalFor).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ ...s, role: actor.role })));
    return json({ profile: next });
  } catch {
    return json({ error: 'failed' }, 500);
  }
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return null;
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try {
    const parsed = JSON.parse(text || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
