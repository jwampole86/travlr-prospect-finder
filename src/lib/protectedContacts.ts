/**
 * People the company must never text or add to a campaign: the owners' own properties, so a lead for one of their homes can never be
 * contacted by accident. Matching is by name so it still holds if the same person is imported again under a new phone number.
 * Phone numbers for these people belong in the sms_suppressions table, which every send path also checks.
 *
 * Protected: Jennifer Wampole and Spencer Wampole. The surname is matched on its own so a trust or LLC that carries the family name
 * ("Wampole Family Trust") is covered too.
 */
const PROTECTED_SURNAMES = ['wampole'];

const tokens = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(Boolean);

/** True when any of the given names (owner, contact, a combined "A & B" name) belongs to a protected person. */
export function isProtectedContact(...names: Array<string | null | undefined>): boolean {
  return names.some((n) => !!n && tokens(n).some((t) => PROTECTED_SURNAMES.includes(t)));
}
