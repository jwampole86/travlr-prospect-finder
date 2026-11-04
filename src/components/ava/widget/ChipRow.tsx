// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: dir === 'left' ? 'scaleX(-1)' : undefined }}><path d="m9 5 7 7-7 7" /></svg>
);

/** A horizontally scrolling row of quick actions with arrow buttons, so nothing is hidden off the edge. */
export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const scrollBy = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div className="chips-wrap">
      {edge.left && <button type="button" className="chip-arrow left" onClick={() => scrollBy(-1)} aria-label="Scroll quick actions left"><Chevron dir="left" /></button>}
      <div className="chips" ref={ref} onScroll={measure} role="group" aria-label={label}>{children}</div>
      {edge.right && <button type="button" className="chip-arrow right" onClick={() => scrollBy(1)} aria-label="Scroll quick actions right"><Chevron dir="right" /></button>}
    </div>
  );
}
