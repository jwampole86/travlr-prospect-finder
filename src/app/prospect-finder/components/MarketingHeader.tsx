'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { useLanguage } from '@/contexts/LanguageContext';

export default function MarketingHeader() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const isPlans = pathname === '/plans';
  const isHome = pathname === '/welcome';
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  // Always land at the top of the destination page when navigating between marketing
  // pages (Home/Plans) — only skip this when a hash is present (e.g. #plan-enterprise),
  // so anchor links still scroll to their target section instead of the top.
  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash) return;
    window.requestAnimationFrame(() => window.scrollTo(0, 0));
  }, [pathname]);

  return (
    <header className="border-b border-border bg-card/95 backdrop-blur-sm sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 sm:gap-4">
        <Link href="/welcome" className="flex items-center gap-2.5 min-h-[44px]">
          <AppLogo size={26} />
          <span className="text-sm font-bold text-foreground">AVYRO AI</span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-sm font-medium shrink-0">
          <Link
            href="/welcome"
            aria-current={isHome ? 'page' : undefined}
            className={isHome ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground transition-colors'}
          >
            {t('common.home')}
          </Link>
          <Link href="/product" aria-current={pathname === '/product' ? 'page' : undefined} className={pathname === '/product' ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground transition-colors'}>{t('common.product')}</Link>
          <Link href="/how-it-works" aria-current={pathname === '/how-it-works' ? 'page' : undefined} className={pathname === '/how-it-works' ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground transition-colors'}>{t('common.howItWorks')}</Link>
          <Link
            href="/plans"
            aria-current={isPlans ? 'page' : undefined}
            className={isPlans ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground transition-colors'}
          >
            {t('common.plans')}
          </Link>
          <Link href="/about" aria-current={pathname === '/about' ? 'page' : undefined} className={pathname === '/about' ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground transition-colors'}>{t('common.about')}</Link>
          <Link href="/plans#plan-enterprise" className="text-muted-foreground hover:text-foreground transition-colors">{t('common.enterprise')}</Link>
        </nav>
        <div className="flex items-center gap-1 sm:gap-3">
          <Link href="/login" className="px-2.5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t('common.signIn')}
          </Link>
          <Link
            href="/request-demo"
            className="px-3.5 py-2.5 text-sm bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            {t('common.requestDemo')}
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? t('common.closeMenu') : t('common.openMenu')}
            aria-expanded={menuOpen}
            aria-controls="marketing-mobile-menu"
            className="md:hidden w-11 h-11 -mr-1 flex items-center justify-center rounded-lg text-foreground hover:bg-muted transition-colors"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav id="marketing-mobile-menu" className="md:hidden border-t border-border bg-card px-4 py-2 flex flex-col">
          {[
            { href: '/welcome', label: t('common.home') },
            { href: '/product', label: t('common.product') },
            { href: '/how-it-works', label: t('common.howItWorks') },
            { href: '/plans', label: t('common.plans') },
            { href: '/about', label: t('common.about') },
            { href: '/request-demo', label: t('common.requestDemo') },
            { href: '/plans#plan-enterprise', label: t('common.enterprise') },
            { href: '/prospect-finder/contact-sales', label: t('common.contactSales') },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="min-h-[48px] flex items-center text-base font-medium text-foreground border-b border-border/60 last:border-0">
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
