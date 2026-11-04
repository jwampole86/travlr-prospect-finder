// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
// Answer-quality harness for the knowledge retrieval step. A question is "supported" when the approved content
// covers it (the expected entry must be the top hit) and "unsupported" when AVA must say she does not know (no hits).
import { searchEntries } from './knowledge.mjs';

export function scoreQa(entries, qa) {
  const failures = [];
  let correct = 0;
  for (const { q, entry } of qa.supported) {
    const accepted = Array.isArray(entry) ? entry : [entry];
    const top = searchEntries(entries, q, 1)[0];
    if (top && accepted.includes(top.id)) correct++;
    else failures.push({ q, expected: entry, got: top?.id ?? null });
  }
  let refused = 0;
  for (const q of qa.unsupported) {
    const hits = searchEntries(entries, q, 1);
    if (hits.length === 0) refused++;
    else failures.push({ q, expected: null, got: hits[0].id ?? hits[0].source });
  }
  return {
    supported: qa.supported.length,
    supportedCorrect: correct,
    accuracy: correct / qa.supported.length,
    unsupported: qa.unsupported.length,
    refused,
    refusalRate: refused / qa.unsupported.length,
    failures
  };
}
