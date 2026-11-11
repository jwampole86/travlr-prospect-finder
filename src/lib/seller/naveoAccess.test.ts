import { describe, expect, it } from 'vitest';
import { naveoSellerAccess } from './naveoAccess';

const KEY = 'k'.repeat(32);
const env = { NAVEO_INTEGRATION_KEY: KEY, NAVEO_ORGANIZATION_ID: 'org-1', NAVEO_ACTOR_USER_ID: 'user-1' };

describe('naveoSellerAccess', () => {
  it('acts as the dedicated user in the configured organization', () => {
    expect(naveoSellerAccess('GET', '/api/seller/referrals/match', KEY, env)).toEqual({ userId: 'user-1', organizationId: 'org-1' });
    expect(naveoSellerAccess('post', '/api/seller/referrals', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('PATCH', '/api/seller/referrals', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('GET', '/api/seller/opportunities/abc-123', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('POST', '/api/integration/naveo/leads', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('GET', '/api/integration/naveo/listings', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('POST', '/api/integration/naveo/owner-inquiries', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('GET', '/api/integration/naveo/stays/listings', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('GET', '/api/integration/naveo/stays/listings/abc-123/availability', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('POST', '/api/integration/naveo/stays/bookings', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('GET', '/api/integration/naveo/stays/staging', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('POST', '/api/integration/naveo/stays/listings/abc/launch', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('PATCH', '/api/integration/naveo/stays/bookings/NV-ABC123', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('DELETE', '/api/integration/naveo/stays/listings/abc/calendar/def', KEY, env)).not.toBeNull();
    expect(naveoSellerAccess('POST', '/api/integration/naveo/stays/listings/abc/reviews', KEY, env)).not.toBeNull();
  });

  it('rejects a missing, short or wrong key', () => {
    expect(naveoSellerAccess('GET', '/api/seller/dashboard', null, env)).toBeNull();
    expect(naveoSellerAccess('GET', '/api/seller/dashboard', 'x'.repeat(32), env)).toBeNull();
    expect(naveoSellerAccess('GET', '/api/seller/dashboard', 'short', { ...env, NAVEO_INTEGRATION_KEY: 'short' })).toBeNull();
  });

  it('stays off until the organization and acting user are configured', () => {
    expect(naveoSellerAccess('GET', '/api/seller/dashboard', KEY, { ...env, NAVEO_ORGANIZATION_ID: undefined })).toBeNull();
    expect(naveoSellerAccess('GET', '/api/seller/dashboard', KEY, { ...env, NAVEO_ACTOR_USER_ID: undefined })).toBeNull();
  });

  it('cannot reach partner onboarding, agreements, revenue, states or backfills', () => {
    for (const [method, path] of [
      ['POST', '/api/seller/partners'], ['PATCH', '/api/seller/partners'], ['POST', '/api/seller/partners/verify'], ['GET', '/api/seller/agreements'],
      ['POST', '/api/seller/agreements'], ['GET', '/api/seller/revenue'], ['POST', '/api/seller/states'], ['POST', '/api/seller/backfill'],
      ['PATCH', '/api/seller/opportunities/abc'], ['POST', '/api/seller/opportunities'], ['PATCH', '/api/seller/opportunities/abc/assessments'],
      ['POST', '/api/integration/naveo/listings'], ['GET', '/api/integration/naveo/owner-inquiries'], ['POST', '/api/integration/naveo/stays/listings'], ['GET', '/api/integration/naveo/stays/listings/abc/../../../seller/revenue'], ['PATCH', '/api/integration/naveo/stays/listings/abc'], ['DELETE', '/api/integration/naveo/stays/bookings/NV-ABC123'], ['GET', '/api/integration/naveo/stays/bookings'], ['GET', '/api/integration/naveo/stays/listings/abc/launch'], ['POST', '/api/integration/naveo/stays/staging'], ['GET', '/api/leads/paginated'], ['GET', '/api/seller/referrals/../partners'], ['DELETE', '/api/seller/referrals'],
    ]) {
      expect(naveoSellerAccess(method, path, KEY, env), `${method} ${path}`).toBeNull();
    }
  });
});
