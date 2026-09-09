'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ArrowLeft } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbNavProps {
  items: BreadcrumbItem[];
  /** Show a ← Back button before the breadcrumb trail */
  showBack?: boolean;
  className?: string;
}

/**
 * BreadcrumbNav — consistent back navigation for all drill-down views.
 * Usage:
 *   <BreadcrumbNav
 *     items={[
 *       { label: 'Lead Management', href: '/lead-management' },
 *       { label: '3200 Kalamath St' },
 *     ]}
 *     showBack
 *   />
 */
export default function BreadcrumbNav({ items, showBack = true, className = '' }: BreadcrumbNavProps) {
  const router = useRouter();

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}
    >
      {showBack && (
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors mr-1 shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Back</span>
        </button>
      )}

      {showBack && items.length > 0 && (
        <span className="text-border select-none">|</span>
      )}

      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <ChevronRight size={12} className="text-border shrink-0" aria-hidden />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors truncate max-w-[160px]"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={`truncate max-w-[200px] ${isLast ? 'text-foreground font-medium' : ''}`}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
