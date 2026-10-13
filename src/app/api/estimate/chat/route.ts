import { NextRequest, NextResponse } from 'next/server';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';
import { answerFromReport } from '@/lib/services/estimateChat';

export const maxDuration = 30;

const MAX_MESSAGES = 12;
const MAX_CHARS = 600;

/**
 * POST /api/estimate/chat  (public)
 * { address, eq?, messages: [{ role, content }] } -> { reply, handoff }
 * Answers are grounded in the homeowner's own report; the report is rebuilt server-side so the client cannot alter the facts.
 */
export async function POST(req: NextRequest) {
  if (!allowRequest(`chat:${clientIp(req.headers)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'You have asked a lot of questions in a short time. Please try again later or talk to a specialist.' }, { status: 429 });
  }
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const address = typeof body.address === 'string' ? body.address.trim().slice(0, 300) : '';
  const raw = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const messages = raw
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, MAX_CHARS) }));
  if (address.length < 5 || !messages.length || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (messages.filter(m => m.role === 'user').length > 10) {
    return NextResponse.json({ reply: 'We have covered a lot here. A TRAVLR specialist can take it from here and answer the rest on a quick call.', handoff: true });
  }
  // The API needs a conversation that starts with a user turn and alternates.
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const alternating = messages.filter((m, i) => i === 0 || m.role !== messages[i - 1].role);

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'The assistant is unavailable right now. A specialist can answer your question.', handoff: true }, { status: 503 });

  try {
    const { text, handoff } = await answerFromReport(address, alternating, { eq: typeof body.eq === 'string' ? body.eq : null });
    return NextResponse.json({ reply: text, handoff });
  } catch (err) {
    console.error('[estimate/chat]', err);
    return NextResponse.json({ error: 'I could not answer that just now. A TRAVLR specialist can help.', handoff: true }, { status: 502 });
  }
}
