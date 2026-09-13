'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';

export default function MarketingHeader() {
  const pathname = usePathname();
  const isPlans = pathname === '/plans';
  const isHome = pathname === '/welcome';

  return (
    <header className="border-b border-border bg-card/95 backdrop-blur-sm sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <Link href="/welcome" className="flex items-center gap-2.5">
          <AppLogo size={26} />
          <span className="text-sm font-bold text-foreground">VAYO</span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-sm font-medium shrink-0">
          <Link
            href="/welcome"
            aria-current={isHome ? 'page' : undefined}
            className={isHome ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground transition-colors'}
          >
            Home
          </Link>
          <Link
            href="/plans"
            aria-current={isPlans ? 'page' : undefined}
            className={isPlans ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground transition-colors'}
          >
            Plans
          </Link>
          <Link href="/plans#enterprise" className="text-muted-foreground hover:text-foreground transition-colors">Enterprise</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Link
            href="/plans"
            className="px-3 py-1.5 text-xs sm:text-sm bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Plans
          </Link>
        </div>
      </div>
    </header>
  );
}
