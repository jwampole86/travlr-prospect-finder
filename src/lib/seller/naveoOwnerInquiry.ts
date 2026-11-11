/** Reads and bounds the owner inquiry NAVEO Stays sends, so nothing unchecked reaches the database. */
export type NaveoOwnerInquiry = {
  submissionId: string | null;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  location: string | null;
  propertyType: string | null;
  portfolioSize: string | null;
  currentSetup: string | null;
  message: string | null;
  source: string | null;
  referralCode: string | null;
  /** True when someone else gave us this owner's details, so the owner has not asked for anything or agreed to be contacted. */
  referred: boolean;
};

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function parseOwnerInquiry(body: unknown): { ok: true; value: NaveoOwnerInquiry } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = text(b.email, 200)?.toLowerCase() ?? null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'a valid email is required' };
  const submissionId = text(b.submission_id, 64);
  if (submissionId && !/^[A-Za-z0-9_-]{1,64}$/.test(submissionId)) return { ok: false, error: 'submission_id is not valid' };
  return {
    ok: true,
    value: {
      submissionId,
      name: text(b.name, 120) ?? email,
      email,
      phone: text(b.phone, 40),
      address: text(b.address, 200),
      location: text(b.property_location, 120),
      propertyType: text(b.property_type, 40),
      portfolioSize: text(b.portfolio_size, 40),
      currentSetup: text(b.current_setup, 60),
      message: text(b.message, 1000),
      source: text(b.source, 80),
      referralCode: text(b.referral_code, 40),
      referred: b.referred === true,
    },
  };
}

/** An owner who asked for a rental analysis made an explicit request for management, not a sale, so the intent keeps the rental. */
export function ownerInquiryIntent(i: NaveoOwnerInquiry) {
  if (i.referred) return { level: 'possible' as const, score: 35, timeline: null, keepsRental: true, signals: ['Referred to NAVEO Stays by an existing owner; has not contacted us'] };
  const signals = ['Asked NAVEO Stays for a rental-management analysis'];
  let score = 60;
  if (i.phone) { score += 5; signals.push('Gave a phone number'); }
  if (i.currentSetup === 'Self-managing' || i.currentSetup === 'Using a property manager') { score += 5; signals.push(`Currently: ${i.currentSetup}`); }
  return { level: 'explicit' as const, score, timeline: null, keepsRental: true, signals };
}
