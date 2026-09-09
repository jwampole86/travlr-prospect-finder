import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Lead } from '@/data/mockLeads';
import RegulationBadge from '@/components/ui/RegulationBadge';
import StageBadge from '@/components/ui/StageBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import { ExternalLink, ArrowRight, AlertTriangle } from 'lucide-react';

interface TopLeadsTableProps {
  leads: Lead[];
}

function formatCurrency(n: number) {
  return '$' + n.toLocaleString('en-US');
}

/** Reusable listing-link button — same behavior as the Lead Detail page link */
function ListingLinkButton({ listingUrl, address }: { listingUrl?: string | null; address: string }) {
  if (listingUrl) {
    return (
      <a
        href={listingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shrink-0"
        aria-label={`Open listing for ${address}`}
        title="Open original listing"
      >
        <ExternalLink size={11} />
      </a>
    );
  }

  // Disabled state — listing unavailable
  return (
    <span
      className="inline-flex items-center justify-center text-muted-foreground/30 cursor-not-allowed shrink-0"
      aria-label="Original listing unavailable"
      title="Original listing unavailable"
    >
      <ExternalLink size={11} />
    </span>
  );
}

/**
 * Detect if the top leads are suspiciously identical (same address+price+score across rows).
 * This surfaces a data-quality warning instead of silently showing duplicate data.
 */
function detectDuplicateDataAnomaly(leads: Lead[]): boolean {
  if (leads.length < 2) return false;
  const first = leads[0];
  // If 3+ rows share the exact same address, price, AND score — flag it
  const identicalCount = leads.filter(
    (l) =>
      l.address === first.address &&
      l.price === first.price &&
      l.prospectScore === first.prospectScore &&
      l.beds === first.beds &&
      l.baths === first.baths
  ).length;
  return identicalCount >= 3;
}

export default React.memo(function TopLeadsTable({ leads }: TopLeadsTableProps) {
  const router = useRouter();
  const { topLeads, hasDuplicateAnomaly } = useMemo(() => {
    // Step 1: Filter out disqualified leads
    const eligible = leads.filter((l) => l.stage !== 'Not a Fit');

    // Step 2: Sort by score descending
    const sorted = [...eligible].sort((a, b) => b.prospectScore - a.prospectScore);

    // Step 3: Deduplicate — two passes:
    //   Pass A: by lead ID (prevents the same DB row appearing twice)
    //   Pass B: by address+price (prevents the same property appearing under different IDs
    //           when the sync inserted duplicate rows for the same listing)
    const seenIds = new Set<string>();
    const seenAddressPrice = new Set<string>();
    const deduped: Lead[] = [];
    for (const lead of sorted) {
      const addrKey = `${lead.address.toLowerCase().trim()}|${lead.price}`;
      if (!seenIds.has(lead.id) && !seenAddressPrice.has(addrKey)) {
        seenIds.add(lead.id);
        seenAddressPrice.add(addrKey);
        deduped.push(lead);
      }
    }

    // Step 4: Take top 6 distinct leads
    const top = deduped.slice(0, 6);

    // Step 5: Detect anomaly — identical address/price/score across rows
    // (indicates a sync seed collision or stale placeholder data)
    // Only flag when duplicates actually survived deduplication (shouldn't happen normally)
    const anomaly = detectDuplicateDataAnomaly(top);

    return { topLeads: top, hasDuplicateAnomaly: anomaly };
  }, [leads]);

  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Top Scored Leads</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Highest priority properties for outreach</p>
        </div>
        <Link
          href="/lead-management"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View all <ArrowRight size={11} />
        </Link>
      </div>

      {/* Data quality warning — shown when duplicate anomaly detected */}
      {hasDuplicateAnomaly && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
          <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <span className="font-semibold">Data sync issue detected.</span> Multiple rows show identical address, price, and score — this may indicate a failed or stale sync. Check{' '}
            <Link href="/data-sync" className="underline hover:no-underline">Data Sync</Link> for errors.
          </p>
        </div>
      )}

      {/* Mobile card layout */}
      <div className="sm:hidden divide-y divide-border">
        {topLeads.length === 0 ? (
          <p className="px-5 py-8 text-xs text-muted-foreground text-center">No leads to display</p>
        ) : topLeads.map((lead) => (
          <div
            key={lead.id}
            className="px-4 py-3 space-y-1.5 cursor-pointer hover:bg-muted/40 transition-colors"
            onClick={() => router.push(`/lead-profile?id=${lead.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && router.push(`/lead-profile?id=${lead.id}`)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-foreground truncate">{lead.address}</p>
                  <ListingLinkButton listingUrl={lead.listingUrl} address={lead.address} />
                </div>
                <p className="text-[10px] text-muted-foreground">{lead.city}, {lead.state}</p>
              </div>
              <ProspectScoreBar score={lead.prospectScore} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StageBadge stage={lead.stage} size="sm" />
              <RegulationBadge status={lead.regulationStatus} size="sm" />
              <span className="text-[10px] text-muted-foreground">{lead.beds}bd/{lead.baths}ba</span>
              <span className="text-[10px] font-semibold text-success ml-auto">{formatCurrency(lead.estimatedNetMonthly)}/mo</span>
            </div>
          </div>
        ))}
      </div>
      {/* Desktop table layout */}
      <div className="hidden sm:block overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Address', 'Beds', 'Price', 'Stage', 'Regulation', 'Score', 'Est. Net/Mo'].map((h) => (
                <th
                  key={`top-th-${h}`}
                  className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topLeads.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors duration-100 cursor-pointer"
                onClick={() => router.push(`/lead-profile?id=${lead.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && router.push(`/lead-profile?id=${lead.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground text-xs truncate max-w-[140px]">
                      {lead.address}
                    </span>
                    <ListingLinkButton listingUrl={lead.listingUrl} address={lead.address} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{lead.city}, {lead.state}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono-data text-xs text-foreground">
                    {lead.beds}bd/{lead.baths}ba
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono-data text-xs text-foreground">
                    {formatCurrency(lead.price)}/mo
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StageBadge stage={lead.stage} size="sm" />
                </td>
                <td className="px-4 py-3">
                  <RegulationBadge status={lead.regulationStatus} size="sm" />
                </td>
                <td className="px-4 py-3 w-28">
                  <ProspectScoreBar score={lead.prospectScore} />
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono-data text-xs font-semibold text-success">
                    {formatCurrency(lead.estimatedNetMonthly)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});