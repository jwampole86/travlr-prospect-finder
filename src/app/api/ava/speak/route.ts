import { handleSpeak } from '@/lib/ava/speakHandler';
import { speakDeps } from '@/lib/ava/defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** POST /api/ava/speak: AVA's natural voice for her replies. On unless AVA_ENABLED=false or AVA_VOICE_ENABLED=false. */
export async function POST(req: Request) {
  return handleSpeak(req, speakDeps());
}
