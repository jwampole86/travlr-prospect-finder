// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import type { AvaBus } from './useAva';

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Splits text into sentence-sized chunks so captions can follow the speech. */
export const splitSentences = (text: string): string[] =>
  (text.replace(/\s+/g, ' ').trim().match(/[^.!?\n]+[.!?]*(?:\s|$)/g) ?? [text]).map((s) => s.trim()).filter(Boolean);

/**
 * Real TTS: speech events are emitted only from actual playback callbacks.
 * `onCaption` receives the sentence being spoken right now, then null when playback ends.
 */
export function speak(bus: AvaBus, text: string, onCaption?: (sentence: string | null) => void): Promise<void> {
  if (!speechSupported()) return Promise.resolve();
  const sentences = splitSentences(text);
  return new Promise((resolve) => {
    let started = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onCaption?.(null);
      if (started) bus.emit('ava.speech.ended');
      resolve();
    };
    sentences.forEach((sentence, i) => {
      const u = new SpeechSynthesisUtterance(sentence);
      u.onstart = () => {
        if (!started) {
          started = true;
          bus.emit('ava.speech.started');
        }
        onCaption?.(sentence);
      };
      if (i === sentences.length - 1) u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
    });
  });
}

export function cancelSpeech() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
