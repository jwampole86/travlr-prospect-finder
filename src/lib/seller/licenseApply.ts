import type { LicenseResult } from './licenseVerify';

/** What to store on the partner after a check. Only a clean match makes a license "verified"; a license the state shows as inactive stops referrals. */
export function partnerPatchFor(result: LicenseResult, current: { license_status?: string | null }): Record<string, unknown> {
  const check = { outcome: result.outcome, message: result.message, source: result.source, record: result.record ?? null, checkedAt: result.checkedAt };
  if (result.outcome === 'verified') return { license_status: 'verified', license_verified_at: result.checkedAt, license_check: check };
  if (result.outcome === 'inactive') return { license_status: current.license_status === 'verified' ? 'expired' : current.license_status ?? 'unverified', license_check: check };
  return { license_check: check };
}
