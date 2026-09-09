'use client';

import React, { useState, useCallback } from 'react';
import { Bug, Play, X, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ExternalLink, Copy, Filter, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface SampleLead {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  listing_url: string | null;
  listing_url_status: 'captured' | 'missing' | 'invalid';
  match_status: 'matched' | 'unmatched' | 'duplicate';
  score_assigned: number;
  enrichment_stage: 'none' | 'stage1' | 'stage2' | 'stage3';
  dedup_conflict: string | null;
  import_notes: string | null;
}

const ALL_SOURCES = [
  { key: 'trulia', name: 'Trulia' },
  { key: 'rentcom', name: 'Rent.com' },
  { key: 'realtorcom', name: 'Realtor.com' },
  { key: 'padmapper', name: 'PadMapper' },
  { key: 'apartmentlist', name: 'Apartment List' },
  { key: 'dwellsy', name: 'Dwellsy' },
  { key: 'zillow', name: 'Zillow' },
  { key: 'hotpads', name: 'HotPads' },
  { key: 'craigslist', name: 'Craigslist' },
  { key: 'apartments', name: 'Apartments.com' },
  { key: 'str_permits', name: 'STR Permits' },
];

const SOURCE_COLORS: Record<string, string> = {
  trulia: 'bg-green-100 text-green-700',
  rentcom: 'bg-blue-100 text-blue-700',
  realtorcom: 'bg-red-100 text-red-700',
  padmapper: 'bg-purple-100 text-purple-700',
  apartmentlist: 'bg-orange-100 text-orange-700',
  dwellsy: 'bg-teal-100 text-teal-700',
  zillow: 'bg-sky-100 text-sky-700',
  hotpads: 'bg-pink-100 text-pink-700',
  craigslist: 'bg-violet-100 text-violet-700',
  apartments: 'bg-cyan-100 text-cyan-700',
  str_permits: 'bg-amber-100 text-amber-700',
};

const DENVER_ADDRESSES = [
  { address: '1423 Ogden St', city: 'Denver', state: 'CO', zip: '80218' },
  { address: '2756 Champa St', city: 'Denver', state: 'CO', zip: '80205' },
  { address: '3891 Tennyson St', city: 'Denver', state: 'CO', zip: '80212' },
  { address: '514 Kalamath St', city: 'Denver', state: 'CO', zip: '80204' },
  { address: '1102 E Colfax Ave', city: 'Denver', state: 'CO', zip: '80218' },
  { address: '4455 Lowell Blvd', city: 'Denver', state: 'CO', zip: '80211' },
  { address: '2233 Welton St', city: 'Denver', state: 'CO', zip: '80205' },
  { address: '789 S Broadway', city: 'Denver', state: 'CO', zip: '80209' },
  { address: '3312 Pecos St', city: 'Denver', state: 'CO', zip: '80211' },
  { address: '1678 Blake St', city: 'Denver', state: 'CO', zip: '80202' },
  { address: '924 Clarkson St', city: 'Denver', state: 'CO', zip: '80218' },
  { address: '5021 Sheridan Blvd', city: 'Denver', state: 'CO', zip: '80212' },
  { address: '1345 Lawrence St', city: 'Denver', state: 'CO', zip: '80204' },
  { address: '2890 Navajo St', city: 'Denver', state: 'CO', zip: '80211' },
  { address: '467 N Downing St', city: 'Denver', state: 'CO', zip: '80218' },
  { address: '3156 Quivas St', city: 'Denver', state: 'CO', zip: '80211' },
  { address: '1789 Curtis St', city: 'Denver', state: 'CO', zip: '80202' },
  { address: '4234 Wolff St', city: 'Denver', state: 'CO', zip: '80212' },
  { address: '612 Emerson St', city: 'Denver', state: 'CO', zip: '80218' },
  { address: '2567 Osage St', city: 'Denver', state: 'CO', zip: '80211' },
];

function generateListingUrl(sourceKey: string, address: string, index: number): string | null {
  const slug = address.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const urlMap: Record<string, string> = {
    trulia: `https://www.trulia.com/rental/${slug}-${index}`,
    rentcom: `https://www.rent.com/colorado/denver-apartments/${slug}-${index}`,
    realtorcom: `https://www.realtor.com/realestateandhomes-detail/${slug}-${index}`,
    padmapper: `https://www.padmapper.com/apartments/${slug}-${index}`,
    apartmentlist: `https://www.apartmentlist.com/co/denver/${slug}-${index}`,
    dwellsy: `https://dwellsy.com/listing/${slug}-${index}`,
    zillow: `https://www.zillow.com/homedetails/${slug}-${index}`,
    hotpads: `https://hotpads.com/${slug}-${index}`,
    craigslist: index % 4 === 0 ? null : `https://denver.craigslist.org/apa/${7000000 + index * 17}.html`,
    apartments: `https://www.apartments.com/denver-co/${slug}-${index}`,
    str_permits: null,
  };
  return urlMap[sourceKey] ?? null;
}

function simulateImportTest(sourceKey: string, sampleSize: number): SampleLead[] {
  const results: SampleLead[] = [];
  const shuffled = [...DENVER_ADDRESSES].sort(() => Math.random() - 0.5).slice(0, sampleSize);

  for (let i = 0; i < shuffled.length; i++) {
    const addr = shuffled[i];
    const listingUrl = generateListingUrl(sourceKey, addr.address, i + 1);
    const isDuplicate = i === 3 || i === 11;
    const isUnmatched = i === 7;
    const score = isDuplicate ? 0 : Math.floor(Math.random() * 35) + 55;
    const enrichStages: SampleLead['enrichment_stage'][] = ['none', 'stage1', 'stage2', 'stage3'];
    const enrichStage = score >= 80 ? 'stage2' : score >= 70 ? 'stage1' : 'none';

    results.push({
      id: `sample-${sourceKey}-${i}`,
      address: addr.address,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      price: Math.floor(Math.random() * 1500) + 1800,
      beds: Math.floor(Math.random() * 3) + 1,
      baths: [1, 1.5, 2, 2.5][Math.floor(Math.random() * 4)],
      listing_url: listingUrl,
      listing_url_status: listingUrl ? 'captured' : 'missing',
      match_status: isDuplicate ? 'duplicate' : isUnmatched ? 'unmatched' : 'matched',
      score_assigned: score,
      enrichment_stage: enrichStage,
      dedup_conflict: isDuplicate ? `Duplicate of lead at ${shuffled[Math.max(0, i - 2)].address}` : null,
      import_notes: isUnmatched
        ? 'Address normalization failed — could not match to known market area'
        : listingUrl === null && sourceKey === 'craigslist' ?'Craigslist permalink expired — snapshot captured at import'
        : null,
    });
  }
  return results;
}

function MatchBadge({ status }: { status: SampleLead['match_status'] }) {
  const map = {
    matched: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={10} />, label: 'Matched' },
    unmatched: { cls: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle size={10} />, label: 'Unmatched' },
    duplicate: { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Copy size={10} />, label: 'Duplicate' },
  };
  const { cls, icon, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {icon}{label}
    </span>
  );
}

function UrlBadge({ status, url }: { status: SampleLead['listing_url_status']; url: string | null }) {
  if (status === 'captured' && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
        onClick={e => e.stopPropagation()}
      >
        <ExternalLink size={9} />
        Captured
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
      <AlertTriangle size={9} />
      {status === 'missing' ? 'Missing' : 'Invalid'}
    </span>
  );
}

function EnrichBadge({ stage }: { stage: SampleLead['enrichment_stage'] }) {
  const map = {
    none: { cls: 'text-muted-foreground', label: 'None' },
    stage1: { cls: 'text-blue-600', label: 'S1 Owner' },
    stage2: { cls: 'text-purple-600', label: 'S2 Contact' },
    stage3: { cls: 'text-emerald-600', label: 'S3 Skip' },
  };
  const { cls, label } = map[stage];
  return <span className={`text-[10px] font-semibold ${cls}`}>{label}</span>;
}

interface ImportDebugPanelProps {
  onClose: () => void;
}

export default function ImportDebugPanel({ onClose }: ImportDebugPanelProps) {
  const [selectedSource, setSelectedSource] = useState(ALL_SOURCES[0].key);
  const [sampleSize, setSampleSize] = useState(15);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SampleLead[] | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'matched' | 'unmatched' | 'duplicate'>('all');

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResults(null);
    setExpandedRow(null);
    // Simulate async import test
    await new Promise(r => setTimeout(r, 1200));
    const data = simulateImportTest(selectedSource, sampleSize);
    setResults(data);
    setRunning(false);
    const matched = data.filter(d => d.match_status === 'matched').length;
    const dupes = data.filter(d => d.match_status === 'duplicate').length;
    toast.success(`Import test complete — ${matched} matched, ${dupes} duplicates, ${data.length - matched - dupes} unmatched`);
  }, [selectedSource, sampleSize]);

  const filteredResults = results?.filter(r => filterStatus === 'all' || r.match_status === filterStatus) ?? [];
  const sourceName = ALL_SOURCES.find(s => s.key === selectedSource)?.name ?? selectedSource;

  const stats = results ? {
    matched: results.filter(r => r.match_status === 'matched').length,
    unmatched: results.filter(r => r.match_status === 'unmatched').length,
    duplicate: results.filter(r => r.match_status === 'duplicate').length,
    urlCaptured: results.filter(r => r.listing_url_status === 'captured').length,
    avgScore: Math.round(results.filter(r => r.match_status === 'matched').reduce((s, r) => s + r.score_assigned, 0) / Math.max(results.filter(r => r.match_status === 'matched').length, 1)),
  } : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Bug size={15} className="text-orange-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Import Debug — Admin</h3>
              <p className="text-[10px] text-muted-foreground">Run a test import with sample listings to validate pipeline</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X size={15} className="text-muted-foreground" />
          </button>
        </div>

        {/* Config */}
        <div className="px-5 py-4 border-b border-border bg-muted/20 shrink-0">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Source
              </label>
              <select
                value={selectedSource}
                onChange={e => setSelectedSource(e.target.value)}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
              >
                {ALL_SOURCES.map(s => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Sample Size
              </label>
              <select
                value={sampleSize}
                onChange={e => setSampleSize(Number(e.target.value))}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option value={10}>10 listings</option>
                <option value={15}>15 listings</option>
                <option value={20}>20 listings</option>
              </select>
            </div>
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-60 transition-colors"
            >
              {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
              {running ? 'Running test...' : 'Run Import Test'}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {running && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <RefreshCw size={24} className="animate-spin text-orange-500" />
              <p className="text-sm text-muted-foreground">Simulating import from {sourceName}...</p>
              <p className="text-xs text-muted-foreground">Checking {sampleSize} sample listings · validating URLs · running dedup · scoring</p>
            </div>
          )}

          {!running && !results && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Zap size={24} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Select a source and run the import test</p>
              <p className="text-xs text-muted-foreground">Results will show match status, URL capture, scores, and dedup conflicts</p>
            </div>
          )}

          {!running && results && stats && (
            <div className="p-5 space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { label: 'Matched', value: stats.matched, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Unmatched', value: stats.unmatched, color: 'text-red-600', bg: 'bg-red-50' },
                  { label: 'Duplicates', value: stats.duplicate, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'URLs Captured', value: `${stats.urlCaptured}/${results.length}`, color: 'text-primary', bg: 'bg-primary/10' },
                  { label: 'Avg Score', value: stats.avgScore, color: 'text-foreground', bg: 'bg-muted/50' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {/* Filter */}
              <div className="flex items-center gap-2">
                <Filter size={12} className="text-muted-foreground" />
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                  {(['all', 'matched', 'unmatched', 'duplicate'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterStatus(f)}
                      className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors capitalize ${filterStatus === f ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{filteredResults.length} results</span>
              </div>

              {/* Results table */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Address</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Status</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Listing URL</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Score</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Enrichment</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Dedup</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredResults.map(lead => (
                        <React.Fragment key={lead.id}>
                          <tr
                            className={`hover:bg-muted/20 transition-colors cursor-pointer ${lead.match_status === 'duplicate' ? 'bg-amber-50/30' : lead.match_status === 'unmatched' ? 'bg-red-50/30' : ''}`}
                            onClick={() => setExpandedRow(expandedRow === lead.id ? null : lead.id)}
                          >
                            <td className="px-3 py-2.5">
                              <div>
                                <p className="font-medium text-foreground">{lead.address}</p>
                                <p className="text-muted-foreground">{lead.city}, {lead.state} · {lead.beds}bd/{lead.baths}ba · ${lead.price.toLocaleString()}/mo</p>
                              </div>
                            </td>
                            <td className="px-3 py-2.5"><MatchBadge status={lead.match_status} /></td>
                            <td className="px-3 py-2.5"><UrlBadge status={lead.listing_url_status} url={lead.listing_url} /></td>
                            <td className="px-3 py-2.5 text-right">
                              <span className={`font-bold ${lead.score_assigned >= 80 ? 'text-emerald-600' : lead.score_assigned >= 70 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                {lead.match_status === 'duplicate' ? '—' : lead.score_assigned}
                              </span>
                            </td>
                            <td className="px-3 py-2.5"><EnrichBadge stage={lead.enrichment_stage} /></td>
                            <td className="px-3 py-2.5">
                              {lead.dedup_conflict ? (
                                <span className="text-amber-600 flex items-center gap-1">
                                  <AlertTriangle size={9} />
                                  Conflict
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                          {expandedRow === lead.id && (lead.dedup_conflict || lead.import_notes || lead.listing_url) && (
                            <tr className="bg-muted/10">
                              <td colSpan={6} className="px-3 py-3">
                                <div className="space-y-1.5">
                                  {lead.listing_url && (
                                    <div className="flex items-start gap-2">
                                      <span className="text-[10px] font-semibold text-muted-foreground w-20 shrink-0">URL:</span>
                                      <a href={lead.listing_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline break-all flex items-center gap-1">
                                        {lead.listing_url} <ExternalLink size={8} />
                                      </a>
                                    </div>
                                  )}
                                  {lead.dedup_conflict && (
                                    <div className="flex items-start gap-2">
                                      <span className="text-[10px] font-semibold text-amber-600 w-20 shrink-0">Dedup:</span>
                                      <span className="text-[10px] text-amber-700">{lead.dedup_conflict}</span>
                                    </div>
                                  )}
                                  {lead.import_notes && (
                                    <div className="flex items-start gap-2">
                                      <span className="text-[10px] font-semibold text-muted-foreground w-20 shrink-0">Notes:</span>
                                      <span className="text-[10px] text-muted-foreground">{lead.import_notes}</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
