'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  /** "bar" is a slim row for the top of a page; "icon" is a compact arrow for use inside an existing header. */
  variant?: 'bar' | 'icon';
  /** Where to go when there is no previous page (for example after opening the link in a new tab). */
  fallbackHref?: string;
  /** Ask before leaving, for screens where leaving could lose work. */
  confirmMessage?: string;
  className?: string;
}

/** Goes to the previous page, or to the fallback when this tab has no history. */
export default function BackButton({ variant = 'bar', fallbackHref = '/', confirmMessage, className = '' }: BackButtonProps) {
  const router = useRouter();
  const goBack = () => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    if (window.history.length > 1) router.back(); else router.push(fallbackHref);
  };

  if (variant === 'icon') {
    return (
      <button type="button" onClick={goBack} aria-label="Go back" title="Go back" className={`shrink-0 w-9 h-9 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ${className}`}>
        <ArrowLeft size={18} />
      </button>
    );
  }
  return (
    <div className={`px-4 sm:px-6 pt-3 ${className}`}>
      <button type="button" onClick={goBack} aria-label="Go back" title="Go back" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
        <ArrowLeft size={16} />Back
      </button>
    </div>
  );
}
