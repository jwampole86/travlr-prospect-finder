// Builds AVA's approved knowledge base from the app's own in-product help copy, so every answer is verbatim
// content users can also read in the app, and the version changes whenever that copy changes.
//   node scripts/build-ava-kb.mjs          (writes src/lib/ava/knowledge.json)
// Plus scripts/ava-kb-playbook.json (the approved outreach campaign) and scripts/ava-kb-authored.json: reviewed entries written from how a screen's rules work (seller & owner services).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const evalLiteral = (src) => new Function(`return (${src})`)();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const clean = (s) => s.replace(/\s+/g, ' ').trim();

const files = {
  help: 'src/app/help-center/page.tsx',
  tour: 'src/components/OnboardingTourEngine.tsx',
  how: 'src/app/how-it-works/page.tsx'
};
const text = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, read(p)]));
const entries = [];
const seen = new Set();
const add = (e) => {
  let id = e.id;
  for (let n = 2; seen.has(id); n++) id = `${e.id}-${n}`;
  seen.add(id);
  entries.push({ ...e, id, title: clean(e.title), answer: clean(e.answer) });
};

// 1. Help Center questions and answers: { q: '...', a: '...' }
const qaRe = /\{\s*q:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*,\s*a:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\}/g;
for (const m of text.help.matchAll(qaRe)) {
  const { q, a } = evalLiteral(m[0].replace(/^\{/, '{').replace(/\bq:/, 'q:'));
  add({ id: 'faq-' + slug(q), title: q, keywords: [], answer: a, source: 'Help Center', kind: 'faq' });
}

// 2. Help Center articles: { id: 'x', title: '...', summary: '...' }
const articleRe = /\{\s*id:\s*'([a-z]+-\d+)',\s*title:\s*('(?:[^'\\]|\\.)*'),\s*summary:\s*('(?:[^'\\]|\\.)*')/g;
for (const m of text.help.matchAll(articleRe)) {
  add({ id: 'article-' + m[1], title: evalLiteral(m[2]), keywords: [], answer: evalLiteral(m[3]), source: 'Help Center article: ' + evalLiteral(m[2]), kind: 'article' });
}

// 3. Onboarding tour: one entry per screen, with its route
const start = text.tour.indexOf('const TOUR_STEPS');
const arrStart = text.tour.indexOf('[', text.tour.indexOf('=', start));
let depth = 0, end = arrStart;
for (let i = arrStart; i < text.tour.length; i++) {
  const c = text.tour[i];
  if (c === '[') depth++;
  if (c === ']' && --depth === 0) { end = i; break; }
}
const stripped = text.tour.slice(arrStart, end + 1).replace(/\bicon:\s*[A-Za-z0-9_]+,?/g, '');
for (const s of evalLiteral(stripped)) {
  add({
    id: 'guide-' + s.id, title: s.title, keywords: [s.screen, s.screenHref.split('/').filter(Boolean).join(' ')].filter(Boolean),
    answer: `${s.overview} Key features: ${s.keyFeatures.join('; ')}. Tip: ${s.tip}`,
    source: `In-app guide: ${s.screen}`, route: s.screenHref, kind: 'guide'
  });
}

// 4. How it works
const howStart = text.how.indexOf('const STEPS');
const howArr = text.how.indexOf('[', text.how.indexOf('=', howStart));
depth = 0; end = howArr;
for (let i = howArr; i < text.how.length; i++) {
  const c = text.how[i];
  if (c === '[') depth++;
  if (c === ']' && --depth === 0) { end = i; break; }
}
for (const s of evalLiteral(text.how.slice(howArr, end + 1).replace(/\bicon:\s*[A-Za-z0-9_]+,?/g, ''))) {
  add({ id: 'how-' + slug(s.name), title: `${s.name}: how AVYRO works`, keywords: [s.name], answer: `${s.body} Includes: ${s.points.join('; ')}.`, source: `How it works: ${s.name}`, kind: 'overview' });
}

// 5. Content written from how a screen's rules actually work, kept in its own reviewed file
const authored = JSON.parse(read('scripts/ava-kb-authored.json'));
for (const e of authored.entries) add(e);
const playbook = JSON.parse(read('scripts/ava-kb-playbook.json'));
for (const e of playbook.entries) add(e);

const hash = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 8);
const version = `${new Date().toISOString().slice(0, 10)}-${hash}`;
writeFileSync(new URL('../src/lib/ava/knowledge.json', import.meta.url), JSON.stringify({ version, generatedFrom: Object.values(files), entries }, null, 2) + '\n');
console.log(`AVA knowledge ${version}: ${entries.length} entries (${['faq', 'article', 'guide', 'overview'].map((k) => `${entries.filter((e) => e.kind === k).length} ${k}`).join(', ')})`);
