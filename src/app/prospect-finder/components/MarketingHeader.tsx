'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';

export default function MarketingHeader() {
  const pathname = usePathname();
  const isPlans = pathname === '/plans';

  return (
    <header className="border-b border-border bg-card/95 backdrop-blur-sm sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <Link href="/plans" className="flex items-center gap-2.5">
          <AppLogo src="/assets/images/EFB407B4-CD49-4BC9-9A8E-9894DB058712-1786579880495.PNG" size={26} />
          <span className="text-sm font-bold text-foreground">VAYO</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium">
          <Link href="/plans#value" className="text-muted-foreground hover:text-foreground transition-colors">Features</Link>
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
            href="/prospect-finder/contact-sales"
            className="px-3 py-1.5 text-xs sm:text-sm border border-border rounded-lg hover:bg-muted transition-colors font-medium"
          >
            Contact Sales
          </Link>
        </div>
      </div>
    </header>
  );
}
