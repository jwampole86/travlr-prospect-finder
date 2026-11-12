import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAdminActor, requireApiActor } from '@/lib/auth/apiAuthorization';

type Req = Request;
type Guard = Promise<NextResponse | null>;

const reject = (error: string, status: number) => NextResponse.json({ error }, { status });

const REAL_SECRET = (s: string | undefined): s is string => Boolean(s) && !/your-|placeholder|changeme|example/i.test(s!);

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when the request carries the cron or job secret. Never true when no real secret is configured. */
export function hasJobSecret(req: Req, env: Record<string, string | undefined> = process.env): boolean {
  const secrets = [env.CRON_SECRET, env.SEQUENCE_JOB_SECRET].filter(REAL_SECRET);
  if (secrets.length === 0) return false;
  const header = req.headers.get('x-job-secret');
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  return secrets.some((s) => (header !== null && sameSecret(header, s)) || (bearer !== null && sameSecret(bearer, s)));
}

/** Any signed-in, active user. Returns a 401 response to send back, or null to continue. */
export async function guardUser(req: Req): Guard {
  const r = await requireApiActor(req as never);
  return r.actor ? null : reject(r.error, r.status);
}

/** Staff only: any signed-in user except a homeowner (a homeowner portal login is not a staff login). */
export async function guardStaff(req: Req): Guard {
  const r = await requireApiActor(req as never);
  if (!r.actor) return reject(r.error, r.status);
  return r.actor.role === 'homeowner' ? reject('Forbidden', 403) : null;
}

/** Admins and owners only. */
export async function guardAdmin(req: Req): Guard {
  const r = await requireAdminActor(req as never);
  return r.actor ? null : reject(r.error, r.status);
}

/** An admin session, or a scheduled job presenting the job secret. */
export async function guardAdminOrJob(req: Req): Guard {
  if (hasJobSecret(req)) return null;
  return guardAdmin(req);
}
