// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import type { AvaBus } from './useAva';

/**
 * AVA's spoken voice. When the host provides a voice service she speaks with a natural neural voice, one short piece at a time
 * (the next piece is fetched while the current one plays, so there is no gap). If that service is unavailable, blocked or fails,
 * she falls back to the browser's own voice, so replies are never silent just because the better voice is down.
 */
export interface VoiceConfig {
  /** POST { text, voice } -> audio. */
  url: string;
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  /** The voice the person picked (the server only accepts voices it knows). */
  voice?: () => string | undefined;
}

let config: VoiceConfig | null = null;
// Set when the service said it is switched off or this user may not use it, so we stop asking for the rest of the session.
let neuralBlocked = false;

export function configureVoice(next: VoiceConfig | null) {
  config = next;
  neuralBlocked = false;
}

const browserSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export const neuralVoiceAvailable = () => !!config && !neuralBlocked && typeof Audio !== 'undefined';
export const speechSupported = () => neuralVoiceAvailable() || browserSupported();

/** Plain, speakable text: no markdown marks, links or list symbols that a voice would read out loud. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`#>~]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s*\n\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits text into sentence-sized chunks so captions can follow the speech. */
export const splitSentences = (text: string): string[] =>
  (text.replace(/\s+/g, ' ').trim().match(/[^.!?\n]+[.!?]*(?:\s|$)/g) ?? [text]).map((s) => s.trim()).filter(Boolean);

/** Groups sentences into pieces of about `max` characters: few requests, but short enough that the first words arrive quickly. */
export function chunkSpeech(text: string, max = 180): string[] {
  const out: string[] = [];
  let cur = '';
  for (const sentence of splitSentences(text)) {
    if (cur && (cur + ' ' + sentence).length > max) { out.push(cur); cur = sentence; } else cur = cur ? cur + ' ' + sentence : sentence;
  }
  if (cur) out.push(cur);
  // A single very long sentence is cut at a space so each request stays small.
  return out.flatMap((c) => {
    const parts: string[] = [];
    let rest = c;
    while (rest.length > 280) {
      const cut = rest.lastIndexOf(' ', 280);
      parts.push(rest.slice(0, cut > 0 ? cut : 280));
      rest = rest.slice(cut > 0 ? cut + 1 : 280);
    }
    parts.push(rest);
    return parts;
  });
}

interface Playback { abort: AbortController; audio: HTMLAudioElement | null; stop: () => void }
let playback: Playback | null = null;

class VoiceUnavailable extends Error {
  constructor(readonly status: number) { super(`voice ${status}`); }
}

async function fetchAudio(piece: string, signal: AbortSignal): Promise<Blob> {
  const cfg = config!;
  const headers = { 'content-type': 'application/json', ...(cfg.getHeaders ? await cfg.getHeaders() : {}) };
  const res = await fetch(cfg.url, { method: 'POST', headers, credentials: 'include', body: JSON.stringify({ text: piece, voice: cfg.voice?.() }), signal });
  if (!res.ok) throw new VoiceUnavailable(res.status);
  return res.blob();
}

function play(blob: Blob, pb: Playback, onPlaying: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    pb.audio = audio;
    let done = false;
    const end = (err?: unknown) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      pb.audio = null;
      if (err) reject(err); else resolve();
    };
    pb.stop = () => { try { audio.pause(); } catch { /* ignore */ } end(); };
    audio.onplaying = onPlaying;
    audio.onended = () => end();
    audio.onerror = () => end(new Error('audio'));
    audio.play().catch((e) => end(e));
  });
}

/** Returns true when the neural voice spoke it (or the person stopped it); false when the caller should use the browser voice instead. */
async function speakNeural(bus: AvaBus, text: string, onCaption?: (s: string | null) => void): Promise<boolean> {
  const pieces = chunkSpeech(speakable(text));
  if (!pieces.length) return true;
  const pb: Playback = { abort: new AbortController(), audio: null, stop: () => {} };
  playback = pb;
  let started = false;
  const begin = () => { if (!started) { started = true; bus.emit('ava.speech.started'); } };
  const get = (i: number) => { const p = fetchAudio(pieces[i], pb.abort.signal); p.catch(() => {}); return p; };
  let next = get(0);
  try {
    for (let i = 0; i < pieces.length; i++) {
      const blob = await next;
      if (pb.abort.signal.aborted) return true;
      if (i + 1 < pieces.length) next = get(i + 1);
      onCaption?.(pieces[i]);
      await play(blob, pb, begin);
      if (pb.abort.signal.aborted) return true;
    }
    return true;
  } catch (e) {
    if (pb.abort.signal.aborted) return true;
    if (e instanceof VoiceUnavailable && [401, 403, 404, 503].includes(e.status)) neuralBlocked = true;
    // Nothing has been heard yet: let the browser voice read it. Part-way through, just stop rather than repeat words.
    return started;
  } finally {
    if (playback === pb) playback = null;
    onCaption?.(null);
    if (started) bus.emit('ava.speech.ended');
  }
}

function speakBrowser(bus: AvaBus, text: string, onCaption?: (sentence: string | null) => void): Promise<void> {
  if (!browserSupported()) return Promise.resolve();
  const sentences = splitSentences(speakable(text));
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
    if (!sentences.length) return finish();
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

/**
 * Real TTS: speech events are emitted only from actual playback callbacks.
 * `onCaption` receives the piece being spoken right now, then null when playback ends.
 */
export async function speak(bus: AvaBus, text: string, onCaption?: (sentence: string | null) => void): Promise<void> {
  if (neuralVoiceAvailable() && (await speakNeural(bus, text, onCaption))) return;
  await speakBrowser(bus, text, onCaption);
}

export function cancelSpeech() {
  if (playback) { playback.abort.abort(); playback.stop(); playback = null; }
  if (browserSupported()) window.speechSynthesis.cancel();
}
