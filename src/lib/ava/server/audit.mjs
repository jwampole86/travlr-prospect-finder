// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
// Audit trail for the tool gateway: who asked for what, which tools ran, confirmations and outcomes.
// A sink is any object with `record(event)`. Recording must never break the conversation, so failures are swallowed.
const REDACT_KEYS = new Set(['note', 'token', 'authorization', 'password', 'apiKey']);

/** Never put free-text notes or credentials in the audit trail; keep identifiers and sizes instead. */
export function redactArgs(args) {
  if (!args || typeof args !== 'object') return args;
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (REDACT_KEYS.has(k)) out[`${k}Length`] = typeof v === 'string' ? v.length : 0;
    else out[k] = v;
  }
  return out;
}

export function createMemoryAudit() {
  const events = [];
  return { events, record: async (e) => { events.push(e); } };
}

/** One JSON line per event on stdout, for hosts that ship logs elsewhere. */
export function createConsoleAudit(log = console.log) {
  return { record: async (e) => { log(JSON.stringify({ ava_audit: e })); } };
}

export async function safeRecord(sink, event, timeoutMs = 1500) {
  if (!sink) return;
  try {
    await Promise.race([
      Promise.resolve(sink.record(event)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('audit timeout')), timeoutMs).unref?.())
    ]);
  } catch {
    /* auditing is best effort; the caller already has the real outcome */
  }
}
