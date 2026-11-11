import { handleDeeper } from '@/lib/ava/deeper';
import { deeperDeps } from '@/lib/ava/defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/ava/deeper: general guidance from an AI model when AVA's approved help has no answer. Staff only; off with AVA_DEEPER_ENABLED=false. */
export async function POST(req: Request) {
  return handleDeeper(req, deeperDeps());
}
