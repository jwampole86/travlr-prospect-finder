import { describe, expect, it } from 'vitest';
import { findOwnedListing, ownerEmailFrom, ownerFilter, parseEmailList } from './owner';
import { ownerListing } from './listings';

const req = (email?: string) => ({ headers: new Headers(email === undefined ? {} : { 'x-owner-email': email }) }) as never;

describe('ownerEmailFrom', () => {
  it('lowercases a valid email and rejects anything else', () => {
    expect(ownerEmailFrom(req(' Owner@Example.COM '))).toBe('owner@example.com');
    expect(ownerEmailFrom(req())).toBeNull();
    expect(ownerEmailFrom(req('not-an-email'))).toBeNull();
    expect(ownerEmailFrom(req('a@b.co, c@d.co'))).toBeNull();
  });
});

describe('findOwnedListing', () => {
  it('always filters by the organization and the owner email', async () => {
    const calls: Array<[string, unknown]> = [];
    const orCalls: string[] = [];
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.or = (f: string) => { orCalls.push(f); return q; };
    q.eq = (c: string, v: unknown) => { calls.push([c, v]); return q; };
    q.maybeSingle = async () => ({ data: null });
    const db = { from: () => q } as never;
    await findOwnedListing(db, 'org1', 'f7a47311-fc6f-4e23-9d95-d395596f91db', 'o@x.co');
    expect(calls).toContainEqual(['organization_id', 'org1']);
    expect(calls).not.toContainEqual(['owner_email', 'o@x.co']);
    expect(orCalls).toContain('owner_email.eq.o@x.co,authorized_emails.cs.{o@x.co}');
    expect(calls).toContainEqual(['id', 'f7a47311-fc6f-4e23-9d95-d395596f91db']);
  });
});

describe('ownerListing', () => {
  it('shows state and price but no owner or private fields', () => {
    const out = ownerListing({ id: 'l', title: 'T', status: 'paused', quality_approved: true, price_per_night: '200', images: ['a'], attributes: { rating: 4.5, review_count: 3 }, owner_email: 'o@x.co', private_details: {} });
    expect(out).toMatchObject({ status: 'paused', price_per_night: 200, image: 'a', rating: 4.5, review_count: 3 });
    expect(out).not.toHaveProperty('owner_email');
    expect(out).not.toHaveProperty('private_details');
  });
});

describe('co-owner access', () => {
  it('matches the primary owner or an authorized email', () => {
    expect(ownerFilter('c@x.co')).toBe('owner_email.eq.c@x.co,authorized_emails.cs.{c@x.co}');
  });
  it('rejects emails that could change a database filter', () => {
    expect(ownerEmailFrom(req('a@b.co,owner_email.neq.x'))).toBeNull();
    expect(ownerEmailFrom(req('a@b.co}'))).toBeNull();
    expect(ownerEmailFrom(req('"a"@b.co'))).toBeNull();
  });
  it('parses a typed list of authorized emails', () => {
    expect(parseEmailList('A@x.co, b@y.co; a@x.co')).toEqual(['a@x.co', 'b@y.co']);
    expect(parseEmailList('')).toEqual([]);
    expect(parseEmailList('ok@x.co, not an email')).toBeNull();
    expect(parseEmailList(Array.from({ length: 11 }, (_, i) => `u${i}@x.co`))).toBeNull();
  });
});
