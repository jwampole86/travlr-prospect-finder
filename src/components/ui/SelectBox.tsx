'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';

/** A native select with the arrow drawn inside the box, so it sits evenly padded from the right edge instead of hugging it. */
export default function SelectBox({ dense, className = '', children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { dense?: boolean }) {
  return (
    <span className="relative inline-flex items-center">
      <select {...rest} className={`appearance-none cursor-pointer rounded-lg border border-border text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${dense ? 'h-8 bg-background pl-2.5 pr-8 text-xs' : 'h-9 bg-card pl-3.5 pr-10 text-sm'} ${className}`}>{children}</select>
      <ChevronDown aria-hidden size={dense ? 13 : 15} className={`pointer-events-none absolute text-muted-foreground ${dense ? 'right-2.5' : 'right-3.5'}`} />
    </span>
  );
}
