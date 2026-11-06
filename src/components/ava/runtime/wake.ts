// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { recognitionCtor, type Recognition, type RecognitionEvent } from './stt';

/**
 * "Hey AVA" wake word.
 *
 * The browser's speech recognition keeps listening while the option is on and this module looks only for the wake phrase in what
 * it hears. Nothing is sent to AVA's own service until the phrase is heard, and nothing here keeps or logs what was said. (Chrome and
 * Edge stream the audio to their own recognition service for as long as it is listening, which is why the option is opt-in and
 * says so.)
 */

// Recognisers often hear the name as one of these.
const NAME = '(?:ava|eva|ayva|aiva|ava\'s|a\\.?\\s?v\\.?\\s?a)';
const GREETING = '(?:hey|hay|hi|hello|hiya|okay|ok|yo|good\\s+(?:morning|afternoon|evening))';
// A greeting then her name ("Hey AVA", "OK Ava"), or her name on its own as the whole utterance ("AVA?").
const WAKE_RE = new RegExp(`^\\s*(?:${GREETING}[\\s,]+)${NAME}\\b[\\s,.!?:;-]*`, 'i');
const NAME_ONLY_RE = new RegExp(`^\\s*${NAME}[\\s.!?]*$`, 'i');

export interface WakeMatch {
  /** What was said after the wake phrase in the same breath, e.g. "show me my leads". Empty when only the phrase was said. */
  rest: string;
}

/**
 * Looks for the wake phrase at the start of an utterance. Her name inside a sentence ("I asked Ava about it") does not count, so
 * ordinary conversation near the computer does not wake her.
 */
export function matchWake(transcript: string): WakeMatch | null {
  const text = (transcript || '').trim();
  if (!text) return null;
  const m = WAKE_RE.exec(text);
  if (m) return { rest: text.slice(m[0].length).trim() };
  if (NAME_ONLY_RE.test(text)) return { rest: '' };
  return null;
}

export interface WakeHandlers {
  onWake: (match: WakeMatch) => void;
  /** Listening for the phrase, or not (the recogniser is restarting, paused or stopped). */
  onListening?: (listening: boolean) => void;
  /** The browser refused or lost the speech service for good: the caller should switch the option off and say why. */
  onFatal: (reason: 'not-allowed' | 'unsupported' | 'network' | 'audio-capture') => void;
}

export interface WakeListener { stop: () => void }

const RESTART_MS = 300;
const MAX_QUICK_FAILURES = 6;

/**
 * Starts listening for the wake phrase. The recogniser ends on its own every so often (silence, time limits), so it is restarted
 * until `stop()`. After a wake it stops itself: the caller takes over the microphone.
 */
export function startWakeListener(handlers: WakeHandlers, lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'): WakeListener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    handlers.onFatal('unsupported');
    return null;
  }
  let stopped = false;
  let rec: Recognition | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let quickFailures = 0;
  let startedAt = 0;

  const begin = () => {
    if (stopped) return;
    try {
      rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e: RecognitionEvent) => {
        if (stopped) return;
        // Only the newest result matters: older ones were already checked as they arrived.
        const latest = e.results[e.results.length - 1];
        const match = latest ? matchWake(latest[0].transcript) : null;
        if (!match) return;
        stopped = true;
        handlers.onListening?.(false);
        try { rec?.abort(); } catch { /* already stopped */ }
        handlers.onWake(match);
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stopped = true; handlers.onListening?.(false); handlers.onFatal('not-allowed'); }
        else if (e.error === 'audio-capture') { stopped = true; handlers.onListening?.(false); handlers.onFatal('audio-capture'); }
        else if (e.error === 'network') quickFailures += 2; // network trouble: back off sooner
      };
      rec.onend = () => {
        if (stopped) return;
        handlers.onListening?.(false);
        // A recogniser that keeps ending right away is failing, not idling: give up rather than spin.
        quickFailures = Date.now() - startedAt < 1500 ? quickFailures + 1 : 0;
        if (quickFailures >= MAX_QUICK_FAILURES) { stopped = true; handlers.onFatal('network'); return; }
        timer = setTimeout(begin, RESTART_MS * (1 + quickFailures));
      };
      startedAt = Date.now();
      rec.start();
      handlers.onListening?.(true);
    } catch {
      quickFailures++;
      if (quickFailures >= MAX_QUICK_FAILURES) { stopped = true; handlers.onFatal('network'); return; }
      timer = setTimeout(begin, RESTART_MS * (1 + quickFailures));
    }
  };
  begin();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      handlers.onListening?.(false);
      try { rec?.abort(); } catch { /* already stopped */ }
    }
  };
}
