export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info' | 'pending';
export interface VerificationCheck { id: string; label: string; status: CheckStatus; detail: string }
export type VerificationLevel = 'verified' | 'likely' | 'unconfirmed' | 'review' | 'conflict' | 'no_match' | 'pending';
export interface OwnerVerification { level: VerificationLevel; label: string; summary: string; strongSignals: number; checks: VerificationCheck[]; nextStep: string | null }

export interface VerifyInput {
  bedrooms: number | null; bathrooms: number | null; address_match_confidence: string | null;
  match_status: string | null; matched_address: string | null;
  matched_owner: Record<string, any> | null;
  /** First (closest) registry candidate stored by the matcher. */
  candidate?: Record<string, any> | null; candidateCount?: number;
  /** How many listings were matched to this same property. */
  sharedAddressCount?: number;
}

const STOP = new Set(['LLC', 'INC', 'CORP', 'CO', 'LP', 'LTD', 'TRUST', 'TRUSTEE', 'TRUSTEES', 'LIVING', 'REVOCABLE', 'FAMILY', 'THE', 'AND', 'OF', 'JR', 'SR', 'II', 'III', 'ET', 'AL', 'UX', 'DBA', 'ESTATE']);
const tokens = (s: string) => new Set(s.toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOP.has(t)));

/** True when two name strings plausibly refer to the same person or entity, whatever the word order ("LANG DANIEL S" and "Daniel Lang"). */
export function sameName(a: string, b: string): boolean {
  const x = tokens(a), y = tokens(b); if (!x.size || !y.size) return false;
  const overlap = [...x].filter(t => y.has(t)).length;
  return overlap >= Math.min(2, x.size, y.size) && overlap / Math.min(x.size, y.size) >= 0.66;
}
const anyName = (names: string[], other: string[]) => names.some(n => other.some(o => sameName(n, o)));

/** Words that mark a name as a business or trust rather than a person. A digit also does, since county records sometimes list a street address as the owner. */
const ENTITY_WORDS = /\b(LLC|L L C|INC|CORP|CORPORATION|CO|COMPANY|LP|LLP|LTD|TRUST|TR|RET|REVOCABLE|LIVING|PROPERTIES|INVESTMENTS?|HOLDINGS|MANAGEMENT|REALTY|REAL ESTATE|CONSTRUCTION|ENTERPRISES?|PARTNERS|VENTURES|GROUP|COM|STORE|GALLERY|RESORT|CABINS?|LODGE|HOTEL|VACATION|RENTALS?|HOMES|STAYS)\b/i;
export const isEntityName = (n: string) => ENTITY_WORDS.test(n) || /\d/.test(n);
export const personalNames = (owner: Record<string, any> | null | undefined): string[] => ((owner?.names ?? []) as string[]).filter(n => !isEntityName(n));
const digits = (p: string) => p.replace(/\D/g, '').slice(-10);

export function verifyOwner(i: VerifyInput): OwnerVerification {
  const checks: VerificationCheck[] = []; const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail });
  const o = i.matched_owner; const c = i.candidate ?? null; const status = i.match_status;

  if (!status) return { level: 'pending', label: 'Not checked', summary: 'This listing has not been checked against public STR records yet.', strongSignals: 0, checks, nextStep: null };
  if (status === 'no_registry_nearby') return { level: 'no_match', label: 'No public record', summary: 'No public short-term-rental registry covers this location, so the owner cannot be confirmed from permits.', strongSignals: 0, checks: [{ id: 'registry', label: 'Public STR registry', status: 'info', detail: 'No registry we load has an active permit near this listing. Many states and counties do not publish one.' }], nextStep: 'Look the property up by hand (county assessor) before contacting anyone.' };
  if (status === 'none_match' || status === 'too_many') return { level: 'no_match', label: status === 'too_many' ? 'Too many matches' : 'No match', summary: status === 'too_many' ? 'More than three permitted homes nearby fit this listing, so none can be picked safely.' : 'Permits exist nearby but none has the same bedrooms and bathrooms.', strongSignals: 0, checks: [{ id: 'registry', label: 'Public STR registry', status: 'warn', detail: status === 'too_many' ? 'More than three registry entries fit.' : 'Nearby registry entries differ in size from this listing.' }], nextStep: 'Open the listing photos and compare with nearby permitted homes.' };
  if (status === 'ambiguous') return { level: 'review', label: 'Pick the right home', summary: c?.parcelOnly ? `No permit list covers this area. ${i.candidateCount ?? 'One to three'} county ${(i.candidateCount ?? 2) === 1 ? 'parcel nearby has' : 'parcels nearby have'} the same bedrooms and bathrooms as this listing. A person has to confirm which one, if any, using the photos or street view.` : c?.loose ? `${i.candidateCount ?? 'One to three'} permitted ${(i.candidateCount ?? 2) === 1 ? 'home' : 'homes'} nearby are within one bedroom or bath of this listing (county and listing counts often differ). A person has to confirm which one, if any.` : `${i.candidateCount ?? 'Two or three'} permitted homes nearby fit this listing. A person has to choose the right one.`, strongSignals: 0, checks: [{ id: 'registry', label: 'Public STR registry', status: 'warn', detail: 'More than one permitted home matches the size and location. Compare photos or street view to choose.' }], nextStep: 'Compare the listing photos with each candidate address.' };

  // From here the match is unique.
  add('registry', 'Public STR registry', 'pass', `Matched to permit ${o?.permit ?? c?.permit ?? ''}${c ? ` ${c.distanceM} m from the listing's blurred location` : ''}.`);
  if (c) {
    if (c.beds != null && i.bedrooms != null) {
      // County counts and listing counts often differ by a guest room; research that finds the home marketed with the listing's count settles it.
      const ev = o?.research?.bedrooms as { beds?: number; source?: string; note?: string; url?: string } | undefined;
      if (c.beds === i.bedrooms) add('beds', 'Bedrooms agree', 'pass', `Listing ${i.bedrooms} bd, record ${c.beds} bd.`);
      else if (ev?.beds === i.bedrooms) add('beds', 'Bedrooms agree', 'pass', `Listing ${i.bedrooms} bd, county record ${c.beds} bd. ${ev.source ?? 'A public listing'} markets this home with ${ev.beds} bd${ev.note ? `: ${ev.note}` : ''}${ev.url ? ` (${ev.url})` : ''}.`);
      else add('beds', 'Bedrooms agree', 'fail', `Listing ${i.bedrooms} bd, record ${c.beds} bd.`);
    }
    if (c.baths != null && i.bathrooms != null) add('baths', 'Bathrooms agree', Math.abs(c.baths - i.bathrooms) <= 0.5 ? 'pass' : 'fail', `Listing ${i.bathrooms} ba, record ${c.baths} ba.`);
    if (c.distanceM != null) add('distance', 'Location', c.distanceM <= 150 ? 'pass' : 'info', c.distanceM <= 150 ? 'Within 150 m of the listing pin.' : `${c.distanceM} m from the listing pin. Airbnb blurs locations, so this is normal for ${i.address_match_confidence ?? 'low'}-confidence pins.`);
  }

  const names: string[] = o?.names ?? []; const holder = String(o?.permitHolder ?? '');
  const fromPropertyRecord = !!o?.type; // registry-only matches carry the permit holder as the only name, so it is not an independent source
  if (names.length) add('owner', 'Owner of record', fromPropertyRecord ? 'pass' : 'info', fromPropertyRecord ? `${names.join(' & ')} (${o?.type}) on the county property record.` : `${names.join(' & ')}: the permit holder, the only name the registry publishes.`);
  else add('owner', 'Owner of record', 'warn', 'No owner name is available for this property.');

  let strong = 0;
  if (fromPropertyRecord && holder && names.length) {
    if (anyName(names, [holder])) { strong++; add('holder', 'Permit holder = owner of record', 'pass', `Two public records agree: the permit is held by ${holder}.`); }
    else add('holder', 'Permit holder = owner of record', 'warn', `The permit is held by ${holder}, who is not the owner of record. This is often a manager, tenant or co-owner, so ask who runs the rental.`);
  }
  if (o?.ownerOccupied === true) add('occupied', 'Owner-occupied', 'info', 'The owner lives at the property, so this may be a room or part-time rental.');

  const st = o?.skipTrace; const found = (st?.results ?? []).map((r: any) => r.found).filter(Boolean);
  const reg = o?.contact ?? {};
  if (st) {
    if (found.length) {
      const nameOk = found.some((f: any) => anyName([String(f.name)], names));
      if (nameOk) strong++;
      add('skiptrace', 'Skip-trace cross-check', nameOk ? 'pass' : 'warn', `${found.map((f: any) => f.name).join(' & ')}: address history includes the ${st.via === 'property' ? 'property address' : 'county mailing address'}${nameOk ? '' : ', but the name differs from the owner of record'}.`);
      const phones = new Set(found.flatMap((f: any) => (f.phones ?? []).map((p: any) => digits(String(p.e164)))));
      const emails = new Set(found.flatMap((f: any) => (f.emails ?? []).map((e: string) => e.toLowerCase())));
      if (reg.phone || reg.email) {
        const match = (reg.phone && phones.has(digits(String(reg.phone)))) || (reg.email && emails.has(String(reg.email).toLowerCase()));
        if (match) { strong++; add('contact', 'Agency contact = skip-trace contact', 'pass', 'The phone or email the agency publishes also appears for this person in the skip trace.'); }
        else add('contact', 'Agency contact = skip-trace contact', 'warn', 'The contact the agency publishes does not appear in the skip trace. One of them may be a manager or out of date.');
      }
    } else add('skiptrace', 'Skip-trace cross-check', 'warn', 'Searched by owner name and county mailing address, but no person whose history includes that address was found. They may have moved or use a different name.');
  } else {
    const elig = ownerEligibility(o, i);
    if (!elig.eligible) add('skiptrace', 'Skip-trace cross-check', 'info', elig.reason);
    else add('skiptrace', 'Skip-trace cross-check', 'pending', 'Not run yet. It searches the owner by name and county mailing address and only accepts a person whose address history matches.');
  }
  const hs = o?.homesage;
  if (hs?.found) {
    const mailKey = (s: unknown) => String(s ?? '').toUpperCase().replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
    const people = (hs.persons ?? []) as Array<{ name: string; mailing: string | null; doNotContact: boolean; litigator: boolean; tcpaRisk: boolean; deceased: boolean }>;
    const nameOk = people.some(p => anyName([p.name], [...names, holder].filter(Boolean)));
    const mailOk = !!o?.mailing && people.some(p => p.mailing && mailKey(p.mailing) === mailKey(o.mailing));
    const who = people.map(p => p.name).join(' & ');
    if (nameOk || mailOk) { strong++; add('homesage', 'Property owner record', 'pass', `${who} on the property record${mailOk ? ', with the same mailing address as the county record' : ', matching the owner or permit holder'}.`); }
    else add('homesage', 'Property owner record', 'warn', `The property record lists ${who}, who matches neither the permit holder nor the county owner. The home may have been sold or held by someone else, so check before contacting.`);
    for (const p of people.filter(x => x.doNotContact)) add('homesage_flag', 'Do not contact', 'warn', `${p.name} is flagged: ${[p.litigator && 'known litigator', p.tcpaRisk && 'TCPA risk', p.deceased && 'deceased'].filter(Boolean).join(', ')}. Do not text or call.`);
  }
  if (!st && (reg.phone || reg.email)) add('contact', 'Agency contact', 'info', `The agency publishes ${[reg.phone && 'a phone', reg.email && 'an email'].filter(Boolean).join(' and ')} for this permit.`);

  if ((i.sharedAddressCount ?? 1) > 1) add('unique', 'One listing per property', 'fail', `The same property was matched to ${i.sharedAddressCount} listings, so the match cannot be trusted for any of them.`);

  const fails = checks.filter(x => x.status === 'fail').length;
  const canTrace = !st && ownerEligibility(o, i).eligible;
  if (fails) return { level: 'conflict', label: 'Conflict', summary: 'The public records disagree with the listing. Do not contact until it is resolved.', strongSignals: strong, checks, nextStep: 'Check the failed items below by hand.' };
  if (strong >= 2) return { level: 'verified', label: 'Verified', summary: 'Independent sources agree on who owns this home.', strongSignals: strong, checks, nextStep: null };
  if (strong === 1) return { level: 'likely', label: 'Likely owner', summary: 'One independent source backs the registry match.', strongSignals: strong, checks, nextStep: canTrace ? 'Run the skip-trace cross-check for a second confirmation.' : null };
  return { level: 'unconfirmed', label: 'Registry match only', summary: 'Matched to a permit by size and location, with no second source yet.', strongSignals: 0, checks, nextStep: canTrace ? 'Run the skip-trace cross-check to confirm the owner.' : 'Confirm the owner on the county assessor site before contacting.' };
}

export function ownerEligibility(owner: Record<string, any> | null | undefined, ctx?: { matched_address?: string | null }): { eligible: boolean; reason: string; via?: 'mailing' | 'property' } {
  if (!owner?.names?.length) return { eligible: false, reason: 'No owner name on the record.' };
  // County records sometimes label a person an organization (and trusts name their trustee), so the names decide, not the label.
  if (!personalNames(owner).length) return { eligible: false, reason: `The owner of record is a ${owner.type ? String(owner.type).toLowerCase() : 'business or trust'} with no named person, so there is no one to trace. Look up the entity's registered agent.` };
  if (owner.mailing && !/^PO BOX/i.test(String(owner.mailing))) return { eligible: true, reason: '', via: 'mailing' };
  if (ctx?.matched_address && /^\d/.test(ctx.matched_address.trim())) return { eligible: true, reason: '', via: 'property' };
  return { eligible: false, reason: owner.mailing ? 'The mailing address is a PO box, which cannot be confirmed against a person.' : 'No mailing address on the record to confirm a person against.' };
}
