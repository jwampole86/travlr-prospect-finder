import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TRAVLR_TOURS } from '../../../components/ava/travlrTours';

const root = join(__dirname, '../../../..');
const src = join(root, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules' || n.startsWith('.')) return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(n) ? [p] : [];
  });
}
const sources = walk(join(src, 'app')).concat(walk(join(src, 'components'))).filter((f) => !f.includes('/components/ava/') && !f.includes('.test.'));
const allSource = sources.map((f) => readFileSync(f, 'utf8')).join('\n');

const adminOnly = (() => {
  const mw = readFileSync(join(src, 'middleware.ts'), 'utf8');
  const block = mw.slice(mw.indexOf('ADMIN_ONLY_ROUTES = ['), mw.indexOf('];', mw.indexOf('ADMIN_ONLY_ROUTES = [')));
  return [...block.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
})();
const isAdminRoute = (route: string) => adminOnly.some((r) => route === r || route.startsWith(r + '/'));

describe('TRAVLR guided tours', () => {
  it('offers at least three real tours', () => {
    expect(TRAVLR_TOURS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(TRAVLR_TOURS.map((t) => t.id)).size).toBe(TRAVLR_TOURS.length);
  });

  it('points only at elements that are marked in the real page source', () => {
    for (const tour of TRAVLR_TOURS) for (const step of tour.steps) {
      // Menu items get their anchor from their key in the sidebar, so a menu step is checked against that key.
      const present = allSource.includes(`data-ava-anchor="${step.anchor}"`) || (step.anchor.startsWith('nav-') && allSource.includes(`key: '${step.anchor}'`));
      expect(present, `${tour.id}/${step.id}: data-ava-anchor="${step.anchor}" is missing from the pages`).toBe(true);
    }
  });

  it('navigates only to screens that exist', () => {
    for (const tour of TRAVLR_TOURS) for (const step of tour.steps) {
      const route = step.route ?? '/';
      const page = route === '/' ? join(src, 'app/page.tsx') : join(src, 'app', route.slice(1), 'page.tsx');
      expect(existsSync(page), `${tour.id}/${step.id}: no page for ${route}`).toBe(true);
    }
  });

  it('never sends a role to a screen the app would redirect it away from', () => {
    for (const tour of TRAVLR_TOURS) for (const step of tour.steps) {
      if (step.route && isAdminRoute(step.route)) {
        expect(tour.roles, `${tour.id}: ${step.route} is admin-only`).not.toContain('agent');
      }
    }
    expect(adminOnly).toContain('/pipeline');
  });

  it('gives every step a sentence to say and every tour a role', () => {
    for (const tour of TRAVLR_TOURS) {
      expect(tour.roles.length).toBeGreaterThan(0);
      expect(tour.roles).not.toContain('homeowner');
      for (const step of tour.steps) expect(step.say.length).toBeGreaterThan(20);
    }
  });
});
