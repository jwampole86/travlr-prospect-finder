import { handleAva } from '@/lib/ava/handler';
import { avaDeps } from '@/lib/ava/defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/ava/turn — NDJSON stream from AVA's tool gateway. On unless AVA_ENABLED=false. */
export async function POST(req: Request) {
  return handleAva(req, 'turn', avaDeps());
}
