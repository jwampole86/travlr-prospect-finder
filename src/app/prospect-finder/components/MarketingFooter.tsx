import Link from 'next/link';

export default function MarketingFooter() {
  return (
    <footer className="border-t border-border py-8 sm:py-10 mt-16 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground text-center sm:text-left">
        <p>&copy; {new Date().getFullYear()} AVYRO AI. All rights reserved.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link href="/plans" className="py-2 hover:text-foreground transition-colors">Pricing</Link>
          <Link href="/prospect-finder/contact-sales" className="py-2 hover:text-foreground transition-colors">Contact Sales</Link>
          <Link href="/login" className="py-2 hover:text-foreground transition-colors">Sign In</Link>
        </div>
      </div>
    </footer>
  );
}
