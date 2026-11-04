// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import type { SourceNote } from './brain';

/** "3 hours ago" style text, never in the future. */
export function relativeTime(iso: string | undefined, now: number = Date.now()): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** One short line per source so users can see where an answer came from and how fresh it is. */
export function describeSources(sources: SourceNote[] | undefined, now: number = Date.now()): string[] {
  return (sources ?? []).map((s) => {
    const parts: string[] = [];
    if (s.kind === 'knowledge') {
      parts.push(s.citations?.length ? s.citations.join(', ') : s.label);
      if (s.version) parts.push(`approved help ${s.version}`);
    } else {
      parts.push(s.label);
      if (s.count !== undefined) parts.push(`${s.count} result${s.count === 1 ? '' : 's'}`);
      const newest = relativeTime(s.newestRecordAt, now);
      if (newest) parts.push(`newest record updated ${newest}`);
    }
    if (!s.live) parts.push('sample data, not live');
    else {
      const checked = relativeTime(s.asOf, now);
      if (checked) parts.push(`checked ${checked}`);
    }
    return parts.join(' · ');
  });
}
