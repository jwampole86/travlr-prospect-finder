// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelSpeech, chunkSpeech, configureVoice, neuralVoiceAvailable, speak, speakable } from './speech';

const bus = () => { const events: string[] = []; return { events, bus: { emit: (e: string) => { events.push(e); } } as never }; };

describe('what is read aloud', () => {
  it('drops markdown marks, links and list symbols', () => {
    expect(speakable('**Lead Management** is [here](https://x.io/a). See https://x.io\n- one\n- two')).toBe('Lead Management is here. See. one. two');
  });

  it('keeps pieces short enough to start quickly, without losing words', () => {
    const text = 'First sentence is here. ' + 'Another fairly long sentence goes on and on about the pipeline board. '.repeat(6) + 'Last one.';
    const pieces = chunkSpeech(speakable(text));
    expect(pieces.length).toBeGreaterThan(2);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(280);
    expect(pieces.join(' ').replace(/\s+/g, ' ')).toBe(speakable(text));
  });
});

describe('the natural voice', () => {
  const played: string[] = [];
  beforeEach(() => {
    played.length = 0;
    class FakeAudio {
      src: string; onplaying: (() => void) | null = null; onended: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor(src: string) { this.src = src; }
      play() { played.push(this.src); queueMicrotask(() => { this.onplaying?.(); this.onended?.(); }); return Promise.resolve(); }
      pause() {}
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
  });
  afterEach(() => { vi.unstubAllGlobals(); configureVoice(null); });

  it('speaks every piece in order, reports real start and end, and sends the chosen voice', async () => {
    const bodies: Array<{ text: string; voice?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => { bodies.push(JSON.parse(init.body)); return new Response(new Blob(['a']), { status: 200 }); }));
    configureVoice({ url: '/api/ava/speak', voice: () => 'shimmer' });
    const { events, bus: b } = bus();
    const captions: Array<string | null> = [];
    await speak(b, 'Hello there. ' + 'This is a longer second part that keeps going for a while so it is split. '.repeat(4), (c) => captions.push(c));
    expect(bodies.length).toBeGreaterThan(1);
    expect(bodies.every((x) => x.voice === 'shimmer')).toBe(true);
    expect(played.length).toBe(bodies.length);
    expect(events).toEqual(['ava.speech.started', 'ava.speech.ended']);
    expect(captions.at(-1)).toBeNull();
  });

  it('stops asking for the natural voice once the server says it is off, and stays silent without a browser voice', async () => {
    const f = vi.fn(async () => new Response('no', { status: 503 }));
    vi.stubGlobal('fetch', f);
    configureVoice({ url: '/api/ava/speak' });
    expect(neuralVoiceAvailable()).toBe(true);
    const { events, bus: b } = bus();
    await speak(b, 'Hello there.');
    expect(neuralVoiceAvailable()).toBe(false);
    expect(events).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('can be stopped part-way', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['a']), { status: 200 })));
    vi.stubGlobal('Audio', class { onplaying: (() => void) | null = null; onended: (() => void) | null = null; onerror: (() => void) | null = null; play() { queueMicrotask(() => this.onplaying?.()); return Promise.resolve(); } pause() {} });
    configureVoice({ url: '/api/ava/speak' });
    const { events, bus: b } = bus();
    const done = speak(b, 'Hello there. And more words to say.');
    await new Promise((r) => setTimeout(r, 5));
    cancelSpeech();
    await done;
    expect(events).toEqual(['ava.speech.started', 'ava.speech.ended']);
  });
});
