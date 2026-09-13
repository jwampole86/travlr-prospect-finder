import Link from 'next/link';

export default function MarketingFooter() {
  return (
    <footer className="border-t border-border py-10 mt-16">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} TRAVLR Vacation Homes. All rights reserved.</p>
        <div className="flex items-center gap-5">
          <Link href="/prospect-finder/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          <Link href="/prospect-finder/contact-sales" className="hover:text-foreground transition-colors">Contact Sales</Link>
          <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
        </div>
      </div>
    </footer>
  );
}
