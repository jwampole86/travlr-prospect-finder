import { handleLearning } from '@/lib/ava/learningHandler';
import { learningDeps } from '@/lib/ava/defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET reads, PATCH changes consent (personalization / sharing), DELETE erases what AVA has learned about the signed-in person. */
export const GET = (req: Request) => handleLearning(req, 'profile', learningDeps());
export const PATCH = (req: Request) => handleLearning(req, 'profile', learningDeps());
export const DELETE = (req: Request) => handleLearning(req, 'profile', learningDeps());
