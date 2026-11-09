import { describe, expect, it } from 'vitest';
import { CHOICES, CHOICE_ORDER, ENTRY_MARKER, MESSAGES, isEntryQuestion, messagesForChoice, parseChoice, renderMessage } from './outreachCampaign';

describe('reading an owner\'s answer', () => {
  it('takes a clear 1 to 4, however it is typed', () => {
    for (const [text, choice] of [['1', 'sale'], ['2', 'rent_ltr'], ['3', 'rent_str'], ['4', 'both'], ['2.', 'rent_ltr'], ['#3', 'rent_str'], [' Option 1 ', 'sale'], ['reply 4', 'both'], ['Number 2!', 'rent_ltr']] as const) {
      expect(parseChoice(text), text).toBe(choice);
    }
  });

  it('takes a few plain whole-message answers', () => {
    expect(parseChoice('Sell')).toBe('sale');
    expect(parseChoice('long-term')).toBe('rent_ltr');
    expect(parseChoice('Short term rental')).toBe('rent_str');
    expect(parseChoice('Both')).toBe('both');
    expect(parseChoice('still deciding')).toBe('both');
  });

  it('leaves everything else for a person: longer messages, other numbers, refusals', () => {
    for (const text of ['', '5', '0', '12', '1 2', "I'm not selling, but maybe a rental", 'not selling', 'no', 'yes', 'call me at 2pm', '3 bedrooms', 'STOP']) {
      expect(parseChoice(text), text).toBeNull();
    }
  });
});

describe('the messages', () => {
  it('has a text and an email for each of the four answers, and a first and follow-up message', () => {
    for (const c of CHOICE_ORDER) expect(messagesForChoice(c).map((m) => m.channel).sort()).toEqual(['email', 'sms']);
    expect(MESSAGES.filter((m) => m.step === 'entry').map((m) => m.channel).sort()).toEqual(['email', 'sms']);
    expect(MESSAGES.filter((m) => m.step === 'follow_up')).toHaveLength(2);
    expect(new Set(MESSAGES.map((m) => m.id)).size).toBe(MESSAGES.length);
  });

  it('numbers the answers 1 to 4 in the order the question lists them', () => {
    expect(CHOICE_ORDER.map((c) => CHOICES[c].number)).toEqual([1, 2, 3, 4]);
  });

  it('keeps the marker in both texts that ask the question, and opt-out wording on every cold text', () => {
    const asking = MESSAGES.filter((m) => m.id === 'entry-sms' || m.id === 'followup-day3-sms');
    expect(asking).toHaveLength(2);
    for (const m of asking) {
      expect(isEntryQuestion(renderMessage(m.body, { first_name: 'Sam' }))).toBe(true);
      expect(m.body).toContain('Reply STOP to opt out.');
    }
    expect(isEntryQuestion('Reply with 1, 2, 3 or 4')).toBe(true);
    expect(isEntryQuestion('reply with 1, 2, 3 OR 4 please')).toBe(true);
    expect(isEntryQuestion('Reply YES for a call')).toBe(false);
    expect(isEntryQuestion(null)).toBe(false);
    expect(ENTRY_MARKER).toBe('Reply with 1, 2, 3 or 4');
  });

  it('keeps the compliance promises: no price or sale guarantee, and the branch messages do not claim anything automatic', () => {
    const sale = messagesForChoice('sale').map((m) => m.body).join('\n');
    expect(sale).toMatch(/not a listing appointment/i);
    expect(sale).toMatch(/will not make any promises about price or sale/i);
    for (const m of MESSAGES) {
      expect(m.body).not.toMatch(/guarantee|we will buy|cash offer|your home is worth/i);
      expect(m.body).not.toContain('click');
    }
  });

  it('fills in the owner\'s details, with plain fallbacks', () => {
    const entry = MESSAGES.find((m) => m.id === 'entry-sms')!;
    const filled = renderMessage(entry.body, { first_name: 'Sam', agent_name: 'Jen', address: '12 Pine St, Denver' });
    expect(filled).toContain('Hi Sam, this is Jen with NAVEO / AVYRO.');
    expect(filled).toContain('12 Pine St, Denver');
    expect(filled).not.toContain('{{');
    expect(renderMessage('Hi {{ first_name }} about {{address}} from {{agent_name}}')).toBe('Hi there about your property from your AVYRO team');
  });
});
