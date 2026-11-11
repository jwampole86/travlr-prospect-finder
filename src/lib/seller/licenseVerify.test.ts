import { describe, expect, it } from 'vitest';
import { nameMatches, parseCsvLine, sameLicenseNumber, scanArizonaCsv, verifyLicense } from './licenseVerify';

const stream = (text: string, chunk = 40) => new ReadableStream<Uint8Array>({
  start(c) { const b = new TextEncoder().encode(text); for (let i = 0; i < b.length; i += chunk) c.enqueue(b.slice(i, i + chunk)); c.close(); }
});
const HEAD = '"LastName","FirstName","MiddleName","OriginalDate","ExpireDate","LicNumber","LicCategory","LicType","LicStatus","EmploymentType","EmployerLegalName","EmployerDBAName"';
const az = (over: Record<string, string> = {}) => {
  const r = { last: 'CHEN', first: 'SARAH', mid: '', orig: '1/1/2010 12:00:00 AM', exp: '1/31/2027 12:00:00 AM', num: 'BR108787000   ', cat: 'Real Estate', type: 'Broker', status: 'Active', emp: 'Self Employed Broker', legal: 'DESERT PEAK REALTY LLC', dba: 'DESERT PEAK', ...over };
  return `"${r.last}","${r.first}","${r.mid}","${r.orig}","${r.exp}","${r.num}","${r.cat}","${r.type}","${r.status}","${r.emp}","${r.legal}","${r.dba}"`;
};
const csv = (...rows: string[]) => [HEAD, ...rows].join('\r\n');

describe('license numbers and names', () => {
  it('match once punctuation and spaces are gone, or by the digits alone', () => {
    expect(sameLicenseNumber('br 108787000', 'BR108787000   ')).toBe(true);
    expect(sameLicenseNumber('108787000', 'BR108787000')).toBe(true);
    expect(sameLicenseNumber('108787', 'BR108787000')).toBe(false);
    expect(sameLicenseNumber('', 'BR1')).toBe(false);
  });

  it('accepts the partner when the last name or brokerage on the record is theirs, and not otherwise', () => {
    expect(nameMatches('Sarah Chen', null, ['Sarah Chen - Desert Peak Team'])).toBe(true);
    expect(nameMatches('Ann Rivera', 'DESERT PEAK REALTY LLC', ['Sarah Chen', 'Desert Peak Realty'])).toBe(true);
    expect(nameMatches('Tom Baker', 'Other Realty', ['Sarah Chen', 'Desert Peak Realty'])).toBe(false);
    expect(nameMatches('Tom Baker', null, [null, undefined])).toBe(false);
  });

  it('reads quoted CSV fields', () => {
    expect(parseCsvLine('"A, B","say ""hi""",c')).toEqual(['A, B', 'say "hi"', 'c']);
  });
});

describe('Arizona records', () => {
  it('finds a license in a download that arrives in small pieces', async () => {
    const rec = await scanArizonaCsv(stream(csv(az({ num: 'BR000001', last: 'OTHER' }), az(), az({ num: 'SA555' }))), 'BR108787000');
    expect(rec).toMatchObject({ LastName: 'CHEN', LicNumber: 'BR108787000', LicStatus: 'Active' });
    expect(await scanArizonaCsv(stream(csv(az())), 'BR999')).toBeNull();
  });

  const fetchAz = (text: string) => (async () => new Response(stream(text))) as never;
  it('verifies an active license held by the partner', async () => {
    const r = await verifyLicense('AZ', 'BR108787000', ['Sarah Chen'], fetchAz(csv(az())));
    expect(r).toMatchObject({ outcome: 'verified', record: { name: 'SARAH CHEN', employer: 'DESERT PEAK REALTY LLC' } });
    expect(r.message).toMatch(/Active Real Estate Broker/);
  });
  it('does not verify an inactive license, a number that belongs to someone else, or one that is not there', async () => {
    expect((await verifyLicense('AZ', 'BR108787000', ['Sarah Chen'], fetchAz(csv(az({ status: 'Inactive' }))))).outcome).toBe('inactive');
    expect((await verifyLicense('AZ', 'BR108787000', ['Pat Jones'], fetchAz(csv(az()))) ).outcome).toBe('needs_review');
    expect((await verifyLicense('AZ', 'BR777', ['Sarah Chen'], fetchAz(csv(az())))).outcome).toBe('not_found');
  });
  it('warns that a salesperson is paid through the broker', async () => {
    const r = await verifyLicense('AZ', 'SA555', ['Chen'], fetchAz(csv(az({ num: 'SA555', type: 'Salesperson' }))));
    expect(r.outcome).toBe('verified');
    expect(r.message).toMatch(/employing broker/);
  });
  it('reports a failed download instead of guessing', async () => {
    expect((await verifyLicense('AZ', 'BR1', ['x'], (async () => new Response('no', { status: 500 })) as never)).outcome).toBe('error');
    expect((await verifyLicense('AZ', 'BR1', ['x'], (async () => { throw new Error('offline'); }) as never)).outcome).toBe('error');
  });
});

describe('Colorado records', () => {
  const row = { firstname: 'Jordan', lastname: 'Ellis', licensetype: 'Real Estate Broker', licensenumber: '100012345', licensestatus: 'Active', licenseexpirationdate: '12/31/2027', casenumber: 'None', programaction: '', verifylicense: 'https://apps.colorado.gov/dre/x' };
  const fetchCo = (rows: unknown[], status = 200) => (async () => new Response(JSON.stringify(rows), { status })) as never;
  it('verifies an active broker and ignores other professions that share the number', async () => {
    const r = await verifyLicense('CO', 'EB.100012345', ['Jordan Ellis'], fetchCo([{ ...row, licensetype: 'Licensed Appraiser' }, row]));
    expect(r).toMatchObject({ outcome: 'verified', record: { name: 'Jordan Ellis', expires: '12/31/2027' } });
  });
  it('does not verify an inactive or mismatched license, or a number with no broker record', async () => {
    expect((await verifyLicense('CO', '100012345', ['Jordan Ellis'], fetchCo([{ ...row, licensestatus: 'Expired' }]))).outcome).toBe('inactive');
    expect((await verifyLicense('CO', '100012345', ['Pat Jones'], fetchCo([row]))).outcome).toBe('needs_review');
    expect((await verifyLicense('CO', '100012345', ['Jordan Ellis'], fetchCo([{ ...row, licensetype: 'Licensed Appraiser' }]))).outcome).toBe('not_found');
    expect((await verifyLicense('CO', '100012345', ['Jordan Ellis'], fetchCo([], 503))).outcome).toBe('error');
  });
  it('shows discipline when the record has it', async () => {
    const r = await verifyLicense('CO', '100012345', ['Ellis'], fetchCo([{ ...row, programaction: 'Letter of admonition' }]));
    expect(r.record?.discipline).toBe('Letter of admonition');
  });
});

describe('other states', () => {
  it('stay a manual check against the official site', async () => {
    const r = await verifyLicense('NV', 'B.123', ['x']);
    expect(r.outcome).toBe('manual');
    expect(r.message).toMatch(/official lookup/);
  });
});
