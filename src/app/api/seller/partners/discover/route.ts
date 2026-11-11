import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { buildDiscoveryPrompt, parseCandidates } from '@/lib/seller/partnerDiscovery';

export const maxDuration = 120;

const MODEL = process.env.PARTNER_DISCOVERY_MODEL || process.env.REGULATION_RESEARCH_MODEL || 'claude-sonnet-4-6';

/**
 * POST { state: "AR", city?: "Bentonville" }
 * Searches the web for brokerages and agents in the state that could be listing partners, with the contact details on the pages found.
 * Admin only and run on demand: each call is a few paid web searches. It only reads; saving a result as a recruiting prospect is a
 * separate step, and no lead or owner detail is sent to the search.
 */
export async function POST(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as { state?: unknown; city?: unknown };
  const state = typeof body.state === 'string' ? body.state.trim().toUpperCase() : '';
  const city = typeof body.city === 'string' && body.city.trim() ? body.city.trim().slice(0, 80) : null;
  if (!/^[A-Z]{2}$/.test(state)) return fail('A two-letter state is required.');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fail('Web search is not configured (ANTHROPIC_API_KEY is missing).', 503);

  try {
    const client = new Anthropic({ apiKey, maxRetries: 2 });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      temperature: 0,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: buildDiscoveryPrompt(state, city) }],
    } as never) as unknown as { content: Array<{ type: string; text?: string; content?: unknown }> };

    const raw = response.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
    const foundUrls = response.content
      .filter((b) => b.type === 'web_search_tool_result' && Array.isArray(b.content))
      .flatMap((b) => b.content as Array<{ type?: string; url?: string }>)
      .filter((item) => item.type === 'web_search_result' && item.url)
      .map((item) => String(item.url));
    return NextResponse.json({ state, city, candidates: parseCandidates(raw, foundUrls), searchedAt: new Date().toISOString() });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The search failed.', 502);
  }
}
