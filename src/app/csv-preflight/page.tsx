'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  Info,
  Search,
  Sparkles,
  Upload,
  XCircle,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  StatGrid,
  StatusPill,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from '@/components/ops';
import type { ImportPreview, PreviewRowResult } from '@/app/api/leads/csv-import-preview/route';

type Severity = 'error' | 'warning' | 'info';
type OutcomeFilter = PreviewRowResult['outcome'] | 'LOCAL_ERROR' | 'all';

type ParsedRow = {
  rowIndex: number;
  address: string;
  contact: string;
  phone: string;
  city: string;
  state: string;
  zip: string;
  beds: string;
  baths: string;
  price: string;
  priceType: string;
  source: string;
  stage: string;
  notes: string;
  link: string;
  source_property_id?: string;
  apn?: string;
};

type LocalIssue = {
  severity: Severity;
  field: string;
  message: string;
};

type DisplayRow = {
  row: ParsedRow;
  preview: PreviewRowResult | null;
  issues: LocalIssue[];
  effectiveOutcome: Exclude<OutcomeFilter, 'all'>;
};

const ACTIVE_PIPELINE_STAGES = ['Contacted', 'Interested', 'Proposal Sent', 'Under Contract'];
const STATE_NAME_MAP: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

const OUTCOME_TONE: Record<Exclude<OutcomeFilter, 'all'>, 'success' | 'warning' | 'danger' | 'primary' | 'default'> = {
  NEW: 'success',
  UPDATED_EXISTING: 'primary',
  UNCHANGED_EXISTING: 'default',
  DUPLICATE_IN_FILE: 'warning',
  REVIEW_REQUIRED: 'warning',
  ERROR: 'danger',
  LOCAL_ERROR: 'danger',
};

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result;
}

function parseCSVText(text: string): ParsedRow[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
    } else {
      current += ch;
    }
  }

  if (current.trim()) lines.push(current);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const rows: ParsedRow[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCSVLine(lines[index]);
    const row: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      row[header] = (values[columnIndex] || '').trim().replace(/^"|"$/g, '');
    });

    rows.push({
      rowIndex: index,
      address: row.address || '',
      contact: row.contact || row.owner || row.contactname || '',
      phone: row.phone || row.contact_phone || row.contactphone || '',
      city: row.city || '',
      state: row.state || '',
      zip: row.zip || row.zipcode || '',
      beds: row.beds || row.bedsbaths || '',
      baths: row.baths || '',
      price: row.price || '',
      priceType: row.pricetype || row.price_type || 'rent',
      source: row.source || 'Direct',
      stage: row.stage || 'New Lead',
      notes: row.notes || '',
      link: row.link || row.url || row.listingurl || '',
      source_property_id: row.source_property_id || undefined,
      apn: row.apn || undefined,
    });
  }

  return rows;
}

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function normalizeStateCandidate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_NAME_MAP[trimmed.toLowerCase()] || trimmed.toUpperCase();
}

function getLocalIssues(row: ParsedRow): LocalIssue[] {
  const issues: LocalIssue[] = [];

  if (!row.address.trim() || row.address.trim().length < 5) {
    issues.push({ severity: 'error', field: 'address', message: 'CSV import skips rows without a usable address.' });
  }

  if (row.phone.trim() && !normalizePhone(row.phone)) {
    issues.push({ severity: 'warning', field: 'phone', message: 'Phone will not normalize to E.164, so it will not import as a verified number.' });
  }

  if (ACTIVE_PIPELINE_STAGES.includes(row.stage.trim())) {
    issues.push({ severity: 'info', field: 'stage', message: 'Import will coerce this stage back to “New Lead”; CSV uploads cannot advance active pipeline stages.' });
  }

  if (row.state.trim() && !/^[A-Za-z]{2}$/.test(row.state.trim()) && !STATE_NAME_MAP[row.state.trim().toLowerCase()]) {
    issues.push({ severity: 'warning', field: 'state', message: `State “${row.state}” does not map cleanly to a two-letter code and may not create the expected portfolio.` });
  }

  if (!row.city.trim() && !row.state.trim() && !row.zip.trim()) {
    issues.push({ severity: 'info', field: 'address', message: 'Dedup will rely mostly on the street line because city, state, and ZIP are all blank.' });
  }

  return issues;
}

function outcomeLabel(outcome: OutcomeFilter): string {
  if (outcome === 'LOCAL_ERROR') return 'LOCAL ERROR';
  return outcome.replace(/_/g, ' ');
}

function IssuePill({ issue }: { issue: LocalIssue }) {
  const tone = issue.severity === 'error' ? 'danger' : issue.severity === 'warning' ? 'warning' : 'primary';
  const Icon = issue.severity === 'error' ? XCircle : issue.severity === 'warning' ? AlertTriangle : Info;
  return <StatusPill tone={tone} icon={Icon}>{issue.field}</StatusPill>;
}

function OutcomePill({ outcome }: { outcome: Exclude<OutcomeFilter, 'all'> }) {
  return <StatusPill tone={OUTCOME_TONE[outcome]}>{outcomeLabel(outcome)}</StatusPill>;
}

export default function CsvPreflightPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');

  const reset = () => {
    setFileName('');
    setRows([]);
    setPreview(null);
    setError(null);
    setSearch('');
    setOutcomeFilter('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const analyzeFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a .csv file.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const parsedRows = parseCSVText(text);
      if (parsedRows.length === 0) {
        throw new Error('CSV appears empty or malformed.');
      }

      const importBatchId = globalThis.crypto?.randomUUID?.() ?? `preflight-${Date.now()}`;
      const response = await fetch('/api/leads/csv-import-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows, importBatchId }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error || 'Preview failed.');
      }

      setFileName(file.name);
      setRows(parsedRows);
      setPreview(body.preview as ImportPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.');
      setPreview(null);
      setRows([]);
      setFileName('');
    } finally {
      setLoading(false);
    }
  };

  const displayRows = useMemo<DisplayRow[]>(() => {
    const previewMap = new Map<number, PreviewRowResult>((preview?.rowResults || []).map((result) => [result.rowIndex, result]));
    return rows.map((row) => {
      const issues = getLocalIssues(row);
      const previewRow = previewMap.get(row.rowIndex) ?? null;
      const effectiveOutcome: Exclude<OutcomeFilter, 'all'> = issues.some((issue) => issue.severity === 'error') && !previewRow
        ? 'LOCAL_ERROR'
        : previewRow?.outcome ?? 'REVIEW_REQUIRED';
      return { row, preview: previewRow, issues, effectiveOutcome };
    });
  }, [preview, rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return displayRows.filter(({ row, preview: previewRow, issues, effectiveOutcome }) => {
      if (outcomeFilter !== 'all' && effectiveOutcome !== outcomeFilter) return false;
      if (!query) return true;
      const haystack = [
        row.address,
        row.contact,
        row.phone,
        row.city,
        row.state,
        row.zip,
        row.stage,
        row.source,
        previewRow?.normalizedAddress || '',
        previewRow?.matchStrategy || '',
        issues.map((issue) => issue.message).join(' '),
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [displayRows, outcomeFilter, search]);

  const localIssueCounts = useMemo(() => {
    return displayRows.reduce(
      (acc, item) => {
        const hasError = item.issues.some((issue) => issue.severity === 'error');
        const hasWarning = item.issues.some((issue) => issue.severity === 'warning');
        if (hasError) acc.errorRows += 1;
        if (hasWarning) acc.warningRows += 1;
        for (const issue of item.issues) {
          if (issue.severity === 'error') acc.errors += 1;
          if (issue.severity === 'warning') acc.warnings += 1;
          if (issue.field === 'stage') acc.stageOverrides += 1;
          if (issue.field === 'phone' && issue.severity === 'warning') acc.phoneWarnings += 1;
        }
        return acc;
      },
      { errors: 0, warnings: 0, errorRows: 0, warningRows: 0, stageOverrides: 0, phoneWarnings: 0 },
    );
  }, [displayRows]);

  const filterOptions: OutcomeFilter[] = ['all', 'NEW', 'UPDATED_EXISTING', 'UNCHANGED_EXISTING', 'DUPLICATE_IN_FILE', 'REVIEW_REQUIRED', 'LOCAL_ERROR'];

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <PageHeader
          icon={FileCheck2}
          title="CSV Pre-Flight Check"
          description="Runs the real /api/leads/csv-import-preview dedup logic without inserting or updating anything."
          actions={
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void analyzeFile(file);
                  event.currentTarget.value = '';
                }}
              />
              <button className={buttonSecondary} onClick={reset} disabled={loading || rows.length === 0}>Reset</button>
              <button className={buttonPrimary} onClick={() => fileInputRef.current?.click()} disabled={loading}>
                <Upload size={16} />
                {rows.length > 0 ? 'Analyze another CSV' : 'Choose CSV'}
              </button>
            </>
          }
        />

        {error && <ErrorBanner message={error} onRetry={() => fileInputRef.current?.click()} />}

        {!fileName && !loading && (
          <EmptyState
            icon={FileSpreadsheet}
            title="Drop in a CSV to inspect it before import"
            hint="Pre-flight checks the real dedup keys the importer uses: source_property_id, apn, dedup_fingerprint, plus a fallback address match. This page never writes to the database."
            action={<button className={buttonPrimary} onClick={() => fileInputRef.current?.click()}><Upload size={16} />Upload CSV</button>}
          />
        )}

        {loading && <LoadingState label="Running read-only import preview…" />}

        {!!fileName && !!preview && !loading && (
          <>
            <StatGrid
              columns={5}
              stats={[
                { label: 'Rows parsed', value: rows.length, hint: fileName, icon: FileSpreadsheet, tone: 'default' },
                { label: 'Unique after CSV dedup', value: preview.uniquePropertiesAfterCsvDedup, hint: `${preview.duplicatesWithinCsv} duplicate rows inside file`, icon: Database, tone: 'primary' },
                { label: 'New prospects', value: preview.newProspects, hint: 'Would insert as new leads', icon: Sparkles, tone: 'success' },
                { label: 'Existing matches', value: preview.existingMatches, hint: `${preview.existingToEnrich} would enrich`, icon: Eye, tone: 'primary' },
                { label: 'Rows with blocking issues', value: localIssueCounts.errorRows, hint: `${localIssueCounts.warningRows} rows have warnings`, icon: AlertTriangle, tone: localIssueCounts.errorRows > 0 ? 'danger' : 'success' },
              ]}
            />

            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <Panel title="What the real importer will do" icon={Database}>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    This preview calls <span className="font-mono text-foreground">/api/leads/csv-import-preview</span>, which checks the same lead columns the live importer uses:
                    <span className="ml-1 font-medium text-foreground">source_property_id</span>,
                    <span className="ml-1 font-medium text-foreground">apn</span>, and
                    <span className="ml-1 font-medium text-foreground">dedup_fingerprint</span>,
                    with a fallback address match.
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 text-success" />Only <span className="font-medium text-foreground">address</span> is required for a row to be considered.</li>
                    <li className="flex gap-2"><Info size={16} className="mt-0.5 text-primary" />CSV stages like Contacted or Proposal Sent will still import as <span className="font-medium text-foreground">New Lead</span>.</li>
                    <li className="flex gap-2"><Info size={16} className="mt-0.5 text-primary" />Missing city/state/ZIP reduces match quality but does not block import.</li>
                    <li className="flex gap-2"><XCircle size={16} className="mt-0.5 text-danger" />This pre-flight never posts to <span className="font-mono text-foreground">/api/leads/csv-import</span>, so it never creates leads, portfolios, or audit rows.</li>
                  </ul>
                </div>
              </Panel>

              <Panel title="Observed validation notes" icon={AlertTriangle}>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">Address errors</span>
                    <span className="font-semibold tabular-nums text-foreground">{localIssueCounts.errors}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">Phone warnings</span>
                    <span className="font-semibold tabular-nums text-foreground">{localIssueCounts.phoneWarnings}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">Stage overrides to New Lead</span>
                    <span className="font-semibold tabular-nums text-foreground">{localIssueCounts.stageOverrides}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">New state portfolios if imported</span>
                    <span className="font-semibold tabular-nums text-foreground">{preview.newPortfoliosToCreate}</span>
                  </div>
                </div>
              </Panel>
            </div>

            <Panel title="Preview filters" icon={Search}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-sm">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className={`${inputClass} pl-9`}
                    placeholder="Search address, state, match strategy, or note"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setOutcomeFilter(option)}
                      className={outcomeFilter === option ? buttonPrimary : buttonSecondary}
                    >
                      {option === 'all' ? `All (${displayRows.length})` : `${outcomeLabel(option)} (${displayRows.filter((item) => item.effectiveOutcome === option).length})`}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Row-by-row pre-flight report" icon={FileCheck2} padded={false}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Row</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Match</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Validation details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredRows.map(({ row, preview: previewRow, issues, effectiveOutcome }) => (
                      <tr key={row.rowIndex} className="align-top hover:bg-muted/20">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{row.rowIndex}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">{row.address || 'Missing address'}</div>
                            <div className="text-xs text-muted-foreground">
                              {[row.city, normalizeStateCandidate(row.state), row.zip].filter(Boolean).join(', ') || 'No city/state/ZIP'}
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              {row.contact && <span>Contact: {row.contact}</span>}
                              {row.phone && <span>Phone: {row.phone}</span>}
                              {row.source && <span>Source: {row.source}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><OutcomePill outcome={effectiveOutcome} /></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {previewRow ? (
                            <div className="space-y-1">
                              {previewRow.matchStrategy ? <div>Strategy: <span className="font-medium text-foreground">{previewRow.matchStrategy}</span></div> : <div>New lead candidate</div>}
                              {typeof previewRow.matchConfidence === 'number' && <div>Confidence: <span className="font-medium tabular-nums text-foreground">{previewRow.matchConfidence}%</span></div>}
                              {previewRow.normalizedAddress && <div className="break-words">Normalized: {previewRow.normalizedAddress}</div>}
                            </div>
                          ) : (
                            <span>{issues.some((issue) => issue.severity === 'error') ? 'Not sent to preview endpoint' : 'No preview result returned'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-2">
                            {issues.length === 0 && <span className="text-xs text-muted-foreground">No client-side issues detected.</span>}
                            {issues.map((issue, index) => (
                              <div key={`${row.rowIndex}-${index}`} className="space-y-1 rounded-xl border border-border bg-muted/20 p-2.5">
                                <IssuePill issue={issue} />
                                <p className="text-xs text-muted-foreground">{issue.message}</p>
                              </div>
                            ))}
                            {previewRow?.reviewReason && (
                              <div className="rounded-xl border border-border bg-muted/20 p-2.5 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Review note:</span> {previewRow.reviewReason}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRows.length === 0 && (
                <div className="p-6">
                  <EmptyState
                    icon={Search}
                    title="No rows match the current filters"
                    hint="Adjust the outcome filter or search query to see more of the preview report."
                  />
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </AppLayout>
  );
}
