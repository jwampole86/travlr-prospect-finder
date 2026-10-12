import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Words that mark a name as a business or trust rather than a person. A digit also does, since county records sometimes list a street address as the owner. */
const ENTITY_WORDS = /\b(LLC|L L C|INC|CORP|CORPORATION|CO|COMPANY|LP|LLP|LTD|TRUST|TR|RET|REVOCABLE|LIVING|PROPERTIES|INVESTMENTS?|HOLDINGS|MANAGEMENT|REALTY|REAL ESTATE|CONSTRUCTION|ENTERPRISES?|PARTNERS|VENTURES|GROUP|COM)\b/i;
export const isEntityName = (n: string) => ENTITY_WORDS.test(n) || /\d/.test(n);

/** Where to look an entity up by hand. Most states' business registries refuse automated searches or have no public data feed. */
const MANUAL: Record<string, { name: string; url: string }> = {
  AZ: { name: 'Arizona Corporation Commission', url: 'https://ecorp.azcc.gov/EntitySearch/Index' },
  AR: { name: 'Arkansas Secretary of State', url: 'https://www.sos.arkansas.gov/corps/search_all.php' },
  CO: { name: 'Colorado Secretary of State', url: 'https://www.coloradosos.gov/biz/BusinessEntityCriteriaExt.do' },
  FL: { name: 'Florida Sunbiz', url: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName' },
  KY: { name: 'Kentucky Secretary of State', url: 'https://sosbes.sos.ky.gov/BusSearchNProfile/search.aspx' },
  LA: { name: 'Louisiana Secretary of State', url: 'https://coraweb.sos.la.gov/commercialsearch/commercialsearch.aspx' },
  MA: { name: 'Massachusetts Corporations Division', url: 'https://corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx' },
  NM: { name: 'New Mexico Secretary of State', url: 'https://portal.sos.state.nm.us/BFS/online/CorporationBusinessSearch' },
  UT: { name: 'Utah Division of Corporations', url: 'https://businessregistration.utah.gov/EntitySearch/OnlineEntitySearch' },
};

export interface EntityRecord {
  at: string; state: string; mailingState?: string | null; found: boolean; trust: boolean; source: string | null; manualUrl: string | null; manualName: string | null;
  entityName?: string; status?: string; type?: string; agent?: string | null; agentAddress?: string | null; principalAddress?: string | null; mailingAddress?: string | null;
}

const join = (...p: Array<string | undefined>) => p.map(x => (x ?? '').trim()).filter(Boolean).join(', ');

/** Colorado publishes every registered business, with its agent and offices, as open data. */
async function coloradoLookup(name: string): Promise<Partial<EntityRecord> | null> {
  const key = name.toUpperCase().replace(/^THE\s+/, '').replace(/[^A-Z0-9 &]/g, ' ').trim().split(/\s+/).join('%');
  const url = `https://data.colorado.gov/resource/4ykn-tg5h.json?$limit=8&$where=${encodeURIComponent(`upper(entityname) like '${key}%'`)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  const rows = (await res?.json().catch(() => null)) as Array<Record<string, string>> | null;
  if (!Array.isArray(rows) || !rows.length) return null;
  // The wildcard search is loose, so keep only entities whose whole name matches. County names are cut off near 30 characters, so a long name may match by its start.
  const norm = (s: string) => s.toUpperCase().replace(/,\s*(DISSOLVED|DELINQUENT|WITHDRAWN|ADMINISTRATIVELY).*$/, '').replace(/^THE\s+/, '').replace(/[^A-Z0-9 &]/g, ' ').replace(/\s+/g, ' ').trim();
  const want = norm(name);
  const exact = rows.filter(r => norm(r.entityname ?? '') === want || (want.length >= 28 && norm(r.entityname ?? '').startsWith(want)));
  if (!exact.length) return null;
  const best = exact.find(r => /good standing/i.test(r.entitystatus ?? '')) ?? exact[0];
  return {
    found: true, source: 'Colorado Secretary of State (open data)', entityName: best.entityname, status: best.entitystatus, type: best.entitytype,
    agent: join(best.agentfirstname, best.agentlastname).replace(/, /, ' ') || best.agentorganizationname || null,
    agentAddress: join(best.agentprincipaladdress1, best.agentprincipalcity, [best.agentprincipalstate, best.agentprincipalzipcode].filter(Boolean).join(' ')) || null,
    principalAddress: join(best.principaladdress1, best.principalcity, [best.principalstate, best.principalzipcode].filter(Boolean).join(' ')) || null,
    mailingAddress: join(best.mailingaddress1, best.mailingcity, [best.mailingstate, best.mailingzipcode].filter(Boolean).join(' ')) || null,
  };
}

/**
 * For owners of record that are businesses or trusts, finds the registered agent and office addresses where the state publishes them.
 * Every other state is recorded with a link to its official search, so a person can finish the lookup by hand.
 */
export async function lookupEntityOwners(db: SupabaseClient, opts: { limit: number; write: boolean }): Promise<{ checked: number; found: number; manual: number }> {
  const { data } = await db.from('str_listings').select('property_id,market,matched_owner').eq('match_status', 'unique').not('matched_owner', 'is', null).limit(3000);
  const todo = (data ?? []).filter(r => {
    const o = r.matched_owner as Record<string, any>; const names: string[] = o.names ?? [];
    return !o.entity && names.length > 0 && (names.every(isEntityName) || (o.type === 'Organization' && names.some(isEntityName)));
  }).slice(0, opts.limit);
  let found = 0, manual = 0;
  for (const r of todo) {
    const o = r.matched_owner as Record<string, any>; const state = String(r.market ?? '').split(',').pop()?.trim().toUpperCase() ?? '';
    const entityName = (o.names as string[]).find(isEntityName) ?? o.names[0];
    // Trusts are not registered with a state; the trustee is usually one of the named people.
    const trust = /\b(TRUST|TR|RET|REVOCABLE|LIVING)\b/i.test(entityName) && !/\b(LLC|INC|CORP|LP|LTD)\b/i.test(entityName);
    const m = trust ? undefined : MANUAL[state];
    const hit = !trust && state === 'CO' ? await coloradoLookup(entityName) : null;
    const entity: EntityRecord = { at: new Date().toISOString(), state, mailingState: String(o.mailing ?? '').match(/,\s*([A-Z]{2})\s*\d{5}/)?.[1] ?? null, found: !!hit?.found, trust, source: hit?.source ?? null, manualUrl: hit?.found ? null : m?.url ?? null, manualName: hit?.found ? null : m?.name ?? null, ...(hit ?? {}) };
    if (hit?.found) found++; else manual++;
    if (opts.write) await db.from('str_listings').update({ matched_owner: { ...o, entity } }).eq('property_id', r.property_id);
  }
  return { checked: todo.length, found, manual };
}
