import { createClient } from '@supabase/supabase-js';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new';

/**
 * Generate a short random token (8 chars, URL-safe).
 */
function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export interface TrackLinkOptions {
  originalUrl: string;
  leadId: string;
  sequenceId?: string;
  sequenceName?: string;
  agentId?: string;
  portfolio?: string;
}

export interface TrackLinkResult {
  shortUrl: string;
  token: string;
}

/**
 * Create a tracked short link for an SMS message.
 * Inserts a record into link_clicks and returns the redirect URL.
 */
export async function createTrackedLink(options: TrackLinkOptions): Promise<TrackLinkResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  let token = generateToken();

  await supabase.from('link_clicks').insert({
    token,
    lead_id: options.leadId,
    sequence_id: options.sequenceId ?? null,
    sequence_name: options.sequenceName ?? null,
    agent_id: options.agentId ?? null,
    original_url: options.originalUrl,
    portfolio: options.portfolio ?? null,
    created_at: new Date().toISOString(),
  });

  return {
    token,
    shortUrl: `${SITE_URL}/api/track/${token}`,
  };
}

/**
 * Replace all http/https URLs in an SMS body with tracked short links.
 * Returns the modified body and the list of created tokens.
 */
export async function injectTrackedLinks(
  body: string,
  options: Omit<TrackLinkOptions, 'originalUrl'>
): Promise<{ body: string; tokens: string[] }> {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = body.match(urlRegex);
  if (!urls || urls.length === 0) return { body, tokens: [] };

  const tokens: string[] = [];
  let modifiedBody = body;

  for (const url of urls) {
    try {
      const result = await createTrackedLink({ ...options, originalUrl: url });
      modifiedBody = modifiedBody.replace(url, result.shortUrl);
      tokens.push(result.token);
    } catch {
      // If link creation fails, leave original URL
    }
  }

  return { body: modifiedBody, tokens };
}

/**
 * Fetch click-through stats per sequence for Campaign Analytics.
 */
export async function fetchSequenceClickStats(sequenceIds?: string[]): Promise<
  Array<{
    sequenceId: string;
    sequenceName: string;
    totalLinks: number;
    clicked: number;
    ctr: number;
  }>
> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  let query = supabase
    .from('link_clicks')
    .select('sequence_id, sequence_name, clicked_at');

  if (sequenceIds && sequenceIds.length > 0) {
    query = query.in('sequence_id', sequenceIds);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  // Group by sequence
  const map = new Map<string, { name: string; total: number; clicked: number }>();
  for (const row of data) {
    if (!row.sequence_id) continue;
    const existing = map.get(row.sequence_id) ?? { name: row.sequence_name || row.sequence_id, total: 0, clicked: 0 };
    existing.total++;
    if (row.clicked_at) existing.clicked++;
    map.set(row.sequence_id, existing);
  }

  return Array.from(map.entries()).map(([id, stats]) => ({
    sequenceId: id,
    sequenceName: stats.name,
    totalLinks: stats.total,
    clicked: stats.clicked,
    ctr: stats.total > 0 ? Math.round((stats.clicked / stats.total) * 100) : 0,
  }));
}
