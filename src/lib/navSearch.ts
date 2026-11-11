/** Searching the menu: words in a person's search must all appear in a page's name, description, category or address. */
export interface SearchableNavItem { key: string; label: string; href: string }
export interface SearchableNavGroup { key: string; label: string; items: SearchableNavItem[] }
export interface NavHit<T extends SearchableNavItem = SearchableNavItem> { item: T; group: string; score: number }

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/** Best matches first: a page whose name starts with the search, then name matches, then matches in the description or category. */
export function searchNav<T extends SearchableNavItem>(groups: Array<{ key: string; label: string; items: T[] }>, query: string, describe: (key: string) => string | undefined, limit = 12): Array<NavHit<T>> {
  const q = words(query);
  if (!q.length) return [];
  const seen = new Set<string>();
  const hits: Array<NavHit<T>> = [];
  for (const g of groups) {
    for (const item of g.items) {
      const id = `${item.label}|${item.href}`;
      if (seen.has(id)) continue;
      const label = words(item.label).join(' ');
      const rest = words(`${describe(item.key) ?? ''} ${g.label} ${item.href}`).join(' ');
      const hay = `${label} ${rest}`;
      // Every typed word may be the start of a word ("lea" finds "lead"), so results appear as the person types.
      if (!q.every((w) => hay.split(' ').some((h) => h.startsWith(w)) || (w.length > 2 && hay.includes(w)))) continue;
      seen.add(id);
      const joined = q.join(' ');
      const score = (label === joined ? 100 : label.startsWith(joined) ? 80 : q.every((w) => label.includes(w)) ? 60 : 20) - Math.min(label.length, 30) / 10;
      hits.push({ item, group: g.label, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
