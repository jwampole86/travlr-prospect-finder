import { handleAva } from '@/lib/ava/handler';
import { avaDeps } from '@/lib/ava/defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/ava/briefing — The daily "what needs you today" summary, built from real counts without a language model. On unless AVA_ENABLED=false. */
export async function POST(req: Request) {
  return handleAva(req, 'briefing', avaDeps());
}
