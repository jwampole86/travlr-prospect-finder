import { afterEach, describe, expect, it } from 'vitest';
import { getResendFrom } from './email/resend';

const KEYS = ['RESEND_FROM_EMAIL', 'RESEND_FROM_EMAIL_STAYS', 'RESEND_FROM_EMAIL_HOMES', 'RESEND_FROM_NAME'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('sender address per NAVEO brand', () => {
  it('uses each brand’s own address when set, and the default otherwise', () => {
    process.env.RESEND_FROM_EMAIL = 'outreach@default.test';
    process.env.RESEND_FROM_EMAIL_STAYS = 'owners@staynaveo.com';
    delete process.env.RESEND_FROM_EMAIL_HOMES;
    expect(getResendFrom('NAVEO Stays')).toBe('NAVEO Stays <owners@staynaveo.com>');
    expect(getResendFrom('NAVEO Homes')).toBe('NAVEO Homes <outreach@default.test>');
    expect(getResendFrom()).toMatch(/<outreach@default.test>$/);
    process.env.RESEND_FROM_EMAIL_HOMES = 'hello@naveohomes.com';
    expect(getResendFrom('NAVEO Homes')).toBe('NAVEO Homes <hello@naveohomes.com>');
  });
});
