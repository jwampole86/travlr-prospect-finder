import { describe, expect, it } from 'vitest';
import { searchNav } from './navSearch';

const groups = [
  { key: 'a', label: 'Outreach', items: [
    { key: 'nav-templates', label: 'Message Templates', href: '/templates' },
    { key: 'nav-email-templates', label: 'Email Templates', href: '/email-templates' },
    { key: 'nav-sms-delivery', label: 'SMS Delivery', href: '/sms-delivery' }
  ] },
  { key: 'b', label: 'Data & Sync', items: [
    { key: 'nav-data-sync', label: 'Data Sync', href: '/data-sync' },
    { key: 'nav-contact-enrichment', label: 'Contact Enrichment', href: '/contact-enrichment' },
    { key: 'nav-templates', label: 'Message Templates', href: '/templates' }
  ] }
];
const desc = (k: string) => ({ 'nav-sms-delivery': 'Delivery status for every text', 'nav-contact-enrichment': 'Find phones and emails for owners' } as Record<string, string>)[k];

describe('menu search', () => {
  it('finds pages by the start of a word, and ranks name matches first', () => {
    expect(searchNav(groups, 'temp', desc).map((h) => h.item.label)).toEqual(['Email Templates', 'Message Templates']);
    expect(searchNav(groups, 'data', desc)[0].item.label).toBe('Data Sync');
  });

  it('also matches the description and the category', () => {
    expect(searchNav(groups, 'phones', desc).map((h) => h.item.label)).toEqual(['Contact Enrichment']);
    expect(searchNav(groups, 'text', desc).map((h) => h.item.label)).toContain('SMS Delivery');
    expect(searchNav(groups, 'outreach', desc).length).toBe(3);
  });

  it('needs every word, lists a page once and returns nothing for an empty or unmatched search', () => {
    expect(searchNav(groups, 'email zzz', desc)).toEqual([]);
    expect(searchNav(groups, '   ', desc)).toEqual([]);
    expect(searchNav(groups, 'message templates', desc)).toHaveLength(1);
  });
});
