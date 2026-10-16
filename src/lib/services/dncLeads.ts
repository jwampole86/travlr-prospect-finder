import type { SupabaseClient } from '@supabase/supabase-js';

/** Terminal values of the lead_stage enum: leads that must not be enriched again. */
export const TERMINAL_LEAD_STAGES = ['Not a Fit', 'Live'] as const;

/**
 * Lead ids flagged do-not-contact. The flag lives on `lead_enrichments.do_not_contact`
 * (the `leads` table has no such column). Throws on query failure so callers fail closed
 * instead of treating an unreadable DNC list as "nobody is DNC".
 */
export async function getDncLeadIds(supabase: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('lead_enrichments')
      .select('lead_id')
      .eq('do_not_contact', true)
      .range(from, from + 999);
    if (error) throw new Error(`Could not load do-not-contact list: ${error.message}`);
    for (const row of data || []) if (row.lead_id) ids.add(row.lead_id as string);
    if (!data || data.length < 1000) break;
  }
  return ids;
}
