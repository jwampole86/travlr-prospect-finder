import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { invalidateLeadSourceOverview, sourceKey } from '@/lib/services/leadSourceOverview';

const METHODS = ['api', 'scrape', 'manual', 'webhook'];
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function validUrl(v: unknown): string | null | 'invalid' {
  const s = clean(v, 600);
  if (!s) return null;
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : 'invalid'; } catch { return 'invalid'; }
}

/**
 * POST /api/lead-sources/configs  (admin). action: create | update | toggle.
 *  create  { sourceName, market, state?, city?, url?, method?, notes? }
 *  update  { id, market?, state?, city?, url?, method?, notes? }
 *  toggle  { ids: string[], active: boolean }   pauses or resumes market configs; nothing is deleted
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const b = await req.json().catch(() => ({})) as Record<string, any>;
  const db = getSupabaseAdmin();
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

  if (b.action === 'toggle') {
    const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 200) : [];
    if (!ids.length || typeof b.active !== 'boolean') return fail('Choose at least one market and whether to pause or resume it.');
    const now = new Date().toISOString();
    if (!b.active) {
      const { data, error } = await db.from('lead_source_configs').update({ is_active: false, sync_status: 'paused', updated_at: now }).in('id', ids).select('id');
      if (error) return fail(error.message, 500);
      invalidateLeadSourceOverview();
      return NextResponse.json({ ok: true, changed: data?.length ?? 0 });
    }
    // Resuming: a market that has synced before goes back to active, and one that never has returns to pending.
    const { data: rows, error: re } = await db.from('lead_source_configs').select('id,last_successful_sync').in('id', ids);
    if (re) return fail(re.message, 500);
    const groups: Array<[string[], string]> = [
      [(rows ?? []).filter(r => r.last_successful_sync).map(r => r.id as string), 'active'],
      [(rows ?? []).filter(r => !r.last_successful_sync).map(r => r.id as string), 'pending'],
    ];
    let changed = 0;
    for (const [group, syncStatus] of groups) {
      if (!group.length) continue;
      const { data, error } = await db.from('lead_source_configs').update({ is_active: true, sync_status: syncStatus, updated_at: now }).in('id', group).select('id');
      if (error) return fail(error.message, 500);
      changed += data?.length ?? 0;
    }
    invalidateLeadSourceOverview();
    return NextResponse.json({ ok: true, changed });
  }

  if (b.action === 'create') {
    const sourceName = clean(b.sourceName, 60); const market = clean(b.market, 80);
    if (sourceName.length < 2) return fail('Enter the source name, for example Zillow.');
    if (market.length < 2) return fail('Enter the market, for example Denver, CO.');
    const state = clean(b.state, 10).toUpperCase();
    if (state && !/^[A-Z]{2}$/.test(state)) return fail('Use the two-letter state code, like CO.');
    const url = validUrl(b.url); if (url === 'invalid') return fail('The link must start with http:// or https://.');
    const method = METHODS.includes(b.method) ? b.method : 'manual';
    const city = clean(b.city, 80) || null;
    const key = sourceKey(sourceName);
    const { data: existing } = await db.from('lead_source_configs').select('id,source_name,market,city').eq('source_key', key).eq('market', market);
    if ((existing ?? []).some(e => String(e.city ?? '').toLowerCase() === String(city ?? '').toLowerCase())) return fail(`${sourceName} already has a config for ${market}${city ? `, ${city}` : ''}.`, 409);
    // Reuse the exact name an existing source already uses so the new market lands under it.
    const { data: sameSource } = await db.from('lead_source_configs').select('source_name').eq('source_key', key).limit(1);
    const row = { source_name: sameSource?.[0]?.source_name ?? sourceName, source_key: key, market, state: state || null, city, filter_url: url, ingestion_method: method, notes: clean(b.notes, 500) || null, is_active: true, sync_status: 'pending' };
    const { data, error } = await db.from('lead_source_configs').insert(row).select('id').single();
    if (error) return fail(error.message, 500);
    invalidateLeadSourceOverview();
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (b.action === 'update') {
    const id = clean(b.id, 60); if (!id) return fail('Choose a market to edit.');
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('market' in b) { const m = clean(b.market, 80); if (m.length < 2) return fail('The market cannot be empty.'); patch.market = m; }
    if ('state' in b) { const s = clean(b.state, 10).toUpperCase(); if (s && !/^[A-Z]{2}$/.test(s)) return fail('Use the two-letter state code, like CO.'); patch.state = s || null; }
    if ('city' in b) patch.city = clean(b.city, 80) || null;
    if ('url' in b) { const u = validUrl(b.url); if (u === 'invalid') return fail('The link must start with http:// or https://.'); patch.filter_url = u; }
    if ('method' in b) { if (!METHODS.includes(b.method)) return fail('Choose how this source is brought in.'); patch.ingestion_method = b.method; }
    if ('notes' in b) patch.notes = clean(b.notes, 500) || null;
    const { data, error } = await db.from('lead_source_configs').update(patch).eq('id', id).select('id');
    if (error) return fail(error.message, 500);
    if (!data?.length) return fail('That market no longer exists.', 404);
    invalidateLeadSourceOverview();
    return NextResponse.json({ ok: true });
  }

  return fail('Unknown action');
}
