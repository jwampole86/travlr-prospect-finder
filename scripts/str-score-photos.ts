/**
 * Scores listing photos with a vision model for the shortlisted candidates only, and stores concrete improvement notes.
 * Photo quality is judged from the photos alone, without the revenue figures, so it is an independent signal.
 *
 *   npx tsx scripts/str-score-photos.ts --limit=1          (test on one listing)
 *   npx tsx scripts/str-score-photos.ts --limit=40 --go    (score and store the top 40)
 */
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const LIMIT = Number(arg('limit') ?? 40);
const MODEL = process.env.PHOTO_SCORE_MODEL || 'claude-sonnet-4-6';
const PHOTOS_PER_LISTING = 8;

interface Verdict { score: number; hero: 'strong' | 'ok' | 'weak'; lighting: string; staging: string; angles: string; missingShots: string[]; strengths: string[]; fixes: string[]; looksDated: boolean; confidence: 'high' | 'medium' | 'low' }

(async () => {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const db = getSupabaseAdmin(); const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 120_000 });

  // Matched listings first (they are the ones outreach could actually reach), then the strongest remaining owner-hosted luxury candidates.
  const { data: matched } = await db.from('str_listings').select('property_id,market,title,photo_urls,photo_count,under_score').in('match_status', ['unique', 'ambiguous']).is('photo_score', null);
  const { data: rest } = await db.from('str_listings').select('property_id,market,title,photo_urls,photo_count,under_score').eq('segment', 'candidate').eq('is_luxury', true).lte('host_listing_count', 2).is('photo_score', null).order('under_score', { ascending: false }).limit(60);
  const seen = new Set<string>(); const picks = [...(matched ?? []), ...(rest ?? [])].filter(r => (seen.has(r.property_id) ? false : (seen.add(r.property_id), (r.photo_urls?.length ?? 0) >= 3))).slice(0, LIMIT);
  console.log(`listings to score: ${picks.length} (model ${MODEL})`);

  let inT = 0, outT = 0, done = 0, failed = 0;
  for (const l of picks) {
    const urls = (l.photo_urls as string[]); const step = Math.max(1, Math.floor(urls.length / PHOTOS_PER_LISTING));
    const chosen = urls.filter((_, i) => i % step === 0).slice(0, PHOTOS_PER_LISTING);
    try {
      const res = await client.messages.create({
        model: MODEL, max_tokens: 900, temperature: 0,
        system: `You review vacation-rental listing photos for a property-management company deciding how to help the owner earn more. Judge only what is visible in the photos. Be specific and fair: name what you see, not generalities. Never insult the owner or the home. If photos are missing key spaces, say which. Return ONLY JSON: {"score": 0-100 overall photo quality for a luxury listing (90+ professional, 70s good, 50s average, below 40 weak), "hero": "strong|ok|weak" (first photo's pull), "lighting": short, "staging": short, "angles": short, "missingShots": string[] (spaces a guest expects but none of these photos show), "strengths": string[] (max 3), "fixes": string[] (max 3, each concrete and doable), "looksDated": boolean, "confidence": "high|medium|low"}. The ${chosen.length} photos are a sample from ${l.photo_count} total, in listing order.`,
        messages: [{ role: 'user', content: [...chosen.map(u => ({ type: 'image' as const, source: { type: 'url' as const, url: u } })), { type: 'text' as const, text: `Listing title: "${l.title}". Score these photos.` }] }],
      });
      inT += res.usage.input_tokens; outT += res.usage.output_tokens;
      const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
      const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON');
      const v = JSON.parse(m[0]) as Verdict;
      done++;
      console.log(`[${String(v.score).padStart(3)}] ${l.market.split(',')[0].padEnd(10)} ${String(l.title).slice(0, 38).padEnd(38)} hero ${v.hero} | ${v.looksDated ? 'dated | ' : ''}missing: ${(v.missingShots ?? []).slice(0, 3).join(', ') || 'none'}\n        fix: ${(v.fixes ?? [])[0] ?? ''}`);
      if (GO) await db.from('str_listings').update({ photo_score: Math.round(Number(v.score)), photo_notes: { ...v, model: MODEL, photosReviewed: chosen.length, of: l.photo_count, at: new Date().toISOString() } }).eq('property_id', l.property_id);
    } catch (e) { failed++; console.log(`FAILED ${l.title?.slice(0, 40)}: ${(e as Error).message.slice(0, 140)}`); }
  }
  const usd = (inT / 1e6) * 3 + (outT / 1e6) * 15;
  console.log(`scored ${done}, failed ${failed} | tokens in ${inT} out ${outT} | about $${usd.toFixed(2)} | ${GO ? 'saved' : 'NOT saved (add --go)'}`);
})().catch(e => { console.error(e); process.exit(1); });
