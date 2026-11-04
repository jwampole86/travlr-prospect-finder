/** Reads a homeowner's text reply for signs that they might sell. This only flags the reply for a person; it never contacts anyone. */

export type SellerIntent = {
  level: 'explicit' | 'possible' | 'none';
  score: number;
  timeline: string | null;
  keepsRental: boolean;
  signals: string[];
};

const NOT_SELLING = /\b(not|never|no)\s+(?:\w+\s+){0,3}(sell|selling|for sale|list(?:ing)?)\b|\b(don'?t|do not|won'?t|will not|isn'?t|is not)\s+(?:\w+\s+){0,3}(sell|selling|for sale)\b/i;
const EXPLICIT = [
  { re: /\b(want|wanna|plan|planning|going|ready|looking|hoping|trying)\s+(?:to\s+)?(?:\w+\s+){0,2}sell\b/i, label: 'wants to sell' },
  { re: /\b(thinking|considering|open)\s+(?:of|about|to)\s+(?:\w+\s+){0,2}(sell|selling|listing)\b/i, label: 'considering a sale' },
  { re: /\b(put|putting)\s+(?:it|the (?:house|home|property))\s+on the market\b/i, label: 'putting it on the market' },
  { re: /\b(list(?:ing)?|selling)\s+(?:it|the (?:house|home|property)|my (?:house|home|property|place))\b/i, label: 'about to list' },
  { re: /\b(make|send|give)\s+(?:me\s+)?an?\s+offer\b|\bwhat(?:'s| is| would)\s+(?:it|my (?:house|home|property))\s+worth\b|\bhow much (?:is|would) (?:it|my (?:house|home|property)) (?:worth|sell)/i, label: 'asked for an offer or value' },
  { re: /\bcash\s+(?:offer|buyer)s?\b|\bbuy\s+my (?:house|home|property|place)\b/i, label: 'asked about a buyer' },
];
const POSSIBLE = [
  { re: /\b(sell|selling|for sale|realtor|real estate agent|broker)\b/i, label: 'mentions selling' },
];
const LIFE_CHANGE = /\b(retir(?:e|ing|ement)|downsiz(?:e|ing)|relocat(?:e|ing))\b/i;
const KEEPS_RENTAL = /\b(keep|rent(?:ing)?|rental|tenant|long[- ]term|lease)\b/i;

function timelineOf(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(asap|right away|immediately|as soon as)\b/.test(t)) return 'asap';
  const n = t.match(/\b(?:in|within|next)\s+(\d{1,2}|a|one|two|three|four|five|six|a few|few)\s+(day|week|month|year)s?\b/);
  if (n) return `${n[1]} ${n[2]}${n[1] === 'a' || n[1] === 'one' || n[1] === '1' ? '' : 's'}`;
  if (/\bthis (spring|summer|fall|winter|year)\b|\bnext (spring|summer|fall|winter|year)\b/.test(t)) return (t.match(/\b(this|next) (spring|summer|fall|winter|year)\b/) as RegExpMatchArray)[0];
  return null;
}

export function detectSellerIntent(raw: string): SellerIntent {
  const text = (raw || '').trim();
  const none: SellerIntent = { level: 'none', score: 0, timeline: null, keepsRental: false, signals: [] };
  if (!text) return none;
  if (NOT_SELLING.test(text)) return none;

  const signals: string[] = [];
  let score = 0;
  let explicit = false;
  for (const { re, label } of EXPLICIT) if (re.test(text)) { explicit = true; signals.push(label); score += 45; }
  if (!explicit) for (const { re, label } of POSSIBLE) if (re.test(text)) { signals.push(label); score += 20; }
  if (!signals.length) return none;

  if (LIFE_CHANGE.test(text)) { signals.push('life change'); score += 10; }
  const timeline = timelineOf(text);
  if (timeline) { signals.push(`timeline: ${timeline}`); score += 15; }
  return { level: explicit ? 'explicit' : 'possible', score: Math.min(100, score), timeline, keepsRental: KEEPS_RENTAL.test(text), signals };
}
