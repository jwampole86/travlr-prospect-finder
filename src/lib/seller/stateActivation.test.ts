import { describe, expect, it } from 'vitest';
import { ACTIVATION_QUESTIONS, JURISDICTIONS, activationCsv, activationProgress, emptyActivation, partnerCoversState, stateBlockers, type ActivationRow } from './stateActivation';
import { settlementTermsWarning } from './settlementPolicy';

const cleared = (state: string, over: Partial<ActivationRow> = {}): ActivationRow => ({ ...emptyActivation(state), status: 'pilot', brokers_can_pay: 'yes', unlicensed_payee_allowed: 'no', must_pay_through_brokerage: 'yes', written_agreement_required: 'yes', counsel_name: 'A. Counsel', counsel_reviewed_at: '2026-11-10T00:00:00Z', ...over });

describe('the 51 jurisdictions', () => {
  it('lists every state and DC once, each with a regulator', () => {
    expect(JURISDICTIONS).toHaveLength(51);
    expect(new Set(JURISDICTIONS.map((j) => j.code)).size).toBe(51);
    expect(JURISDICTIONS.find((j) => j.code === 'DC')?.name).toBe('District of Columbia');
    expect(JURISDICTIONS.every((j) => j.regulator.length > 5)).toBe(true);
    expect(ACTIVATION_QUESTIONS).toHaveLength(4);
  });

  it('starts every state switched off, with the researched notes only for Arizona, Nevada and Colorado', () => {
    expect(emptyActivation('TX')).toMatchObject({ status: 'not_active', lookup_url: null, counsel_reviewed_at: null });
    expect(emptyActivation('AZ').lookup_url).toContain('azre.gov');
    expect(emptyActivation('NV').citations).toContain('645');
    expect(emptyActivation('CO').citations).toContain('12-10-304');
  });
});

describe('clearing a state before a lead is sent there', () => {
  it('is blocked until the state is on, counsel signed off and the checklist answers are in', () => {
    expect(stateBlockers(null, 'AZ')).toHaveLength(3);
    expect(stateBlockers(emptyActivation('AZ'), 'AZ')).toHaveLength(3);
    expect(stateBlockers(cleared('AZ', { counsel_reviewed_at: null }), 'AZ')).toEqual(['Counsel has not signed off on Arizona.']);
    expect(stateBlockers(cleared('AZ', { brokers_can_pay: 'unknown' }), 'AZ')).toHaveLength(1);
    expect(stateBlockers(cleared('AZ', { unlicensed_payee_allowed: 'yes' }), 'AZ')).toHaveLength(1);
    expect(stateBlockers(cleared('AZ'), 'az')).toEqual([]);
    expect(stateBlockers(cleared('CO', { status: 'live' }), 'CO')).toEqual([]);
  });

  it('cannot check a lead with no state or a state that does not exist', () => {
    expect(stateBlockers(cleared('AZ'), null)).toHaveLength(1);
    expect(stateBlockers(cleared('AZ'), 'ZZ')[0]).toMatch(/not a US state/);
  });

  it('needs a partner licensed in, or listed to serve, the property\'s state', () => {
    expect(partnerCoversState({ license_state: 'AZ' }, 'az')).toBe(true);
    expect(partnerCoversState({ license_state: 'AZ', states: ['NV'] }, 'NV')).toBe(true);
    expect(partnerCoversState({ license_state: 'AZ', states: [] }, 'CO')).toBe(false);
    expect(partnerCoversState({}, 'CO')).toBe(false);
    expect(partnerCoversState({ license_state: 'AZ' }, null)).toBe(false);
  });
});

describe('the tracker as a spreadsheet', () => {
  it('has a header and a row for every jurisdiction, with counts', () => {
    const rows = [cleared('AZ'), cleared('NV', { status: 'live' })];
    const lines = activationCsv(rows).split('\n');
    expect(lines).toHaveLength(52);
    expect(lines[0]).toContain('Counsel reviewed');
    expect(lines.find((l) => l.startsWith('AZ,'))).toContain('pilot');
    expect(lines.find((l) => l.startsWith('TX,'))).toContain('not_active');
    expect(activationProgress(rows)).toEqual({ live: 1, pilot: 1, notActive: 49, counselReviewed: 2 });
  });
});

describe('escrow and title', () => {
  it('warns when compensation terms read like a settlement-service referral fee', () => {
    expect(settlementTermsWarning('25% of the referred side commission')).toBeNull();
    expect(settlementTermsWarning('$300 per closing from the title company')).toMatch(/RESPA/);
    expect(settlementTermsWarning('Escrow fee share')).toMatch(/counsel/);
    expect(settlementTermsWarning(null)).toBeNull();
  });
});
