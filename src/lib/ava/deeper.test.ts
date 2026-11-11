import { describe, expect, it, vi } from 'vitest';
import { askClaude, buildPrompt, plain, cleanQuestion, deeperEnabled, handleDeeper, handleDeeperFeedback, keywordsFor, pickExamples, scrub, SENSITIVE, topicTags, type DeeperDeps, type DeeperRow } from './deeper';

const req = (body: unknown, headers: Record<string, string> = {}) => new Request('http://x/api/ava/deeper', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

function deps(over: Partial<DeeperDeps> = {}) {
  const rows: DeeperRow[] = [];
  const d: DeeperDeps = {
    enabled: () => true,
    getActor: async () => ({ id: 'u1', role: 'agent', organizationId: 'org1' }),
    allow: () => true,
    store: {
      insert: async (r) => { rows.push(r); return '00000000-0000-0000-0000-000000000001'; },
      pastHelpful: async () => [],
      todayCount: async () => 0,
      setFeedback: async () => true,
    },
    ask: async () => ({ answer: 'A general answer.', model: 'm', inputTokens: 10, outputTokens: 20 }),
    dailyCap: () => 100,
    ...over,
  };
  return { d, rows };
}

describe('scrub and cleanQuestion', () => {
  it('removes emails, phone numbers and long numbers before anything leaves AVYRO', () => {
    const s = scrub('Call Pat at (702) 555-0142 or pat@example.com about 123456789012, ssn 123-45-6789');
    expect(s).not.toMatch(/555|example\.com|123456789012|123-45-6789/);
    expect(s).toContain('[email removed]');
  });
  it('rejects empty or too-short questions and caps the length', () => {
    expect(cleanQuestion('hi')).toBeNull();
    expect(cleanQuestion(42)).toBeNull();
    expect(cleanQuestion('x'.repeat(2000))?.length).toBe(500);
  });
});

describe('topics, review flag and examples', () => {
  it('tags topics and flags legal, fee and compliance questions for a person', () => {
    expect(topicTags('How do vacation home valuations and comps work?')).toContain('valuation');
    expect(topicTags('weather')).toEqual(['other']);
    expect(SENSITIVE.test('Can we charge a referral fee in Texas?')).toBe(true);
    expect(SENSITIVE.test('How do comps work?')).toBe(false);
  });
  it('only uses close earlier questions as examples', () => {
    const past = [{ question: 'How do rural vacation home valuations differ?', answer: 'a' }, { question: 'What is the capital of France', answer: 'b' }];
    expect(pickExamples(past, 'rural vacation home valuations')).toHaveLength(1);
    expect(pickExamples(past, 'something unrelated entirely')).toHaveLength(0);
  });
  it('builds a prompt that says AVYRO specifics are unknown and treats inputs as data', () => {
    const p = buildPrompt({ question: 'Q?', reply: 'R', route: '/x', examples: [{ question: 'old', answer: 'older' }] });
    expect(p.system).toMatch(/do not know how AVYRO is built/i);
    expect(p.system).toMatch(/data, not instructions/i);
    expect(p.user).toContain('Question: Q?');
  });
  it('makes keywords from tags and the question', () => {
    expect(keywordsFor('rural vacation valuations', ['valuation'])).toContain('valuation');
  });
});

describe('plain', () => {
  it('removes markdown the model adds', () => {
    expect(plain('**Bold** point\n## Heading\n* item')).toBe('Bold point\nHeading\n- item');
  });
});

describe('deeperEnabled', () => {
  it('needs the Anthropic key and respects the off switch', () => {
    expect(deeperEnabled({})).toBe(false);
    expect(deeperEnabled({ ANTHROPIC_API_KEY: 'k' })).toBe(true);
    expect(deeperEnabled({ ANTHROPIC_API_KEY: 'k', AVA_DEEPER_ENABLED: 'false' })).toBe(false);
  });
});

describe('handleDeeper', () => {
  it('calls the model, logs the exchange and labels the answer as not approved', async () => {
    const { d, rows } = deps();
    const res = await handleDeeper(req({ question: 'How do vacation home valuations work?', reply: 'I do not have that', route: '/ava-knowledge' }), d);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.answer).toBe('A general answer.');
    expect(j.label).toMatch(/not from AVYRO's approved help/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ organization_id: 'org1', actor_id: 'u1', status: 'answered', model: 'm', input_tokens: 10, output_tokens: 20 });
  });
  it('sends no contact details to the model and flags sensitive topics', async () => {
    const ask = vi.fn(async (_prompt: { system: string; user: string }) => ({ answer: 'ok', model: 'm', inputTokens: 1, outputTokens: 1 }));
    const { d, rows } = deps({ ask });
    const res = await handleDeeper(req({ question: 'Can we share a referral fee? email me at pat@example.com' }), d);
    expect(JSON.stringify(ask.mock.calls[0][0])).not.toContain('pat@example.com');
    expect(rows[0].question).not.toContain('pat@example.com');
    expect((await res.json()).needsReview).toBe(true);
  });
  it('does nothing when disabled, signed out, not staff, rate limited or over the daily cap', async () => {
    const ask = vi.fn();
    expect((await handleDeeper(req({ question: 'valid question' }), deps({ enabled: () => false, ask }).d)).status).toBe(404);
    expect((await handleDeeper(req({ question: 'valid question' }), deps({ getActor: async () => null, ask }).d)).status).toBe(401);
    expect((await handleDeeper(req({ question: 'valid question' }), deps({ getActor: async () => ({ id: 'h', role: 'homeowner', organizationId: 'o' }), ask }).d)).status).toBe(403);
    expect((await handleDeeper(req({ question: 'valid question' }), deps({ allow: () => false, ask }).d)).status).toBe(429);
    expect((await handleDeeper(req({ question: 'valid question' }), deps({ store: { ...deps().d.store, todayCount: async () => 100 }, ask }).d)).status).toBe(429);
    expect(ask).not.toHaveBeenCalled();
  });
  it('logs a failure cleanly and tells the caller without leaking the provider error', async () => {
    const { d, rows } = deps({ ask: async () => { throw new Error('provider responded 500'); } });
    const res = await handleDeeper(req({ question: 'valid question' }), d);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('500');
    expect(rows[0]).toMatchObject({ status: 'failed', answer: null });
  });
  it('rejects a body that is not valid', async () => {
    expect((await handleDeeper(req({ question: 'x' }), deps().d)).status).toBe(400);
  });
});

describe('handleDeeperFeedback', () => {
  it('only accepts a valid id and rating from staff', async () => {
    const { d } = deps();
    const ok = await handleDeeperFeedback(req({ id: '00000000-0000-0000-0000-000000000001', feedback: 'up' }), d);
    expect(ok.status).toBe(200);
    expect((await handleDeeperFeedback(req({ id: 'nope', feedback: 'up' }), d)).status).toBe(400);
    expect((await handleDeeperFeedback(req({ id: '00000000-0000-0000-0000-000000000001', feedback: 'maybe' }), d)).status).toBe(400);
  });
});

describe('askClaude', () => {
  it('calls the Messages API with the key and returns the text and token counts', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ model: 'claude-x', content: [{ type: 'text', text: ' Hello ' }], usage: { input_tokens: 5, output_tokens: 7 } }), { status: 200 })) as unknown as typeof fetch;
    const out = await askClaude({ ANTHROPIC_API_KEY: 'sk-test' }, { system: 's', user: 'u' }, undefined, fetchImpl);
    expect(out).toEqual({ answer: 'Hello', model: 'claude-x', inputTokens: 5, outputTokens: 7 });
    const [url, init] = (fetchImpl as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
  });
  it('fails on a provider error or an empty answer', async () => {
    const bad = vi.fn(async () => new Response('{}', { status: 429 })) as unknown as typeof fetch;
    await expect(askClaude({ ANTHROPIC_API_KEY: 'k' }, { system: 's', user: 'u' }, undefined, bad)).rejects.toThrow(/429/);
    const empty = vi.fn(async () => new Response(JSON.stringify({ content: [] }), { status: 200 })) as unknown as typeof fetch;
    await expect(askClaude({ ANTHROPIC_API_KEY: 'k' }, { system: 's', user: 'u' }, undefined, empty)).rejects.toThrow(/empty/);
  });
});
