/**
 * Follows an agent reading a script aloud. Speech recognition gives a stream of spoken words; the tracker moves a cursor through the
 * script when they match what comes next, and stays put when they do not. Anything else (the homeowner talking, an ad-lib, a cough)
 * never moves it, and the agent can pick the script back up where they left off or skip ahead to a later sentence.
 */

export interface ScriptWord { raw: string; token: string }

export interface TrackerState {
  words: ScriptWord[];
  pos: number;
  matched: boolean[];
  skipped: boolean[];
  /** Spoken words in a row that were not in the script. */
  offScript: string[];
  /** Finished runs of off-script speech long enough to be a real ad-lib. */
  adLibs: string[];
  heard: number;
}

const ADLIB_MIN_WORDS = 4;
const WINDOW = 8;
const STOP_WINDOW = 1;
const JUMP_TRIGRAM = 3;

const STOPWORDS = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'is', 'it', 'in', 'on', 'at', 'for', 'we', 'you', 'i', 'so', 'be', 'that', 'this', 'with', 'are', 'was', 'my', 'me', 'your', 'our', 'if', 'as', 'but', 'do', 'can', 'have', 'just', 'there']);
const NUMBER_WORDS: Record<string, string> = { '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten', '11': 'eleven', '12': 'twelve' };

// Recognition hears our name as an ordinary word.
const BRAND_FORMS = new Set(['travel', 'traveler', 'traveller', 'travler', 'travlr', 'travelr']);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(t => NUMBER_WORDS[t] ?? (BRAND_FORMS.has(t) ? 'travlr' : t));
}

/** The words of a script line as shown on screen, each with the form recognition would produce for it. */
export function splitWords(text: string): ScriptWord[] {
  return (text.match(/\S+/g) ?? []).map(raw => ({ raw, token: tokenize(raw).join('') }));
}

function editDistanceAtMost(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]; prev[0] = i; let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp; rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return false;
  }
  return prev[b.length] <= max;
}

/** A rough sound-alike key: same first letter, then the consonant sounds without vowels or doubled letters. */
function soundKey(w: string): string {
  const map: Record<string, string> = { b: '1', f: '1', p: '1', v: '1', c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2', d: '3', t: '3', l: '4', m: '5', n: '5', r: '6' };
  let out = w[0];
  let last = map[w[0]] ?? '';
  for (let i = 1; i < w.length; i++) {
    const code = map[w[i]] ?? '';
    if (code && code !== last) out += code;
    last = code || (/[aeiouy]/.test(w[i]) ? '' : last);
  }
  return out.slice(0, 5);
}

/** Same word, allowing for the small differences speech recognition introduces (plurals, endings, a wrong letter). */
export function wordsMatch(expected: string, spoken: string): boolean {
  if (!expected || !spoken) return false;
  if (expected === spoken) return true;
  const short = Math.min(expected.length, spoken.length);
  if (short < 4) return false;
  if (Math.abs(expected.length - spoken.length) <= 3 && (expected.startsWith(spoken) || spoken.startsWith(expected))) return true;
  if (editDistanceAtMost(expected, spoken, short >= 8 ? 2 : 1)) return true;
  // Recognition often spells names and unusual words differently from how they sound.
  return short >= 5 && Math.abs(expected.length - spoken.length) <= 2 && soundKey(expected) === soundKey(spoken);
}

export function createTracker(text: string): TrackerState {
  const words = splitWords(text);
  const state: TrackerState = { words, pos: 0, matched: words.map(() => false), skipped: words.map(() => false), offScript: [], adLibs: [], heard: 0 };
  return passPunctuation(state);
}

/** Words with no letters (dashes, symbols) are never spoken, so the cursor steps over them. */
function passPunctuation(s: TrackerState): TrackerState {
  while (s.pos < s.words.length && !s.words[s.pos].token) { s.matched[s.pos] = true; s.pos++; }
  return s;
}

function clone(s: TrackerState): TrackerState {
  return { ...s, matched: [...s.matched], skipped: [...s.skipped], offScript: [...s.offScript], adLibs: [...s.adLibs] };
}

function findAhead(s: TrackerState, spoken: string): number {
  const stop = STOPWORDS.has(spoken);
  const limit = Math.min(s.words.length, s.pos + (stop ? STOP_WINDOW : WINDOW));
  for (let j = s.pos; j < limit; j++) if (s.words[j].token && s.words[j].token === spoken) return j;
  if (stop) return -1;
  for (let j = s.pos; j < limit; j++) if (s.words[j].token && wordsMatch(s.words[j].token, spoken)) return j;
  return -1;
}

/** After a few unmatched words, check whether the agent has jumped to a later sentence: their last three words appear in a row further on. */
function findJump(s: TrackerState): number {
  const heard = s.offScript.slice(-JUMP_TRIGRAM);
  if (heard.length < JUMP_TRIGRAM) return -1;
  const content = heard.some(h => !STOPWORDS.has(h));
  if (!content) return -1;
  const tokens = s.words.map(w => w.token);
  for (let j = s.pos; j + JUMP_TRIGRAM <= tokens.length; j++) {
    if (heard.every((h, k) => tokens[j + k] && wordsMatch(tokens[j + k], h))) return j + JUMP_TRIGRAM - 1;
  }
  return -1;
}

/** A word the cursor went past without hearing it. Figures like "$74K" are spoken as several different words, so they count as read. */
function markPassed(s: TrackerState, k: number) {
  if (/\d/.test(s.words[k].raw)) s.matched[k] = true; else s.skipped[k] = true;
}

function closeRun(s: TrackerState) {
  if (s.offScript.length >= ADLIB_MIN_WORDS) s.adLibs.push(s.offScript.join(' '));
  s.offScript = [];
}

/** Feeds newly spoken words in. Returns a new state; the one passed in is left alone. */
export function trackSpeech(prev: TrackerState, spoken: string[]): TrackerState {
  if (spoken.length === 0) return prev;
  const s = clone(prev);
  for (const word of spoken) {
    s.heard++;
    const j = findAhead(s, word);
    if (j >= 0) {
      for (let k = s.pos; k < j; k++) if (s.words[k].token && !s.matched[k]) markPassed(s, k);
      s.matched[j] = true;
      s.pos = j + 1;
      passPunctuation(s);
      closeRun(s);
      continue;
    }
    s.offScript.push(word);
    const jump = findJump(s);
    if (jump >= 0) {
      for (let k = s.pos; k <= jump; k++) {
        if (!s.words[k].token) continue;
        if (k > jump - JUMP_TRIGRAM) s.matched[k] = true; else if (!s.matched[k]) markPassed(s, k);
      }
      s.pos = jump + 1;
      passPunctuation(s);
      s.offScript = s.offScript.slice(0, -JUMP_TRIGRAM);
      closeRun(s);
    }
  }
  return s;
}

export interface TrackerProgress {
  started: boolean;
  /** Share of the line's words that were actually heard. */
  coverage: number;
  /** Share of the line the cursor has passed, heard or skipped. */
  passed: number;
  done: boolean;
}

export function progress(s: TrackerState): TrackerProgress {
  const spoken = s.words.filter(w => w.token);
  if (spoken.length === 0) return { started: false, coverage: 0, passed: 0, done: false };
  const heard = s.words.filter((w, i) => w.token && s.matched[i]).length;
  const passedCount = s.words.slice(0, s.pos).filter(w => w.token).length;
  return {
    started: s.heard > 0 && heard > 0,
    coverage: heard / spoken.length,
    passed: passedCount / spoken.length,
    // Dropping the last word or two of a line still counts as having read it.
    done: heard >= 2 && passedCount >= spoken.length - 1 && heard / spoken.length >= 0.5,
  };
}

/** Whether a stretch of speech is mostly this line: used to tell the agent reading apart from the homeowner talking. */
export function looksLikeReading(text: string, lineText: string): boolean {
  const spoken = tokenize(text);
  if (spoken.length < 3) return false;
  const state = trackSpeech(createTracker(lineText), spoken);
  const p = progress(state);
  const matchedHeard = state.words.filter((w, i) => w.token && state.matched[i]).length;
  return matchedHeard >= Math.min(4, spoken.length) && matchedHeard / spoken.length >= 0.5 && p.coverage > 0;
}

/**
 * Points an existing tracker at new text. When the new text is the old text with more written after it (a line still being typed out by
 * the AI), the position is kept; otherwise it starts over on the new text.
 */
export function retargetTracker(prev: TrackerState | null, text: string): TrackerState {
  const next = createTracker(text);
  if (!prev || prev.words.length === 0) return next;
  const keep = prev.words.length - 1;
  if (next.words.length < prev.words.length) return next;
  for (let i = 0; i < keep; i++) if (prev.words[i].token !== next.words[i].token) return next;
  for (let i = 0; i < keep; i++) { next.matched[i] = prev.matched[i]; next.skipped[i] = prev.skipped[i]; }
  next.pos = Math.min(prev.pos, keep);
  next.offScript = [...prev.offScript];
  next.adLibs = [...prev.adLibs];
  next.heard = prev.heard;
  return next;
}
