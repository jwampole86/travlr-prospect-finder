/** Framework-light request handling for /api/ava/turn and /api/ava/confirm. All collaborators are injected so it can be tested. */
export interface AvaHandlerActor { id: string; role: string }

interface Gateway {
  turn: (args: { messages: unknown; context: unknown; signal: AbortSignal; actor: AvaHandlerActor }, emit: (line: object) => void) => Promise<unknown>;
  confirm: (args: { actionId: unknown; decision: unknown; context: unknown; actor: AvaHandlerActor }, emit: (line: object) => void) => Promise<unknown>;
}

export interface AvaHandlerDeps {
  enabled: () => boolean;
  /** The signed-in user with a role already mapped to AVA's roles, or null when there is no valid session. */
  getActor: (req: Request) => Promise<AvaHandlerActor | null>;
  hasLlm: () => boolean;
  makeGateway: (req: Request, actor: AvaHandlerActor) => Gateway;
  /** Returns false when this user has made too many requests. */
  allow: (actorId: string) => boolean;
}

export const STAFF_ROLES = new Set(['admin', 'owner', 'agent']);
const MAX_BODY = 32 * 1024;

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

export async function handleAva(req: Request, kind: 'turn' | 'confirm', deps: AvaHandlerDeps): Promise<Response> {
  if (!deps.enabled()) return json({ error: 'not_found' }, 404);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });

  const actor = await deps.getActor(req);
  if (!actor) return json({ error: 'unauthenticated' }, 401);
  if (!STAFF_ROLES.has(actor.role)) return json({ error: 'forbidden' }, 403);

  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return json({ error: 'unsupported_media_type' }, 415);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return json({ error: 'too_large' }, 413);
  if (!deps.allow(actor.id)) return json({ error: 'rate_limited' }, 429, { 'retry-after': '30' });

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    const parsed = JSON.parse(text || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  // The client falls back (or explains) when the brain is not configured, so say so before streaming.
  if (kind === 'turn' && !deps.hasLlm()) return json({ error: 'llm_not_configured' }, 503);

  const gateway = deps.makeGateway(req, actor);
  const controller = new AbortController();
  req.signal?.addEventListener('abort', () => controller.abort());
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(out) {
      const emit = (line: object) => { try { out.enqueue(enc.encode(JSON.stringify(line) + '\n')); } catch { /* client went away */ } };
      try {
        if (kind === 'turn') await gateway.turn({ messages: body.messages, context: body.context, signal: controller.signal, actor }, emit);
        else await gateway.confirm({ actionId: body.actionId, decision: body.decision, context: body.context, actor }, emit);
      } catch {
        if (!controller.signal.aborted) emit({ t: 'error', code: 'brain_failed' });
      }
      emit({ t: 'done' });
      try { out.close(); } catch { /* already closed */ }
    },
    cancel() { controller.abort(); }
  });

  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

/** Best-effort per-instance limiter (serverless instances do not share memory); the LLM provider's own limits are the backstop. */
export function createRateLimiter(max = 20, windowMs = 60_000, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (id: string) => {
    const t = now();
    const recent = (hits.get(id) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) { hits.set(id, recent); return false; }
    recent.push(t);
    hits.set(id, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (v.every((x) => t - x >= windowMs)) hits.delete(k);
    return true;
  };
}
