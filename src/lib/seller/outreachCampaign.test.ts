import { describe, expect, it } from 'vitest';
import { CHOICES, CHOICE_ORDER, ENTRY_MARKER, MESSAGES, READY_CAMPAIGNS, SALE_MESSAGES, emailFooter, isEntryQuestion, messagesForChoice, messagesForListing, parseChoice, renderMessage } from './outreachCampaign';

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
    for (const l of ['rent', 'sale'] as const) {
      expect(messagesForListing(l, 'entry').map((m) => m.channel).sort()).toEqual(['email', 'sms']);
      expect(messagesForListing(l, 'follow_up')).toHaveLength(2);
    }
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

  it('names the NAVEO that matches the property in the first messages, and never names TRAVLR anywhere', () => {
    for (const m of messagesForListing('rent', 'entry')) {
      expect(renderMessage(m.body, { brand: 'NAVEO Stays' })).toContain('NAVEO Stays');
      expect(renderMessage(m.body, { brand: 'NAVEO Homes' })).toContain('NAVEO Homes');
      expect(renderMessage(m.body, { brand: 'NAVEO Homes' })).not.toContain('NAVEO Stays');
    }
    for (const m of MESSAGES) expect(JSON.stringify(m)).not.toMatch(/travlr/i);
  });

  it('a home for sale is offered help selling through NAVEO Homes, never property management', () => {
    expect(SALE_MESSAGES.length).toBe(4);
    for (const m of SALE_MESSAGES) {
      const text = renderMessage(m.body + ' ' + (m.subjects ?? []).join(' '), { brand: 'NAVEO Homes' });
      expect(text).not.toMatch(/manag|STR\b|management fee|travlr/i);
      expect(text).not.toMatch(/guarantee|we will buy|cash offer|your home is worth/i);
      expect(isEntryQuestion(text)).toBe(false);
    }
    const first = renderMessage(messagesForListing('sale', 'entry').find((m) => m.channel === 'sms')!.body, { brand: 'NAVEO Homes' });
    expect(first).toContain('we connect owners with a licensed local broker to guide the sale');
    expect(first).toContain('NAVEO Stays may be able to run it as a short-term rental');
    expect(first).toContain('Worth a short conversation?');
    expect(first).toContain('STOP to opt out');
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
    const filled = renderMessage(entry.body, { first_name: 'Sam', agent_name: 'Jen', address: '12 Pine St, Denver', brand: 'NAVEO Homes' });
    expect(filled).toContain('Hi Sam, this is Jen with NAVEO Homes.');
    expect(filled).toContain('12 Pine St, Denver');
    expect(filled).not.toContain('{{');
    expect(renderMessage('Hi {{ first_name }} about {{address}} from {{agent_name}}')).toBe('Hi there about your property from the NAVEO team');
    expect(renderMessage('{{brand}}')).toBe('NAVEO');
  });
});

describe('the ready-made campaigns', () => {
  const all = READY_CAMPAIGNS.flatMap((c) => c.messages.map((m) => ({ c, m })));
  const render = (m: (typeof all)[number]) => renderMessage(m.m.body + ' ' + (m.m.subjects ?? []).join(' '), { first_name: 'Sam', address: '1 Main St', agent_name: 'Jo', brand: m.c.brand === 'homes' ? 'NAVEO Homes' : 'NAVEO Stays' });

  it('covers the four campaigns and keeps every id unique', () => {
    expect(READY_CAMPAIGNS.map((c) => c.id)).toEqual(['homes-valuation', 'homes-dual-path', 'stays-owner', 'stays-bridge']);
    const ids = [...MESSAGES, ...all.map((x) => x.m)].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts the opt-out line on every text, and says who must have agreed before any message', () => {
    for (const x of all) if (x.m.channel === 'sms') expect(x.m.body, x.m.id).toContain('Reply STOP to opt out.');
    for (const c of READY_CAMPAIGNS) { expect(c.consent.length).toBeGreaterThan(20); expect(c.audience.length).toBeGreaterThan(10); }
    expect(READY_CAMPAIGNS.find((c) => c.id === 'stays-bridge')?.consent).toMatch(/rental follow-up/i);
  });

  it('never shows an owner the name AVYRO or TRAVLR, even with no names filled in', () => {
    for (const x of all) expect(render(x), x.m.id).not.toMatch(/avyro|travlr|powered by/i);
    for (const m of MESSAGES) expect(renderMessage(m.body, {}), m.id).not.toMatch(/avyro/i);
    expect(renderMessage('{{agent_name}}')).toBe('the NAVEO team');
  });

  it('fills in the links, and only says what the sites really say', () => {
    for (const x of all) {
      const text = render(x);
      expect(text, x.m.id).not.toMatch(/\{\{/);
      expect(text, x.m.id).not.toMatch(/quality-checked|guarantee(?!d)|we will buy|cash offer|your home is worth|strong candidate|keep more/i);
    }
    expect(render(all.find((x) => x.m.id === 'rc-homes-email-1')!)).toContain('https://naveohomes.com/sell');
    expect(render(all.find((x) => x.m.id === 'rc-stays-email-1')!)).toContain('https://staynaveo.com/for-owners');
    for (const id of ['rc-homes-email-1', 'rc-homes-email-2']) expect(render(all.find((x) => x.m.id === id)!)).toMatch(/not an appraisal|isn't guaranteed/);
  });

  it('writes the email footer with the mailing address, or a visible reminder when it is missing', () => {
    expect(emailFooter({ brand: 'NAVEO Homes', company_address: '1 Main St, Reno, NV 89501' })).toContain('NAVEO Homes, 1 Main St, Reno, NV 89501');
    expect(emailFooter({ brand: 'NAVEO Homes' })).toMatch(/^--\nNAVEO Homes\n/);
    expect(emailFooter({})).toMatch(/unsubscribe/);
  });
});
