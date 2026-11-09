import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./sellerPipeline', () => ({
  recordSellerSignal: vi.fn(async () => ({ opportunity: { id: 'opp-1', lead_id: 'L1' }, created: true })),
}));

const { askedCampaignQuestion, recordReplyChoice } = await import('./replyChoice');
const { recordSellerSignal } = await import('./sellerPipeline');

const NOW = Date.parse('2026-11-09T12:00:00Z');

/** A chainable fake of the query used to find the last text we sent. */
function fakeDb(rows: Array<Record<string, unknown>>) {
  const calls: Record<string, unknown[]> = {};
  const q: any = {
    select: () => q,
    eq: (c: string, v: unknown) => { (calls.eq ??= []).push([c, v]); return q; },
    in: (c: string, v: unknown) => { (calls.in ??= []).push([c, v]); return q; },
    gte: (c: string, v: unknown) => { (calls.gte ??= []).push([c, v]); return q; },
    order: () => q,
    limit: () => Promise.resolve({ data: rows }),
  };
  return { db: { from: () => q } as never, calls };
}

describe('was the last text the campaign question?', () => {
  it('is true when the newest text we sent asked it', async () => {
    const { db } = fakeDb([{ status: 'sent', metadata: { original_message: 'Hi Sam ... Reply with 1, 2, 3 or 4. Reply STOP to opt out.' } }]);
    expect(await askedCampaignQuestion(db, 'L1', NOW)).toBe(true);
  });

  it('is false when a later text was something else, so a "1" is not taken for an answer', async () => {
    const { db } = fakeDb([
      { status: 'sent', metadata: { original_message: 'Can we call you at 2pm?' } },
      { status: 'sent', metadata: { original_message: 'Reply with 1, 2, 3 or 4' } },
    ]);
    expect(await askedCampaignQuestion(db, 'L1', NOW)).toBe(false);
  });

  it('is false with nothing sent, or when only replies from the owner are on record', async () => {
    expect(await askedCampaignQuestion(fakeDb([]).db, 'L1', NOW)).toBe(false);
    expect(await askedCampaignQuestion(fakeDb([{ status: 'sent', metadata: { direction: 'inbound', body: '1' } }]).db, 'L1', NOW)).toBe(false);
  });

  it('only looks at delivered texts to this lead in the last three weeks', async () => {
    const { db, calls } = fakeDb([]);
    await askedCampaignQuestion(db, 'L1', NOW);
    expect(calls.eq).toEqual([['lead_id', 'L1'], ['channel', 'sms']]);
    expect(calls.in).toEqual([['status', ['sent', 'queued', 'delivered']]]);
    expect(calls.gte).toEqual([['sent_at', new Date(NOW - 21 * 24 * 3600_000).toISOString()]]);
  });
});

describe('recording an answer', () => {
  function updateDb() {
    const updates: Array<Record<string, unknown>> = [];
    const db = { from: () => ({ update: (p: Record<string, unknown>) => { updates.push(p); return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'opp-1', ...p } }) }) }) }; } }) } as never;
    return { db, updates };
  }

  it('creates or refreshes the opportunity and sets the next step, without choosing a route or permission', async () => {
    const { db, updates } = updateDb();
    const opp = await recordReplyChoice(db, { leadId: 'L1', choice: 'rent_str', text: '3' });
    expect(vi.mocked(recordSellerSignal).mock.calls[0][1]).toMatchObject({ leadId: 'L1', source: 'sms_reply', intent: { level: 'possible', keepsRental: true } });
    expect(updates[0]).toMatchObject({ reply_choice: 'rent_str' });
    expect(String(updates[0].next_action)).toContain('Short-term rental checklist and fit review');
    expect(String(updates[0].next_action)).toContain('permission');
    expect(Object.keys(updates[0])).not.toContain('route');
    expect(Object.keys(updates[0])).not.toContain('authorization_status');
    expect(opp).toMatchObject({ id: 'opp-1', reply_choice: 'rent_str' });
  });

  it('treats a sale answer as an explicit signal', async () => {
    const { db } = updateDb();
    await recordReplyChoice(db, { leadId: 'L2', choice: 'sale', text: '1' });
    expect(vi.mocked(recordSellerSignal).mock.calls.at(-1)![1]).toMatchObject({ intent: { level: 'explicit', score: 70 } });
  });
});
