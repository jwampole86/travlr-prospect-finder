// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
// Retrieval over approved, versioned help content. Pure and deterministic so answer quality can be tested.
//
// An entry is only returned when it explains most of what the question asked for. A question about something the
// content never mentions ("how do I reset the dishwasher") therefore returns nothing, and AVA says she does not know
// instead of stretching a loosely related article.
const STOP = new Set(
  'a an and are as at be been being by can could do does did for from get got had has have how i if in into is it its me my of on or our so than that the their them then there these they this those to us was we were what when where which who whom why will with would you your please show tell about need want like just also any some there here mean means meant before after ava out up work works working one more given give gives much'.split(' ')
);

// Words that mean the same thing for this product, so natural paraphrases still match.
const SYNONYMS = {
  verification: 'verify', verified: 'verify', verifying: 'verify', verifies: 'verify',
  texting: 'sms', texts: 'sms', text: 'sms', messaging: 'sms', messages: 'sms',
  emailing: 'email', emails: 'email', mail: 'email',
  filtering: 'filter', filters: 'filter', filtered: 'filter',
  uploading: 'upload', uploaded: 'upload', import: 'upload', importing: 'upload', imported: 'upload',
  reassign: 'assign', assigning: 'assign', assignment: 'assign', assigned: 'assign',
  signing: 'sign', signature: 'sign', esignature: 'sign', docusign: 'sign', signed: 'sign',
  clocking: 'clock', timeclock: 'clock',
  stale: 'old', outdated: 'old',
  reconnect: 'connect', reconnecting: 'connect', disconnected: 'connect', integration: 'connect', integrations: 'connect',
  exporting: 'export', exports: 'export', download: 'export', downloading: 'export',
  scoring: 'score', scores: 'score', scored: 'score',
  agents: 'agent', leads: 'lead', homeowners: 'homeowner', owners: 'owner', templates: 'template', campaigns: 'campaign'
};

const stem = (w) => {
  if (SYNONYMS[w]) return SYNONYMS[w];
  const s = w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w;
  return SYNONYMS[s] ?? s;
};

const normalize = (text) =>
  String(text).toLowerCase().replace(/e-signature/g, 'esignature').replace(/set[ -]up/g, 'setup').replace(/follow[ -]up/g, 'followup').replace(/opt[ -]out/g, 'optout');

export const tokens = (text) =>
  normalize(text).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);

// How much a match in each part of an entry counts (a title hit says more than a hit buried in the answer).
const W_TITLE = 1;
const W_KEYWORD = 0.9;
const W_ANSWER = 0.35;

/** Share of the question's meaningful words an entry must explain before it is shown. */
export const MIN_COVERAGE = 0.35;
export const UNKNOWN_COST = 1.0;

/** entries: [{ id?, title?, keywords?: string[], answer, source }]. Returns best matches, or [] when nothing is relevant. */
export function searchEntries(entries, query, limit = 3, { minCoverage = MIN_COVERAGE, unknownCost = UNKNOWN_COST } = {}) {
  const q = [...new Set(tokens(query))];
  if (!q.length || !entries.length) return [];

  const docs = entries.map((e) => {
    const weights = new Map();
    const add = (list, w) => { for (const t of list) weights.set(t, Math.max(weights.get(t) ?? 0, w)); };
    add(tokens(e.title ?? ''), W_TITLE);
    add((e.keywords ?? []).flatMap(tokens), W_KEYWORD);
    add(tokens(e.answer ?? ''), W_ANSWER);
    return weights;
  });

  const n = docs.length;
  // A word the content never uses counts against the match, but only about as much as one ordinary word, so a stray verb
  // ("count", "make") does not sink an otherwise good match while a question that is mostly unknown words still fails.
  const UNKNOWN = unknownCost;
  const idf = (t) => {
    const df = docs.reduce((c, d) => c + (d.has(t) ? 1 : 0), 0);
    return df === 0 ? UNKNOWN : Math.max(0.15, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  };
  const weight = new Map(q.map((t) => [t, idf(t)]));
  const mass = [...weight.values()].reduce((a, b) => a + b, 0);

  const scored = [];
  entries.forEach((entry, i) => {
    let got = 0;
    for (const t of q) got += (docs[i].get(t) ?? 0) * weight.get(t);
    const coverage = got / mass;
    if (coverage >= minCoverage) scored.push({ entry, coverage });
  });
  return scored.sort((a, b) => b.coverage - a.coverage).slice(0, limit).map(({ entry }) => entry);
}
