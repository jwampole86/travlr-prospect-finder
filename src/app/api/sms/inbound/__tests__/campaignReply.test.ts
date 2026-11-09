import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const calls: Array<{ table: string; op: string }> = [];
/** Every query resolves to "nothing found"; only what the route writes and calls matters here. */
const fakeDb: any = { from: (table: string) => { const q: any = new Proxy(() => undefined, { get: (_t, op: string) => { if (op === 'then') return (res: (v: unknown) => void) => res({ data: null, error: null }); return (..._a: unknown[]) => { calls.push({ table, op }); return q; }; } }); return q; } };
vi.mock('@/lib/supabaseAdmin', () => ({ getSupabaseAdmin: () => fakeDb }));

const notifyAdmins = vi.fn(async () => undefined);
vi.mock('@/lib/services/smsConsent', async (orig) => ({
  ...(await orig<typeof import('@/lib/services/smsConsent')>()),
  findLeadByPhone: vi.fn(async () => ({ id: 'L1', contact_name: 'Sam Owner' })),
  verifyTwilioSignature: () => true,
  notifyAdmins: (...a: unknown[]) => (notifyAdmins as any)(...a),
  recordOptIn: vi.fn(), recordOptOut: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/leadScoringService', () => ({ rescoreLeadsByIds: vi.fn(async () => 0) }));
vi.mock('@/lib/services/replyAlerts', () => ({ sendReplyAlert: vi.fn(async () => undefined), sendTeamAlert: vi.fn(async () => undefined) }));
vi.mock('@/lib/services/leadPipeline', () => ({ advancePipeline: vi.fn(async () => undefined) }));
vi.mock('@/lib/services/yesFollowup', () => ({ scheduleYesFollowup: vi.fn(async () => undefined) }));
const objectionReply = vi.fn(async () => 'AUTO REPLY');
vi.mock('@/lib/services/smsQuestionReply', () => ({ looksLikeQuestion: () => false, questionReply: vi.fn(async () => null) }));
vi.mock('@/lib/services/smsHoaReply', () => ({ isHoaObjection: () => false, hoaReply: vi.fn(async () => null) }));
const isSchedulingThread = vi.fn(async () => false);
vi.mock('@/lib/services/smsCallScheduler', () => ({ isSchedulingThread: (...a: unknown[]) => (isSchedulingThread as any)(...a), schedulingReply: vi.fn(async () => null) }));
vi.mock('@/lib/services/smsObjectionReply', () => ({ objectionReply: (...a: unknown[]) => (objectionReply as any)(...a) }));
const asked = vi.fn(async () => true);
const recordReplyChoice = vi.fn(async () => ({ id: 'opp-1' }));
vi.mock('@/lib/seller/replyChoice', () => ({ askedCampaignQuestion: (...a: unknown[]) => (asked as any)(...a), recordReplyChoice: (...a: unknown[]) => (recordReplyChoice as any)(...a) }));
vi.mock('@/lib/seller/sellerIntent', () => ({ detectSellerIntent: () => ({ level: 'none', score: 0, timeline: null, keepsRental: false, signals: [] }) }));

const { POST } = await import('../route');
const { NextRequest } = await import('next/server');

const inbound = (body: string) => POST(new NextRequest('https://app.test/api/sms/inbound', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ From: '+13035550100', Body: body, MessageSid: 'SM1' }),
}));

beforeEach(() => { calls.length = 0; vi.clearAllMocks(); asked.mockResolvedValue(true); objectionReply.mockResolvedValue('AUTO REPLY'); });

describe('an owner answering the campaign question', () => {
  it('records the answer for a person, tells the team, and sends nothing back', async () => {
    const res = await inbound('2');
    expect(recordReplyChoice).toHaveBeenCalledWith(fakeDb, { leadId: 'L1', choice: 'rent_ltr', text: '2' });
    expect(notifyAdmins).toHaveBeenCalledWith(fakeDb, expect.objectContaining({ title: 'Owner chose Long-term rental' }));
    expect(objectionReply).not.toHaveBeenCalled();
    expect(isSchedulingThread).not.toHaveBeenCalled();
    expect(await res.text()).not.toContain('<Message>');
  });

  it('does not treat a "2" as an answer when the last text we sent was not the question', async () => {
    asked.mockResolvedValue(false);
    const res = await inbound('2');
    expect(recordReplyChoice).not.toHaveBeenCalled();
    expect(await res.text()).toContain('AUTO REPLY'); // the existing handling of an unknown reply is unchanged
  });

  it('does not read a longer message as an answer', async () => {
    await inbound("I'm not selling, but maybe a rental");
    expect(recordReplyChoice).not.toHaveBeenCalled();
    expect(asked).not.toHaveBeenCalled();
  });

  it('never records an answer from a STOP, and a failure while recording does not lose the reply', async () => {
    await inbound('STOP');
    expect(recordReplyChoice).not.toHaveBeenCalled();
    recordReplyChoice.mockRejectedValueOnce(new Error('db down'));
    const res = await inbound('3');
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.table === 'outreach_history' && c.op === 'insert')).toBe(true);
  });
});
