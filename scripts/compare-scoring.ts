// Offline comparison: stored prospect_score vs the shared scoring model. Not part of the app.
import { readFileSync } from 'fs';
import { calculateProspectScore, leadRowToScoringInput } from '../src/lib/scoring/prospectScoring';

const rows = JSON.parse(readFileSync('/tmp/score_sample.json', 'utf8')) as Array<Record<string, any>>;
const score = (r: Record<string, any>) => calculateProspectScore(leadRowToScoringInput(r)).score;

const avg = (a: number[]) => (a.reduce((s, x) => s + x, 0) / (a.length || 1)).toFixed(1);
const ge = (a: number[], t: number) => String(a.filter(x => x >= t).length).padStart(4);
const bucket = (rs: Array<Record<string, any>>, label: string) => {
  if (rs.length === 0) return;
  const stored = rs.map(r => Number(r.prospect_score || 0));
  const model = rs.map(score);
  console.log(`${label.padEnd(24)} n=${String(rs.length).padStart(5)} | stored avg ${avg(stored).padStart(5)} >=75:${ge(stored, 75)} | model avg ${avg(model).padStart(5)} >=60:${ge(model, 60)} >=75:${ge(model, 75)} >=80:${ge(model, 80)}`);
};

bucket(rows.filter(r => !r.luxury && !r.is_fsbo && !r.is_furnished && r.price_type !== 'sale'), 'plain rent/default');
bucket(rows.filter(r => r.price_type === 'sale'), 'for-sale');
bucket(rows.filter(r => r.luxury), 'luxury');
bucket(rows.filter(r => r.luxury && r.price_type === 'rent'), '  luxury rent');
bucket(rows.filter(r => r.luxury && r.price_type === 'sale'), '  luxury sale');
bucket(rows.filter(r => r.is_fsbo && r.price_type === 'rent'), 'FSBO rent');
bucket(rows.filter(r => r.is_furnished), 'furnished');
bucket(rows.filter(r => r.is_apartment_community), 'apartment community');
bucket(rows, 'ALL');

console.log('\nhand-built cases:');
const base = { estimated_net_monthly: 0, estimated_gross_monthly: 0, beds: 4, baths: 3, property_type: 'Single family', regulation_status: 'Allowed', stage: 'New Lead' };
const cases: Array<[string, Record<string, any>]> = [
  ['AK $7,500 furnished luxury FSBO rent (est $6.2K net)', { ...base, estimated_net_monthly: 6200, price: 7500, price_type: 'rent', luxury: true, is_fsbo: true, is_furnished: true, regulation_status: 'Restricted' }],
  ['Same, agent-listed, not luxury, unfurnished', { ...base, estimated_net_monthly: 6200, price: 7500, price_type: 'rent', regulation_status: 'Restricted' }],
  ['Apartment community unit $2,600', { ...base, beds: 2, baths: 1, property_type: 'Apartment', estimated_net_monthly: 3400, price: 2600, price_type: 'rent', is_apartment_community: true, regulation_status: 'Restricted' }],
  ['$540K for-sale, agent, rent est $1.7K, no STR est', { ...base, price: 540000, price_type: 'sale', estimated_monthly_rent_ai: 1741, regulation_status: 'Unknown' }],
  ['Address-only lead (no facts)', { stage: 'New Lead', regulation_status: 'Unknown' }],
];
for (const [label, r] of cases) console.log(`  ${String(score(r)).padStart(3)}  ${label}`);
