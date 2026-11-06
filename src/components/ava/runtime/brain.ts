// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import type { AvaContext, AvaHost } from '../host/types';

/** Client for the server-side AVA brain (LLM + tool gateway). See server/gateway.mjs for the line protocol. */
export interface SourceNote {
  kind: 'leads' | 'knowledge';
  label: string;
  live: boolean;
  asOf?: string;
  newestRecordAt?: string;
  version?: string;
  citations?: string[];
  count?: number;
}

export type BrainLine =
  | { t: 'tool_start'; tool: string; callId: string; mutating: boolean; uiTarget?: string }
  | { t: 'tool_end'; tool: string; callId: string; ok: true; completesTask: boolean; backendConfirmed: boolean }
  | { t: 'tool_end'; tool: string; callId: string; ok: false; reason: 'error' | 'timeout' | 'denied' }
  | { t: 'denied'; tool: string }
  | { t: 'tour_start'; tourId: string }
  | { t: 'tour'; anchors: string[] }
  | { t: 'go'; page: string; open: boolean }
  | { t: 'confirm'; actionId: string; tool: string; summary: string }
  | { t: 'answer'; text: string; sources?: SourceNote[]; cards?: unknown }
  | { t: 'error'; code: string }
  | { t: 'done' };

/** The brain cannot be reached or is not configured; the caller may fall back to the offline demo script. */
export class BrainUnavailable extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export interface BrainMessage { role: 'user' | 'assistant'; content: string }

const isBrainLine = (v: unknown): v is BrainLine =>
  typeof v === 'object' && v !== null && typeof (v as { t?: unknown }).t === 'string';

async function* lines(host: AvaHost, path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<BrainLine> {
  let res: Response;
  try {
    const extra = (await host.getAuthHeaders?.()) ?? {};
    res = await fetch(host.apiBase + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...extra },
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new BrainUnavailable('network');
  }
  // A dev proxy answers 500 when the brain process is down; the brain itself reports failures inside the stream.
  if (res.status === 404 || res.status === 503 || res.status >= 500) throw new BrainUnavailable(String(res.status));
  if (res.status === 401 || res.status === 403) throw new BrainUnavailable('unauthorized');
  if (!res.ok || !res.body) throw new Error(`brain responded ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const raw = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!raw) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isBrainLine(parsed)) yield parsed;
      } catch {
        /* ignore a malformed line rather than losing the whole turn */
      }
    }
    if (done) return;
  }
}

export const streamTurn = (host: AvaHost, messages: BrainMessage[], context: AvaContext, signal?: AbortSignal) =>
  lines(host, '/api/ava/turn', { messages, context }, signal);

/** Not abortable on purpose: once the user confirms, the backend call finishes and the UI must report its true outcome. */
export const streamConfirm = (host: AvaHost, actionId: string, decision: 'accept' | 'reject', context: AvaContext) =>
  lines(host, '/api/ava/confirm', { actionId, decision, context });

/** A change chosen from an answer card. The server checks it like any proposed change and asks for approval before it runs. */
export const streamPrepare = (host: AvaHost, tool: string, args: Record<string, unknown>, context: AvaContext) =>
  lines(host, '/api/ava/prepare', { tool, args, context });

/** The short "what needs you today" summary. */
export const streamBriefing = (host: AvaHost, context: AvaContext, signal?: AbortSignal) =>
  lines(host, '/api/ava/briefing', { context }, signal);
