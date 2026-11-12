import { describe, expect, it } from 'vitest';
import { fillScript, scriptsFor, SCRIPTS } from './earnWhileYouWait';

describe('earn-while-you-wait scripts', () => {
  it('has every group filled and unique ids', () => {
    expect(scriptsFor('owner_emails')).toHaveLength(4);
    expect(scriptsFor('owner_replies')).toHaveLength(10);
    expect(scriptsFor('broker_scripts')).toHaveLength(7);
    expect(scriptsFor('broker_objections')).toHaveLength(8);
    expect(new Set(SCRIPTS.map((s) => s.id)).size).toBe(SCRIPTS.length);
  });

  it('never offers to sell, list or refer the sale and never promises income', () => {
    for (const s of SCRIPTS) expect(`${s.subject} ${s.body}`).not.toMatch(/referral|NAVEO Homes|we(?:'ll| will) sell|guarantee/i);
  });

  it('fills what is known and leaves the rest visible', () => {
    const out = fillScript('Hi {{owner_first_name}} / {{broker_first_name}} re {{property_address}} {{phone}}', { ownerName: 'Pat Lee', propertyAddress: '1 Pine St', brokerName: 'Sam Roe' });
    expect(out).toBe('Hi Pat / Sam re 1 Pine St {{phone}}');
  });
});
