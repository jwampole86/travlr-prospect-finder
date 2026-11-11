import { handleDeeperFeedback } from '@/lib/ava/deeper';
import { deeperDeps } from '@/lib/ava/defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/ava/deeper/feedback { id, feedback }: the person who asked rates a deeper answer. Only answers rated helpful are used as examples later. */
export async function POST(req: Request) {
  return handleDeeperFeedback(req, deeperDeps());
}
