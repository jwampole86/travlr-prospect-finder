'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

/** A slim conversion bar that appears once the visitor has scrolled past the pricing cards. */
export default function StickyPlanCta({ watchId, label, price, href, ctaLabel }: { watchId: string; label: string; price: string; href: string; ctaLabel: string }) {
  const [pastCards, setPastCards] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try { if (sessionStorage.getItem('avyro_sticky_cta_dismissed') === '1') setDismissed(true); } catch { /* private mode */ }
    const el = document.getElementById(watchId);
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setPastCards(!entry.isIntersecting && entry.boundingClientRect.bottom < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [watchId]);

  if (!pastCards || dismissed) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur shadow-[0_-4px_20px_rgba(0,0,0,0.12)] pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground truncate">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{price}</p>
        </div>
        <Link href={href} className="shrink-0 inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity">{ctaLabel}</Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => { setDismissed(true); try { sessionStorage.setItem('avyro_sticky_cta_dismissed', '1'); } catch { /* ignore */ } }}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
