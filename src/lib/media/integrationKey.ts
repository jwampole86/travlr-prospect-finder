import { timingSafeEqual } from 'node:crypto';

/** Constant-time check of the key NAVEO sends. Always false until NAVEO_INTEGRATION_KEY is set (24+ characters). */
export function validIntegrationKey(provided: string | null, expected: string | undefined = process.env.NAVEO_INTEGRATION_KEY): boolean {
  if (!expected || expected.length < 24 || !provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
