import { handleAva } from '@/lib/ava/handler';
import { avaDeps } from '@/lib/ava/defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/ava/prepare — Prepares a change chosen from an answer card; it still needs the person's approval (/api/ava/confirm) before it runs. On unless AVA_ENABLED=false. */
export async function POST(req: Request) {
  return handleAva(req, 'prepare', avaDeps());
}
