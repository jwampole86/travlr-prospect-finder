import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/apiAuthorization', () => ({ requireAdminActor: vi.fn(), requireApiActor: vi.fn() }));

import { hasJobSecret } from './routeGuards';

const req = (headers: Record<string, string>) => new Request('https://x.test/api/a', { headers });

describe('hasJobSecret', () => {
  it('accepts the cron secret as a bearer token or the job header', () => {
    expect(hasJobSecret(req({ authorization: 'Bearer s3cret-value' }), { CRON_SECRET: 's3cret-value' })).toBe(true);
    expect(hasJobSecret(req({ 'x-job-secret': 'job-value' }), { SEQUENCE_JOB_SECRET: 'job-value' })).toBe(true);
  });

  it('rejects a wrong or missing secret', () => {
    expect(hasJobSecret(req({ authorization: 'Bearer nope' }), { CRON_SECRET: 's3cret-value' })).toBe(false);
    expect(hasJobSecret(req({}), { CRON_SECRET: 's3cret-value' })).toBe(false);
  });

  it('never accepts anything when no real secret is configured', () => {
    expect(hasJobSecret(req({ 'x-job-secret': '' }), {})).toBe(false);
    expect(hasJobSecret(req({ authorization: 'Bearer your-secret-here' }), { CRON_SECRET: 'your-secret-here' })).toBe(false);
  });
});
