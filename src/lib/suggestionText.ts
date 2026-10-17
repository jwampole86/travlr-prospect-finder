/** The teleprompter's AI output: one main line, optionally two options and a short note. */

export interface ParsedSuggestion {
  main: string;
  options: Array<{ label: string; text: string }>;
  note: string | null;
}

const unquote = (s: string) => s.trim().replace(/^["\u201c\u2018]+|["\u201d\u2019]+$/g, '').trim();

export function parseSuggestion(raw: string): ParsedSuggestion {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let main = '';
  const options: ParsedSuggestion['options'] = [];
  let note: string | null = null;
  for (const line of lines) {
    if (line.startsWith('[Note:')) { note = line.replace(/^\[Note:\s*/, '').replace(/\]$/, ''); continue; }
    const m = /^(Suggested next line|Option [AB]):\s*(.*)$/.exec(line);
    if (m) {
      if (m[1] === 'Suggested next line') main = unquote(m[2]);
      else options.push({ label: `${m[1]}:`, text: unquote(m[2]) });
      continue;
    }
    if (!main && /^["\u201c\u2018]/.test(line)) main = unquote(line);
  }
  if (!main) main = options[0]?.text ?? lines.find(l => !l.startsWith('[Note:')) ?? '';
  return { main, options, note };
}

// Openers that make a reply sound like an assistant rather than a person on the phone.
const FILLER_OPENER = new RegExp(
  '^(?:' + [
    'great(?:\\s+question)?', 'absolutely', 'certainly', 'of course', 'sure thing', 'sure', 'definitely', 'totally', 'perfect', 'awesome',
    'wonderful', 'excellent', 'fantastic', 'amazing', 'wow', 'gotcha', 'got it', 'understood', 'right on', 'no problem', 'no worries',
    'i (?:completely |totally |fully |really )?(?:understand|hear you|get that|get it)', 'i appreciate (?:that|you|your [a-z ]{2,20})',
    '(?:thank you|thanks) for (?:sharing|letting me know|that|telling me)', 'that makes (?:perfect |total )?sense',
    "that(?:'s| is) (?:a |an )?(?:really |very |such a )?(?:great|good|fair|valid|excellent|wonderful) (?:point|question|concern)",
    'what a (?:great|good) (?:point|question)', 'good (?:question|point)', '(?:totally |completely |very )?fair(?: enough| point)?',
  ].join('|') + ')(?:\\s*[,.!]+\\s+|\\s*[\\u2014\\u2013]+\\s*|\\s+-+\\s+)', 'i',
);

/** Removes assistant-style acknowledgements from the start of a spoken line. Leaves the line alone if nothing real would remain. */
export function stripFillerOpener(text: string): string {
  let out = text.trim();
  for (let i = 0; i < 3; i++) {
    const next = out.replace(FILLER_OPENER, '');
    if (next === out || next.trim().length < 12) break;
    out = next.trim();
  }
  if (out === text.trim()) return text;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Keeps a spoken line short: whole sentences up to about `max` words (always at least the first one). */
export function limitSpokenWords(text: string, max = 38): string {
  const count = (t: string) => t.split(/\s+/).filter(Boolean).length;
  if (count(text) <= max) return text;
  const sentences = text.split(/(?<=[.?!])\s+/);
  let out = '';
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (out && count(next) > max) break;
    out = next;
  }
  return out;
}

/** Applies stripFillerOpener to every spoken line in a suggestion block, keeping its labels. */
export function cleanSuggestion(raw: string): string {
  return raw.split('\n').map(line => {
    const m = /^((?:Suggested next line|Option [AB]):\s*["\u201c]?)(.*?)(["\u201d]?)$/.exec(line.trim());
    if (!m) return line;
    return `${m[1]}${limitSpokenWords(stripFillerOpener(m[2]))}${m[3]}`;
  }).join('\n');
}
