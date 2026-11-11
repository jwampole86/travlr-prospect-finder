import { beforeEach, describe, expect, it, vi } from 'vitest';

const inserted: Record<string, unknown>[] = [];
const recordSellerSignal = vi.fn();
const recordConsent = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/seller/consentLedger', () => ({ recordConsent: (...a: unknown[]) => recordConsent(...a) }));
vi.mock('@/lib/seller/naveoAccess', () => ({ naveoSellerAccess: () => ({ userId: 'u1', organizationId: 'org1' }) }));
vi.mock('@/lib/seller/sellerPipeline', () => ({ recordSellerSignal: (...a: unknown[]) => recordSellerSignal(...a) }));
vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ ilike: () => ({ limit: async () => ({ data: [] }) }) }), single: async () => ({ data: { id: 'lead-1' }, error: null }) }),
      insert: (row: Record<string, unknown>) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 'lead-1' }, error: null }) }) }; },
      update: () => ({ eq: async () => ({}) }),
    }),
  }),
}));

import { POST } from '@/app/api/integration/naveo/owner-inquiries/route';

const call = (body: unknown) => POST({ method: 'POST', nextUrl: { pathname: '/api/integration/naveo/owner-inquiries' }, headers: new Headers({ 'x-naveo-key': 'k' }), json: async () => body } as never);

describe('owner inquiry intake', () => {
  beforeEach(() => { inserted.length = 0; recordConsent.mockClear(); recordSellerSignal.mockReset().mockResolvedValue({ opportunity: { id: 'opp-1' }, created: true }); });

  it('opts an owner in only when they asked for the analysis themselves', async () => {
    await call({ email: 'a@b.co', property_location: 'Las Vegas, NV' });
    expect(inserted[0]).toMatchObject({ price_type: 'rent', email_opt_in: true, lead_source_type: 'self_submitted', owner_email: 'a@b.co' });
    expect(recordSellerSignal.mock.calls[0][1].intent.level).toBe('explicit');
  });

  it('does not opt in a referred owner or treat the referral as their own request', async () => {
    await call({ email: 'a@b.co', referred: true, property_location: 'Las Vegas, NV' });
    expect(inserted[0]).toMatchObject({ email_opt_in: false, lead_source_type: 'sync_imported', lead_status_tag: 'Referred — Permission Needed', opt_in_source: 'naveo_stays_owner_referral' });
    expect(inserted[0].email_opt_in_at).toBeUndefined();
    expect(inserted[0].owner_email).toBeNull();
    expect(recordSellerSignal.mock.calls[0][1].intent.level).toBe('possible');
  });

  it('records consent only when the owner ticked the box, and never for a referred owner', async () => {
    await call({ email: 'a@b.co' });
    expect(recordConsent).not.toHaveBeenCalled();
    await call({ email: 'a@b.co', follow_up_consent: true });
    expect(recordConsent).toHaveBeenCalledTimes(1);
    expect(recordConsent.mock.calls[0][1]).toMatchObject({ purpose: 'estimate_followup', granted: true, email: 'a@b.co' });
    await call({ email: 'c@d.co', referred: true, follow_up_consent: true });
    expect(recordConsent).toHaveBeenCalledTimes(1);
  });
});
