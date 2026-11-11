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

// 6. Every page in the menu: where it is, what it is for and who sees it. Read from the real sidebar, so the map cannot drift from the app.
{
  const side = read('src/components/Sidebar.tsx');
  const described = Object.fromEntries([...side.matchAll(/^ {2}'nav-([a-z0-9-]+)': '((?:[^'\\]|\\.)*)'/gm)].map((m) => [m[1], m[2].replace(/\\'/g, "'")]));
  const extra = JSON.parse(read('src/lib/navDescriptions.json'));
  const pages = new Map();
  const groups = { admin: new Map(), agent: new Map() };
  let role = null, group = null;
  for (const line of side.split('\n')) {
    const r = line.match(/^const (admin|agent)NavGroups/);
    if (r) role = r[1];
    if (/^const bottomItems/.test(line)) role = null;
    const g = line.match(/^ {4}label: '([^']+)'/);
    if (g && role) { group = g[1]; groups[role].set(group, []); }
    const it = line.match(/key: 'nav-([a-z0-9-]+)', label: '([^']+)', href: '([^']+)'/);
    if (!it || !role) continue;
    const [, key, label, href] = it;
    const route = href.split('?')[0];
    const description = extra[key] ?? described[key];
    if (!description) throw new Error(`menu item ${key} has no description: add it to src/lib/navDescriptions.json`);
    const id = `${label}|${route}`;
    const page = pages.get(id) ?? { key, label, route, description, where: [] };
    page.where.push({ role, group });
    pages.set(id, page);
    groups[role].get(group).push(page);
  }
  const who = (w) => [...new Set(w.map((x) => (x.role === 'admin' ? 'admins and owners' : 'agents')))].join(' and ');
  const menuWhere = (w) => w.map((x) => `${x.group} menu${x.role === 'agent' && w.length > 1 ? ' (agents)' : ''}`).join(' and ');
  for (const page of pages.values()) {
    const words = page.label.replace(/[()&/]/g, ' ').split(/\s+/).filter(Boolean);
    add({
      id: 'page-' + slug(page.label + ' ' + page.route), title: `Where is ${page.label} and what is it for?`,
      keywords: [page.label, ...words, page.route.split('/').filter(Boolean).join(' '), ...page.where.map((x) => x.group)].filter(Boolean),
      answer: `${page.label}: ${page.description} Find it in the ${menuWhere(page.where)}, at ${page.route === '/' ? 'the home page' : page.route}. Available to ${who(page.where)}.`,
      source: `Menu: ${page.label}`, route: page.route, kind: 'page'
    });
  }
  // Guided walks through each menu category, so AVA can glide from item to item and explain every one. Long categories are split into short tours.
  const tours = [];
  const PER_TOUR = 10;
  for (const r of ['admin', 'agent']) {
    for (const [name, items] of groups[r]) {
      const unique = items.filter((p, i) => items.findIndex((q) => q.key === p.key) === i);
      const parts = Math.ceil(unique.length / PER_TOUR);
      for (let n = 0; n < parts; n++) {
        const chunk = unique.slice(n * PER_TOUR, (n + 1) * PER_TOUR);
        const suffix = parts > 1 ? ` (${n + 1} of ${parts})` : '';
        tours.push({
          id: `menu-${r}-${slug(name)}${parts > 1 ? '-' + (n + 1) : ''}`.slice(0, 48),
          title: `${name} menu${suffix}`,
          summary: `A walk through the ${name} menu`,
          roles: r === 'admin' ? ['admin', 'owner'] : ['agent'],
          keywords: ['menu', 'navigation', 'navigate', 'sidebar', 'where', name.toLowerCase(), ...chunk.flatMap((p) => p.label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))],
          steps: chunk.map((p) => ({ id: p.key, anchor: 'nav-' + p.key, say: `${p.label}. ${p.description}` }))
        });
      }
    }
  }
  writeFileSync(new URL('../src/components/ava/menuTours.generated.json', import.meta.url), JSON.stringify(tours, null, 1) + '\n');
  console.log(`AVA menu tours: ${tours.length}`);
  const names = { admin: 'admins and owners', agent: 'agents' };
  for (const r of ['admin', 'agent']) {
    for (const [name, items] of groups[r]) {
      add({
        id: `menu-${r}-${slug(name)}`, title: `What is in the ${name} menu for ${names[r]}?`,
        keywords: [name, 'menu', 'sidebar', 'navigation', 'where', 'find', names[r], ...items.map((i) => i.label)],
        answer: `The ${name} menu for ${names[r]} has ${items.length} page${items.length === 1 ? '' : 's'}: ${items.map((i) => `${i.label} (${i.description.replace(/\.$/, '')})`).join('; ')}.`,
        source: `Menu: ${name}`, kind: 'menu'
      });
    }
    add({
      id: `menu-${r}-overview`, title: `How is the menu organized for ${names[r]}?`,
      keywords: ['menu', 'sidebar', 'navigation', 'navigate', 'categories', 'sections', 'where', 'find', 'everything', 'overview', names[r]],
      answer: `${names[r][0].toUpperCase()}${names[r].slice(1)} see ${groups[r].size} menu categories on the left: ${[...groups[r]].map(([n, i]) => `${n} (${i.length})`).join(', ')}. Each category opens to show its pages. I can open any page for you and point at it in the menu, or walk you through a whole category.`,
      source: 'Menu overview', kind: 'menu'
    });
  }
}

const hash = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 8);
const version = `${new Date().toISOString().slice(0, 10)}-${hash}`;
writeFileSync(new URL('../src/lib/ava/knowledge.json', import.meta.url), JSON.stringify({ version, generatedFrom: Object.values(files), entries }, null, 2) + '\n');
console.log(`AVA knowledge ${version}: ${entries.length} entries (${['faq', 'article', 'guide', 'overview', 'page', 'menu'].map((k) => `${entries.filter((e) => e.kind === k).length} ${k}`).join(', ')})`);
