import { describe, expect, it, vi } from 'vitest';
import { handleSpeak, MAX_SPEECH_CHARS, VOICE_STYLE, type SpeakDeps } from '../speakHandler';

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://x/api/ava/speak', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const deps = (over: Partial<SpeakDeps> = {}): SpeakDeps & { synthesize: ReturnType<typeof vi.fn> } => ({
  enabled: () => true,
  getActor: async () => ({ id: 'u1', role: 'agent' }),
  allow: () => true,
  synthesize: vi.fn(async () => new Response('AUDIO', { status: 200 })),
  ...over
}) as never;

describe('AVA speak endpoint', () => {
  it('speaks the text in AVA\'s style and returns audio', async () => {
    const d = deps();
    const res = await handleSpeak(req({ text: 'Hello there!', voice: 'shimmer' }), d);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(await res.text()).toBe('AUDIO');
    expect(d.synthesize).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello there!', voice: 'shimmer', instructions: VOICE_STYLE }));
  });

  it('only uses voices it knows, so a caller cannot pick another one', async () => {
    const d = deps();
    await handleSpeak(req({ text: 'Hi', voice: 'echo; drop table' }), d);
    expect(d.synthesize).toHaveBeenCalledWith(expect.objectContaining({ voice: 'coral' }));
  });

  it('needs a signed-in staff member, and is limited per person', async () => {
    expect((await handleSpeak(req({ text: 'Hi' }), deps({ getActor: async () => null }))).status).toBe(401);
    expect((await handleSpeak(req({ text: 'Hi' }), deps({ getActor: async () => ({ id: 'h1', role: 'homeowner' }) }))).status).toBe(403);
    const allow = vi.fn(() => false);
    expect((await handleSpeak(req({ text: 'Hi' }), deps({ allow }))).status).toBe(429);
    expect(allow).toHaveBeenCalledWith('speak:u1');
  });

  it('refuses empty or long texts, wrong content types and bad JSON', async () => {
    const d = deps();
    expect((await handleSpeak(req({ text: '   ' }), d)).status).toBe(400);
    expect((await handleSpeak(req({ text: 'a'.repeat(MAX_SPEECH_CHARS + 1) }), d)).status).toBe(413);
    expect((await handleSpeak(req('not json'), d)).status).toBe(400);
    expect((await handleSpeak(new Request('http://x', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' }), d)).status).toBe(415);
    expect((await handleSpeak(new Request('http://x', { method: 'GET' }), d)).status).toBe(405);
    expect(d.synthesize).not.toHaveBeenCalled();
  });

  it('says so when the voice is switched off or not set up, and when the provider fails', async () => {
    expect((await handleSpeak(req({ text: 'Hi' }), deps({ enabled: () => false }))).status).toBe(404);
    expect((await handleSpeak(req({ text: 'Hi' }), deps({ synthesize: vi.fn(async () => null) as never }))).status).toBe(503);
    expect((await handleSpeak(req({ text: 'Hi' }), deps({ synthesize: vi.fn(async () => new Response('x', { status: 500 })) as never }))).status).toBe(502);
    expect((await handleSpeak(req({ text: 'Hi' }), deps({ synthesize: vi.fn(async () => { throw new Error('boom'); }) as never }))).status).toBe(502);
  });
});
