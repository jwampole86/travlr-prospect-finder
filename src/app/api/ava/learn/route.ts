import { handleLearning } from '@/lib/ava/learningHandler';
import { learningDeps } from '@/lib/ava/defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST { events } — what AVA learns from how the signed-in person uses her (ids and counts only). */
export const POST = (req: Request) => handleLearning(req, 'learn', learningDeps());
