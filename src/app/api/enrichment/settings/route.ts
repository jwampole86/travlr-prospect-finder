import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/enrichment/settings
 * Returns all enrichment settings.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('enrichment_settings')
      .select('*')
      .order('setting_key');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings: data || [] });
  } catch (err) {
    console.error('[Enrichment Settings] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/enrichment/settings
 * Update one or more enrichment settings.
 * Body: { updates: [{ setting_key, setting_value }] }
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { updates } = body;

    if (!updates?.length) {
      return NextResponse.json({ error: 'updates array required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const results = [];

    for (const update of updates) {
      const { setting_key, setting_value } = update;
      if (!setting_key || setting_value === undefined) continue;

      const { error } = await supabase
        .from('enrichment_settings')
        .update({ setting_value: String(setting_value), updated_at: now, updated_by: user.id })
        .eq('setting_key', setting_key);

      results.push({ setting_key, success: !error, error: error?.message });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[Enrichment Settings] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
