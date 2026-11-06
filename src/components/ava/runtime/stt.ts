// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/**
 * Speech-to-text through the browser's SpeechRecognition (Chrome, Edge and Safari).
 * Note: Chrome streams the audio to its vendor's recognition service; Firefox has no support, so callers must
 * handle `sttSupported() === false` by keeping typed input.
 */
export interface RecognitionAlternative { transcript: string }
export interface RecognitionResult { isFinal: boolean; 0: RecognitionAlternative }
export interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => Recognition;

export const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const ctor = recognitionCtor;
export const sttSupported = () => ctor() !== null;

export type SttError = 'not-allowed' | 'no-speech' | 'audio-capture' | 'network' | 'other';

export interface SttHandlers {
  /** Live transcript (final + interim) while the user is still speaking. */
  onInterim: (text: string) => void;
  /** The finished utterance. Called at most once per session. */
  onFinal: (text: string) => void;
  onError: (error: SttError) => void;
  /** Always called once when the session is over, after onFinal/onError. */
  onEnd: () => void;
}

export interface SttSession {
  stop: () => void;
}

const KNOWN: readonly SttError[] = ['not-allowed', 'no-speech', 'audio-capture', 'network'];

export function startRecognition(handlers: SttHandlers, lang = navigator.language || 'en-US'): SttSession | null {
  const Ctor = ctor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = '';
  let delivered = false;
  let failed = false;
  const deliver = () => {
    const text = finalText.trim();
    if (!delivered && !failed && text) {
      delivered = true;
      handlers.onFinal(text);
    }
  };

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    handlers.onInterim((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    failed = true;
    handlers.onError((KNOWN as readonly string[]).includes(e.error) ? (e.error as SttError) : 'other');
  };
  rec.onend = () => {
    deliver();
    handlers.onEnd();
  };

  try {
    rec.start();
  } catch {
    return null;
  }
  return { stop: () => rec.stop() };
}
