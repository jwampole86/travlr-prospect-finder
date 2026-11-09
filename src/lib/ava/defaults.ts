import 'server-only';
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createGateway } from './server/gateway.mjs';
import { createLlm } from './server/llm.mjs';
import { selectEntries } from './server/selector.mjs';
import { createCombinedAudit } from './combinedAudit';
import { createSupabaseAudit } from './auditSink';
import { createSignedPendingStore } from './pendingStore';
import { createTravlrBackend } from './travlrBackend';
import { createRateLimiter } from './handler';
import { createLearningStore } from './learningStore';
import type { LearningDeps } from './learningHandler';
import { anonymousTopic, buildVocabulary, personalizationNote } from '@/components/ava/core/learning';
import { KNOWLEDGE } from './knowledge';
import type { AvaHandlerActor, AvaHandlerDeps } from './handler';

/** AVA is on unless AVA_ENABLED=false is set on the server (the kill switch). */
export const avaEnabled = () => process.env.AVA_ENABLED !== 'false';

const llmEnv = () => ({
  AVA_LLM_API_KEY: process.env.AVA_LLM_API_KEY || process.env.OPENAI_API_KEY,
  AVA_LLM_BASE_URL: process.env.AVA_LLM_BASE_URL,
  AVA_LLM_MODEL: process.env.AVA_LLM_MODEL
});

/** Signing secret for confirmation tokens: dedicated if set, otherwise derived from the server-only service key. */
function confirmSecret() {
  const explicit = process.env.AVA_CONFIRM_SECRET;
  if (explicit) return explicit;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createHash('sha256').update(`ava-confirm-v1:${key}`).digest('hex') : '';
}

async function getActor(req: Request): Promise<(AvaHandlerActor & { organizationId?: string | null }) | null> {
  // getApiActor only reads headers/cookies, which a standard Request provides.
  const actor = await getApiActor(req as NextRequest);
  if (!actor) return null;
  const role = actor.role === 'owner' ? 'owner' : actor.isAdmin ? 'admin' : actor.role === 'agent' ? 'agent' : actor.role;
  return { id: actor.user.id, role, organizationId: actor.organizationId ?? null };
}

const allow = createRateLimiter();

// The only words an unanswered question can be reduced to: the product's own vocabulary (help articles, screens, features).
const vocabulary = buildVocabulary(KNOWLEDGE.entries.flatMap((e) => [e.title, e.source, ...(e.keywords ?? [])]));

export function learningDeps(): LearningDeps {
  return {
    enabled: avaEnabled,
    getActor,
    allow,
    store: (actor) => createLearningStore(getSupabaseAdmin(), actor.organizationId),
  };
}

export function avaDeps(): AvaHandlerDeps {
  return {
    enabled: avaEnabled,
    getActor,
    hasLlm: () => !!llmEnv().AVA_LLM_API_KEY,
    allow,
    makeGateway(req, actor) {
      const db = getSupabaseAdmin();
      const headers: Record<string, string> = {};
      const cookie = req.headers.get('cookie');
      const authorization = req.headers.get('authorization');
      if (cookie) headers.cookie = cookie;
      if (authorization) headers.authorization = authorization;
      const learning = createLearningStore(db, (actor as { organizationId?: string | null }).organizationId);
      const llm = createLlm(llmEnv());
      return createGateway({
        llm,
        backend: createTravlrBackend({
          db, origin: new URL(req.url).origin, forwardHeaders: headers,
          selectKnowledge: (entries, query, signal) => selectEntries({ llm: llm as never, entries, query, signal }) as never
        }),
        audit: createCombinedAudit(createSupabaseAudit(db)),
        pending: createSignedPendingStore({ db, secret: confirmSecret() }),
        // Tailor tone and depth to this person, from their own profile (ids and counts only). Off when they turned personalization off.
        personalize: async (a: object) => personalizationNote(await learning.get((a as { id: string }).id)),
        // For people who chose to share: count which help topics AVA could not answer, reduced to product words (no names, numbers or text).
        onUnanswered: async (a: object, query: string) => {
          const profile = await learning.get((a as { id: string }).id);
          if (!profile.sharing) return;
          const topic = anonymousTopic(String(query ?? ''), vocabulary);
          const org = (actor as { organizationId?: string | null }).organizationId;
          if (topic && org) await db.rpc('ava_count_unanswered', { p_org: org, p_key: topic });
        }
      });
    }
  };
}
