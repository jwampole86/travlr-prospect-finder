import { STAFF_ROLES, type AvaHandlerActor } from './handler';

/** The voices AVA may use. Anything else falls back to the default, so the endpoint cannot be pointed at another voice or model. */
export const AVA_VOICES = ['coral', 'shimmer', 'nova', 'sage', 'ballad'] as const;
export const DEFAULT_VOICE = 'coral';
export const MAX_SPEECH_CHARS = 400;

/** How AVA sounds: the same character as her written replies. */
export const VOICE_STYLE =
  "You are AVA, a friendly guide inside a business app. Sound warm, bright and genuinely happy to help, with a smile in your voice and a touch of playful lightness, like a good colleague who enjoys their job. Light, short moments of amusement are welcome, but never silly or over the top. Stay professional, clear and unhurried. Speak at a natural conversational pace and lift your tone slightly on questions and on encouraging words. Do not read out symbols or punctuation.";

export interface SpeakDeps {
  enabled: () => boolean;
  getActor: (req: Request) => Promise<AvaHandlerActor | null>;
  allow: (key: string) => boolean | Promise<boolean>;
  /** Returns the spoken audio for the text, or null when the voice service is not set up. */
  synthesize: (args: { text: string; voice: string; instructions: string; signal: AbortSignal }) => Promise<Response | null>;
}

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

/** POST /api/ava/speak { text, voice? } -> audio/mpeg. Signed-in staff only, rate limited, short texts only. */
export async function handleSpeak(req: Request, deps: SpeakDeps): Promise<Response> {
  if (!deps.enabled()) return json({ error: 'not_found' }, 404);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  const actor = await deps.getActor(req);
  if (!actor) return json({ error: 'unauthenticated' }, 401);
  if (!STAFF_ROLES.has(actor.role)) return json({ error: 'forbidden' }, 403);
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return json({ error: 'unsupported_media_type' }, 415);
  if (Number(req.headers.get('content-length') ?? 0) > 4096) return json({ error: 'too_large' }, 413);
  if (!(await deps.allow(`speak:${actor.id}`))) return json({ error: 'rate_limited' }, 429, { 'retry-after': '20' });

  let body: { text?: unknown; voice?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: 'too_large' }, 413);
    body = JSON.parse(raw || '{}');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!text) return json({ error: 'bad_request' }, 400);
  if (text.length > MAX_SPEECH_CHARS) return json({ error: 'too_large' }, 413);
  const voice = (AVA_VOICES as readonly string[]).includes(body.voice as string) ? (body.voice as string) : DEFAULT_VOICE;

  let audio: Response | null;
  try {
    audio = await deps.synthesize({ text, voice, instructions: VOICE_STYLE, signal: AbortSignal.any([req.signal, AbortSignal.timeout(20_000)]) });
  } catch {
    return json({ error: 'voice_failed' }, 502);
  }
  if (!audio) return json({ error: 'voice_not_configured' }, 503);
  if (!audio.ok || !audio.body) return json({ error: 'voice_failed' }, 502);
  return new Response(audio.body, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
