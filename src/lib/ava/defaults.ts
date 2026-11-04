import 'server-only';
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createGateway } from './server/gateway.mjs';
import { createLlm } from './server/llm.mjs';
import { createCombinedAudit } from './combinedAudit';
import { createSupabaseAudit } from './auditSink';
import { createSignedPendingStore } from './pendingStore';
import { createTravlrBackend } from './travlrBackend';
import { createRateLimiter } from './handler';
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

async function getActor(req: Request): Promise<AvaHandlerActor | null> {
  // getApiActor only reads headers/cookies, which a standard Request provides.
  const actor = await getApiActor(req as NextRequest);
  if (!actor) return null;
  const role = actor.role === 'owner' ? 'owner' : actor.isAdmin ? 'admin' : actor.role === 'agent' ? 'agent' : actor.role;
  return { id: actor.user.id, role };
}

const allow = createRateLimiter();

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
      void actor;
      return createGateway({
        llm: createLlm(llmEnv()),
        backend: createTravlrBackend({ db, origin: new URL(req.url).origin, forwardHeaders: headers }),
        audit: createCombinedAudit(createSupabaseAudit(db)),
        pending: createSignedPendingStore({ db, secret: confirmSecret() })
      });
    }
  };
}
