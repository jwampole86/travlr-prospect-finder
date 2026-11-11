import { describe, expect, it } from 'vitest';
import { ownerInquiryIntent, parseOwnerInquiry } from './naveoOwnerInquiry';

describe('parseOwnerInquiry', () => {
  it('requires a valid email and a safe submission id', () => {
    expect(parseOwnerInquiry({ name: 'A' }).ok).toBe(false);
    expect(parseOwnerInquiry({ email: 'nope' }).ok).toBe(false);
    expect(parseOwnerInquiry({ email: 'a@b.co', submission_id: 'x y' }).ok).toBe(false);
  });

  it('bounds and normalizes the fields', () => {
    const r = parseOwnerInquiry({ email: ' A@B.CO ', name: ' Pat ', message: 'x'.repeat(5000), property_location: 'Las Vegas', submission_id: 'abc-1' });
    expect(r.ok && r.value.email).toBe('a@b.co');
    expect(r.ok && r.value.message?.length).toBe(1000);
    expect(r.ok && r.value.address).toBeNull();
  });

  it('treats a referred owner as a weak signal, not their own request', () => {
    const r = parseOwnerInquiry({ email: 'a@b.co', referred: true, phone: '555' });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.referred).toBe(true);
    expect(ownerInquiryIntent(r.value)).toMatchObject({ level: 'possible', score: 35, keepsRental: true });
  });

  it('keeps the rental and never reads as a sale', () => {
    const r = parseOwnerInquiry({ email: 'a@b.co', phone: '555', current_setup: 'Self-managing' });
    if (!r.ok) throw new Error('expected ok');
    const intent = ownerInquiryIntent(r.value);
    expect(intent.keepsRental).toBe(true);
    expect(intent.score).toBe(70);
  });
});
