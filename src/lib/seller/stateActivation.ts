/**
 * State activation for broker referrals. A state is only used once someone has checked the state's rules and counsel has signed off, in the
 * order seller-intent volume appears (not all 51 at once). The same four questions are answered for every state; the rest of the
 * arrangement (percentage, protection period, reporting) is commercial and lives in the partner agreement.
 */
export const JURISDICTIONS: ReadonlyArray<{ code: string; name: string; regulator: string }> = [
  ['AL', 'Alabama', 'Alabama Real Estate Commission'], ['AK', 'Alaska', 'Alaska Real Estate Commission'], ['AZ', 'Arizona', 'Arizona Department of Real Estate (ADRE)'],
  ['AR', 'Arkansas', 'Arkansas Real Estate Commission'], ['CA', 'California', 'California Department of Real Estate (DRE)'], ['CO', 'Colorado', 'Colorado Division of Real Estate (DORA)'],
  ['CT', 'Connecticut', 'Connecticut Real Estate Commission'], ['DE', 'Delaware', 'Delaware Real Estate Commission'], ['DC', 'District of Columbia', 'DC Real Estate Commission'],
  ['FL', 'Florida', 'Florida DBPR / Florida Real Estate Commission'], ['GA', 'Georgia', 'Georgia Real Estate Commission'], ['HI', 'Hawaii', 'Hawaii Real Estate Commission'],
  ['ID', 'Idaho', 'Idaho Real Estate Commission'], ['IL', 'Illinois', 'Illinois Department of Financial and Professional Regulation'], ['IN', 'Indiana', 'Indiana Real Estate Commission'],
  ['IA', 'Iowa', 'Iowa Real Estate Commission'], ['KS', 'Kansas', 'Kansas Real Estate Commission'], ['KY', 'Kentucky', 'Kentucky Real Estate Commission'],
  ['LA', 'Louisiana', 'Louisiana Real Estate Commission'], ['ME', 'Maine', 'Maine Real Estate Commission'], ['MD', 'Maryland', 'Maryland Real Estate Commission'],
  ['MA', 'Massachusetts', 'Massachusetts Board of Registration of Real Estate Brokers and Salespeople'], ['MI', 'Michigan', 'Michigan Department of Licensing and Regulatory Affairs (LARA)'],
  ['MN', 'Minnesota', 'Minnesota Department of Commerce'], ['MS', 'Mississippi', 'Mississippi Real Estate Commission'], ['MO', 'Missouri', 'Missouri Real Estate Commission'],
  ['MT', 'Montana', 'Montana Board of Realty Regulation'], ['NE', 'Nebraska', 'Nebraska Real Estate Commission'], ['NV', 'Nevada', 'Nevada Real Estate Division (NRED)'],
  ['NH', 'New Hampshire', 'New Hampshire Real Estate Commission'], ['NJ', 'New Jersey', 'New Jersey Real Estate Commission'], ['NM', 'New Mexico', 'New Mexico Real Estate Commission'],
  ['NY', 'New York', 'New York Department of State'], ['NC', 'North Carolina', 'North Carolina Real Estate Commission'], ['ND', 'North Dakota', 'North Dakota Real Estate Commission'],
  ['OH', 'Ohio', 'Ohio Division of Real Estate'], ['OK', 'Oklahoma', 'Oklahoma Real Estate Commission'], ['OR', 'Oregon', 'Oregon Real Estate Agency'],
  ['PA', 'Pennsylvania', 'Pennsylvania Real Estate Commission'], ['RI', 'Rhode Island', 'Rhode Island Department of Business Regulation'], ['SC', 'South Carolina', 'South Carolina Real Estate Commission'],
  ['SD', 'South Dakota', 'South Dakota Real Estate Commission'], ['TN', 'Tennessee', 'Tennessee Real Estate Commission'], ['TX', 'Texas', 'Texas Real Estate Commission (TREC)'],
  ['UT', 'Utah', 'Utah Division of Real Estate'], ['VT', 'Vermont', 'Vermont Real Estate Commission'], ['VA', 'Virginia', 'Virginia Real Estate Board (DPOR)'],
  ['WA', 'Washington', 'Washington Department of Licensing'], ['WV', 'West Virginia', 'West Virginia Real Estate Commission'], ['WI', 'Wisconsin', 'Wisconsin Real Estate Examining Board'],
  ['WY', 'Wyoming', 'Wyoming Real Estate Commission']
].map(([code, name, regulator]) => ({ code, name, regulator }));

export type Answer = 'yes' | 'no' | 'unknown';
export type ActivationStatus = 'not_active' | 'pilot' | 'live';

export interface ActivationRow {
  state: string;
  status: ActivationStatus;
  /** The four questions every state is checked against. */
  brokers_can_pay: Answer;
  unlicensed_payee_allowed: Answer;
  must_pay_through_brokerage: Answer;
  written_agreement_required: Answer;
  out_of_state_notes: string | null;
  lookup_url: string | null;
  citations: string | null;
  counsel_name: string | null;
  counsel_reviewed_at: string | null;
  notes: string | null;
}

export const ACTIVATION_QUESTIONS = [
  { key: 'brokers_can_pay', label: 'Can a licensed broker pay and receive a referral fee?', expect: 'yes' },
  { key: 'unlicensed_payee_allowed', label: 'Can an unlicensed person be paid for a referral?', expect: 'no' },
  { key: 'must_pay_through_brokerage', label: 'Must the fee be paid through the brokerage?', expect: 'yes' },
  { key: 'written_agreement_required', label: 'Is a written referral agreement required (or treated as reasonable cause)?', expect: 'yes' }
] as const;

/** What was already researched for the priority states. Counsel still has to confirm each before the first paid referral. */
export const PRIORITY_NOTES: Record<string, { lookup_url: string; citations: string; out_of_state_notes: string }> = {
  AZ: { lookup_url: 'https://services.azre.gov/PdbWeb/', citations: 'A.R.S. 32-2155 (compensation to licensees only); a salesperson is paid only through the employing broker.', out_of_state_notes: 'An out-of-state licensee typically needs an Arizona license or a compliant structure to be paid on Arizona activity.' },
  NV: { lookup_url: 'https://www.red.nv.gov/online-services/license-lookup/', citations: 'NRS Chapter 645, NRS 645.280.', out_of_state_notes: 'A broker may pay a licensed out-of-state broker; a salesperson is paid only through their broker.' },
  CO: { lookup_url: 'https://apps2.colorado.gov/dre/licensing/lookup/licenselookup.aspx', citations: 'C.R.S. 12-10-304: RESPA plus reasonable cause (an actual introduction, a contractual referral relationship or a cooperative brokerage relationship).', out_of_state_notes: 'Only Colorado-licensed brokerage firms are generally paid on Colorado transactions; an out-of-state payee needs counsel review.' }
};

export const emptyActivation = (state: string): ActivationRow => ({
  state, status: 'not_active', brokers_can_pay: 'unknown', unlicensed_payee_allowed: 'unknown', must_pay_through_brokerage: 'unknown', written_agreement_required: 'unknown',
  out_of_state_notes: PRIORITY_NOTES[state]?.out_of_state_notes ?? null, lookup_url: PRIORITY_NOTES[state]?.lookup_url ?? null, citations: PRIORITY_NOTES[state]?.citations ?? null,
  counsel_name: null, counsel_reviewed_at: null, notes: null
});

export const isJurisdiction = (code: string) => JURISDICTIONS.some((j) => j.code === code);

/** What stops a lead in this state from being sent to a partner: the state must be switched on, with counsel's review recorded and the key answers in. */
export function stateBlockers(row: Partial<ActivationRow> | null | undefined, state: string | null | undefined): string[] {
  if (!state) return ['The lead has no state, so its rules cannot be checked.'];
  const j = JURISDICTIONS.find((x) => x.code === state.toUpperCase());
  if (!j) return [`${state} is not a US state or DC.`];
  const out: string[] = [];
  if (!row || row.status === 'not_active' || !row.status) out.push(`${j.name} is not switched on for broker referrals yet.`);
  if (!row?.counsel_reviewed_at) out.push(`Counsel has not signed off on ${j.name}.`);
  if (!row || row.brokers_can_pay !== 'yes' || row.unlicensed_payee_allowed === 'yes') out.push(`The ${j.name} checklist does not yet show that licensed brokers may pay referral fees and unlicensed people may not.`);
  return out;
}

/** The partner must hold a license in the property's state (their license state or any state they are listed to serve). */
export function partnerCoversState(p: { license_state?: string | null; states?: string[] | null }, state: string | null | undefined): boolean {
  if (!state) return false;
  const s = state.toUpperCase();
  return (p.license_state ?? '').toUpperCase() === s || (p.states ?? []).map((x) => x.toUpperCase()).includes(s);
}

export function activationProgress(rows: ActivationRow[]) {
  const by = (st: ActivationStatus) => rows.filter((r) => r.status === st).length;
  return { live: by('live'), pilot: by('pilot'), notActive: JURISDICTIONS.length - by('live') - by('pilot'), counselReviewed: rows.filter((r) => r.counsel_reviewed_at).length };
}

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** The tracker as a spreadsheet (one row per state and DC). */
export function activationCsv(rows: ActivationRow[]): string {
  const head = ['State', 'Jurisdiction', 'Regulator', 'Status', 'Brokers can pay', 'Unlicensed payee allowed', 'Must pay through brokerage', 'Written agreement required', 'Out-of-state rules', 'License lookup', 'Citations', 'Counsel', 'Counsel reviewed', 'Notes'];
  const by = new Map(rows.map((r) => [r.state, r]));
  const lines = JURISDICTIONS.map((j) => {
    const r = by.get(j.code) ?? emptyActivation(j.code);
    return [j.code, j.name, j.regulator, r.status, r.brokers_can_pay, r.unlicensed_payee_allowed, r.must_pay_through_brokerage, r.written_agreement_required, r.out_of_state_notes, r.lookup_url, r.citations, r.counsel_name, r.counsel_reviewed_at?.slice(0, 10), r.notes].map(csvCell).join(',');
  });
  return [head.map(csvCell).join(','), ...lines].join('\n');
}
