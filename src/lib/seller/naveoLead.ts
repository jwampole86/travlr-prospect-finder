/** Reads and bounds the seller submission NAVEO Homes sends, so nothing unchecked reaches the database. */
export type NaveoLead = {
  submissionId: string | null;
  name: string;
  email: string;
  phone: string | null;
  address: string;
  city: string | null;
  state: string | null;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  condition: string | null;
  timelineMonths: number | null;
  strInterest: boolean;
  followUpConsent: boolean;
  notes: string | null;
};

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const count = (v: unknown, max: number): number | null => {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

export function parseNaveoLead(body: unknown): { ok: true; value: NaveoLead } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = text(b.email, 200)?.toLowerCase() ?? null;
  const address = text(b.address, 200);
  if (!address) return { ok: false, error: 'address is required' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'a valid email is required' };
  const state = text(b.state, 20);
  return {
    ok: true,
    value: {
      submissionId: text(b.submission_id, 64),
      name: text(b.name, 120) ?? email,
      email,
      phone: text(b.phone, 40),
      address,
      city: text(b.city, 80),
      state: state && state.length === 2 ? state.toUpperCase() : state,
      propertyType: text(b.property_type, 40),
      beds: count(b.beds, 50),
      baths: count(b.baths, 50),
      condition: text(b.condition, 40),
      timelineMonths: count(b.timeline_months, 120),
      strInterest: b.str_interest === true,
      followUpConsent: b.follow_up_consent === true,
      notes: text(b.notes, 1000),
    },
  };
}

/** A seller who submitted the form asked for a sale analysis, so this is an explicit signal; a short timeline and a phone number raise it. */
export function naveoIntent(lead: NaveoLead) {
  const signals = ['Submitted the NAVEO sell form'];
  let score = 70;
  if (lead.timelineMonths !== null && lead.timelineMonths <= 3) { score += 10; signals.push('Plans to sell within 3 months'); }
  if (lead.phone) { score += 5; signals.push('Gave a phone number'); }
  if (lead.strInterest) signals.push('Asked about rental income while selling');
  const timeline = lead.timelineMonths === null ? null : lead.timelineMonths === 0 ? 'asap' : `${lead.timelineMonths} month${lead.timelineMonths === 1 ? '' : 's'}`;
  return { level: 'explicit' as const, score, timeline, keepsRental: false, signals };
}
