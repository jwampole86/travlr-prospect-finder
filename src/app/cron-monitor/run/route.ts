import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getCronProxySecret, getScheduledCronJobs } from '../lib';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authorization = await requireAdminActor(req);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = await req.json().catch(() => ({}));
  const requestedPath = typeof body.path === 'string' ? body.path : '';
  const job = getScheduledCronJobs().find((entry) => entry.path === requestedPath);
  if (!job) {
    return NextResponse.json({ error: 'Unknown cron route' }, { status: 404 });
  }

  const headers = new Headers({ Accept: 'application/json' });
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  const secret = getCronProxySecret();
  if (secret) {
    headers.set('x-job-secret', secret);
    headers.set('authorization', `Bearer ${secret}`);
  }

  const response = await fetch(new URL(job.path, req.nextUrl.origin), {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const text = await response.text();
  let result: unknown = text;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = text;
  }

  return NextResponse.json(
    {
      ok: response.ok,
      status: response.status,
      job: { key: job.key, name: job.name, path: job.path },
      result,
    },
    { status: response.ok ? 200 : response.status }
  );
}
