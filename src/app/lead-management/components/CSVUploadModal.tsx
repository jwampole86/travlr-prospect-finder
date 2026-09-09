'use client';

import React, { useState, useRef, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import type { Lead, LeadSource } from '@/data/mockLeads';
import { Upload, FileText, AlertCircle, CheckCircle, X, Phone, CheckCircle2, Building2, TrendingUp, Eye, ArrowRight, RefreshCw, Info, ChevronDown, ChevronUp, Loader2,  } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { ImportPreview, PreviewRowResult } from '@/app/api/leads/csv-import-preview/route';
import Icon from '@/components/ui/AppIcon';


const VALID_SOURCES: LeadSource[] = [
  'Zillow', 'Craigslist', 'Facebook Marketplace', 'Realtor.com',
  'Direct', 'Referral', 'LoopNet', 'HotPads', 'Apartments.com',
  'Trulia', 'Redfin', 'MLS', 'Airbnb', 'VRBO', 'Other',
];

function normalizeSource(raw: string): LeadSource {
  if (!raw) return 'Direct';
  const trimmed = raw.trim();
  const match = VALID_SOURCES.find(s => s.toLowerCase() === trimmed.toLowerCase());
  return match ?? 'Other';
}

interface CSVUploadModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (leads: Lead[]) => void;
}

interface ParsedRow {
  source: string; address: string; contact: string; phone: string;
  city: string; state: string; zip: string; beds: string; baths: string;
  price: string; notes: string; link: string; stage: string;
  contact_phone?: string; contact_email?: string;
}

interface ImportSummary {
  rowsProcessed: number; newProspectsCreated: number; existingProspectsEnriched: number;
  duplicatesMerged: number; phoneNumbersImported: number; rentPricesFound: number;
  rentPricesUnavailable: number; newPortfoliosCreated: number; existingPortfoliosReused: number;
  errors: number; rowsNew: number; rowsUpdatedExisting: number; rowsDuplicateInFile: number;
  rowsUnchangedExisting: number; rowsReviewRequired: number; rowsError: number;
  postAuditDuplicatesFound?: number;
}

function parseCSVText(text: string): ParsedRow[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else { current += ch; }
  }
  if (current.trim()) lines.push(current);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim().replace(/^"|"$/g, ''); });
    rows.push({
      source: row['source'] || 'Direct', address: row['address'] || '',
      contact: row['contact'] || row['owner'] || row['contactname'] || '',
      phone: row['phone'] || row['contact_phone'] || row['contactphone'] || '',
      city: row['city'] || '', state: row['state'] || '',
      zip: row['zip'] || row['zipcode'] || '',
      beds: row['beds'] || row['bedsbaths'] || '3', baths: row['baths'] || '2',
      price: row['price'] || '0', notes: row['notes'] || '',
      link: row['link'] || row['url'] || row['listingurl'] || '',
      stage: row['stage'] || 'New Lead',
      contact_phone: row['contact_phone'] || row['phone'] || row['contactphone'] || undefined,
      contact_email: row['contact_email'] || row['email'] || undefined,
    });
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

// ── Outcome badge ─────────────────────────────────────────────────────────────
function OutcomeBadge({ outcome }: { outcome: PreviewRowResult['outcome'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    NEW: { label: 'NEW', cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
    UPDATED_EXISTING: { label: 'ENRICH', cls: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
    UNCHANGED_EXISTING: { label: 'UNCHANGED', cls: 'bg-muted text-muted-foreground border-border' },
    DUPLICATE_IN_FILE: { label: 'DUPE', cls: 'bg-purple-500/10 text-purple-700 border-purple-500/20' },
    REVIEW_REQUIRED: { label: 'REVIEW', cls: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
    ERROR: { label: 'ERROR', cls: 'bg-red-500/10 text-red-700 border-red-500/20' },
  };
  const { label, cls } = map[outcome] || map.ERROR;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${cls}`}>
      {label}
    </span>
  );
}

export default function CSVUploadModal({ open, onClose, onImport }: CSVUploadModalProps) {
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState('');

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [showPreviewDetails, setShowPreviewDetails] = useState(false);

  // Import state
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importBatchId, setImportBatchId] = useState<string>('');

  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv')) { setError('Please upload a .csv file'); return; }
    setError('');
    setFile(f);
    setProgress(0);
    setImportPreview(null);
    setImportSummary(null);
    setImportBatchId('');

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSVText(text);
      if (rows.length === 0) { setError('CSV appears empty or malformed.'); return; }
      setParsedRows(rows);
      const avgBytesPerRow = text.length / Math.max(rows.length, 1);
      setTotalRows(Math.round(f.size / avgBytesPerRow));
    };
    reader.readAsText(f.slice(0, 65536));
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  // ── STEP 1: Calculate preview ─────────────────────────────────────────────
  async function handleCalculatePreview() {
    if (!file) return;
    setPreviewLoading(true);
    setError('');

    try {
      const reader = new FileReader();
      const text = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      const rows = parseCSVText(text);
      if (rows.length === 0) { setError('CSV appears empty or malformed.'); setPreviewLoading(false); return; }
      setParsedRows(rows);

      const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setImportBatchId(batchId);

      // Send all rows to preview endpoint (chunked for large files)
      const CHUNK_SIZE = 200;
      const allPreviewResults: PreviewRowResult[] = [];
      let mergedPreview: ImportPreview | null = null;

      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const res = await fetch('/api/leads/csv-import-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk, importBatchId: batchId }),
        });
        if (!res.ok) throw new Error('Preview calculation failed');
        const data = await res.json();
        if (data.preview) {
          const p: ImportPreview = data.preview;
          allPreviewResults.push(...p.rowResults);
          if (!mergedPreview) {
            mergedPreview = { ...p };
          } else {
            mergedPreview.csvRows += p.csvRows;
            mergedPreview.uniquePropertiesAfterCsvDedup += p.uniquePropertiesAfterCsvDedup;
            mergedPreview.newProspects += p.newProspects;
            mergedPreview.existingMatches += p.existingMatches;
            mergedPreview.existingToEnrich += p.existingToEnrich;
            mergedPreview.unchangedExisting += p.unchangedExisting;
            mergedPreview.duplicatesWithinCsv += p.duplicatesWithinCsv;
            mergedPreview.reviewRequired += p.reviewRequired;
            mergedPreview.newPhoneNumbers += p.newPhoneNumbers;
            mergedPreview.verifiedPhoneLeads += p.verifiedPhoneLeads;
            // Merge state breakdown
            for (const [k, v] of Object.entries(p.stateBreakdown)) {
              mergedPreview.stateBreakdown[k] = (mergedPreview.stateBreakdown[k] || 0) + v;
            }
            // Merge new states (deduplicate)
            const existingNewStates = new Set(mergedPreview.newStates);
            for (const s of p.newStates) { existingNewStates.add(s); }
            mergedPreview.newStates = [...existingNewStates];
            mergedPreview.newPortfoliosToCreate = mergedPreview.newStates.length;
          }
        }
      }

      if (mergedPreview) {
        mergedPreview.rowResults = allPreviewResults;
        setImportPreview(mergedPreview);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── STEP 2: Confirm and commit import ─────────────────────────────────────
  async function handleConfirmImport() {
    if (!file || !importPreview) return;
    setImporting(true);
    setProgress(0);
    setProgressLabel('Reading file…');

    try {
      const reader = new FileReader();
      const text = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      const rows = parseCSVText(text);
      setProgress(20);
      setProgressLabel(`Committing ${rows.length.toLocaleString()} rows…`);

      const CHUNK_SIZE = 50;
      const chunks: typeof rows[] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) chunks.push(rows.slice(i, i + CHUNK_SIZE));

      const agg: ImportSummary = {
        rowsProcessed: 0, newProspectsCreated: 0, existingProspectsEnriched: 0,
        duplicatesMerged: 0, phoneNumbersImported: 0, rentPricesFound: 0,
        rentPricesUnavailable: 0, newPortfoliosCreated: 0, existingPortfoliosReused: 0,
        errors: 0, rowsNew: 0, rowsUpdatedExisting: 0, rowsDuplicateInFile: 0,
        rowsUnchangedExisting: 0, rowsReviewRequired: 0, rowsError: 0,
      };

      let chunksDone = 0;
      for (const chunk of chunks) {
        try {
          const res = await fetch('/api/leads/csv-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rows: chunk,
              importFilename: file.name,
              importedBy: user?.id,
              importBatchId: importBatchId,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.summary) {
              const s = data.summary;
              agg.rowsProcessed += s.rowsProcessed || 0;
              agg.newProspectsCreated += s.newProspectsCreated || 0;
              agg.existingProspectsEnriched += s.existingProspectsEnriched || 0;
              agg.duplicatesMerged += s.duplicatesMerged || 0;
              agg.phoneNumbersImported += s.phoneNumbersImported || 0;
              agg.rentPricesFound += s.rentPricesFound || 0;
              agg.rentPricesUnavailable += s.rentPricesUnavailable || 0;
              agg.newPortfoliosCreated = Math.max(agg.newPortfoliosCreated, s.newPortfoliosCreated || 0);
              agg.existingPortfoliosReused = Math.max(agg.existingPortfoliosReused, s.existingPortfoliosReused || 0);
              agg.errors += s.errors || 0;
              agg.rowsNew += s.rowsNew || 0;
              agg.rowsUpdatedExisting += s.rowsUpdatedExisting || 0;
              agg.rowsDuplicateInFile += s.rowsDuplicateInFile || 0;
              agg.rowsUnchangedExisting += s.rowsUnchangedExisting || 0;
              agg.rowsReviewRequired += s.rowsReviewRequired || 0;
              agg.rowsError += s.rowsError || 0;
            }
          } else {
            agg.errors += chunk.length;
          }
        } catch { agg.errors += chunk.length; }
        chunksDone++;
        setProgress(20 + Math.round((chunksDone / chunks.length) * 65));
        setProgressLabel(`Importing batch ${chunksDone}/${chunks.length}…`);
      }

      // Post-import duplicate audit
      setProgressLabel('Running duplicate audit…');
      try {
        const auditRes = await fetch('/api/leads/csv-post-import-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ importBatchId }),
        });
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          agg.postAuditDuplicatesFound = auditData.audit?.duplicateGroupsFound || 0;
        }
      } catch { /* non-blocking */ }

      setProgress(100);
      setProgressLabel('Complete!');
      setImportSummary(agg);

      // Pass minimal lead stubs to onImport — the parent (LeadManagementClient)
      // will immediately refresh from the server, so these stubs are only used
      // to signal the import count. We pass the actual count as a synthetic array.
      const importedLeadStubs: Lead[] = Array.from({ length: agg.newProspectsCreated }, (_, i) => ({
        id: `lead-import-stub-${Date.now()}-${i}`,
        address: rows[i]?.address || '', city: rows[i]?.city || '', state: rows[i]?.state || '',
        zip: rows[i]?.zip || '', lat: 0, lng: 0,
        beds: parseInt(rows[i]?.beds || '3') || 3, baths: parseFloat(rows[i]?.baths || '2') || 2,
        price: parseFloat((rows[i]?.price || '0').replace(/[^0-9.]/g, '')) || 0,
        priceType: 'rent' as const, source: normalizeSource(rows[i]?.source || 'Direct'),
        stage: ((rows[i]?.stage || 'New Lead') as Lead['stage']),
        regulationStatus: 'Unknown' as const,
        prospectScore: 0, daysOnMarket: 0,
        lastChecked: new Date().toISOString().split('T')[0],
        listingUrl: rows[i]?.link || '', notes: rows[i]?.notes || '',
        contactName: rows[i]?.contact || undefined,
        contactPhone: rows[i]?.phone || undefined,
        tags: ['MANUAL_VERIFIED_IMPORT'],
        estimatedADR: 0, estimatedOccupancy: 0,
        estimatedGrossMonthly: 0, estimatedNetMonthly: 0, photos: [],
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString().split('T')[0],
      } as Lead));

      onImport(importedLeadStubs);
      toast.success(
        `Import complete: ${agg.newProspectsCreated} new + ${agg.existingProspectsEnriched} enriched`,
        { duration: 6000 }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    if (importing || previewLoading) return;
    setFile(null); setParsedRows([]); setError(''); setTotalRows(0);
    setProgress(0); setImportPreview(null); setImportSummary(null);
    setImportBatchId(''); setShowPreviewDetails(false);
    onClose();
  }

  const fileSizeMB = file ? (file.size / (1024 * 1024)).toFixed(2) : '0';
  const previewRows = parsedRows.slice(0, 5);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal open={open} onClose={handleClose} title="Upload Verified CSV Leads" size="lg">
      <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">

        {/* Format guide */}
        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-400">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <FileText size={12} />
            Expected CSV columns (TRAVLR Verified Import):
          </p>
          <p className="font-mono text-[11px] bg-blue-500/10 px-2 py-1 rounded mt-1">
            Address, Contact, Phone, City, State, Zip, Beds, Baths, Price, Notes, Link, Source, Stage
          </p>
          <p className="mt-1.5 text-muted-foreground">
            <strong>Additive import only</strong> — existing prospects are never deleted. Matching properties are merged/enriched. A preview is calculated before any changes are made.
          </p>
        </div>

        {/* Drop zone */}
        {!importSummary && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !importing && !previewLoading && fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 ${
              dragOver ? 'border-primary bg-primary/5' : file ?'border-emerald-500 bg-emerald-500/5': 'border-border hover:border-primary/50 hover:bg-muted/30'
            } ${(importing || previewLoading) ? 'cursor-not-allowed opacity-70' : ''}`}
            role="button"
            aria-label="Upload CSV file"
          >
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle size={26} className="text-emerald-600" />
                <p className="text-sm font-semibold text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {parseFloat(fileSizeMB) >= 1 ? `${fileSizeMB} MB` : `${(file.size / 1024).toFixed(1)} KB`}
                  {totalRows > 0 && ` · ~${totalRows.toLocaleString()} rows estimated`}
                </p>
                {!importing && !previewLoading && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null); setParsedRows([]); setTotalRows(0);
                      setImportPreview(null); setImportBatchId('');
                    }}
                    className="text-xs text-red-500 hover:underline flex items-center gap-1"
                  >
                    <X size={11} /> Remove
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={26} className="text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Drop your CSV here or click to browse</p>
                <p className="text-xs text-muted-foreground">Supports .csv files of any size — additive import only</p>
              </div>
            )}
          </div>
        )}

        {/* CSV preview table */}
        {previewRows.length > 0 && !importing && !importSummary && !importPreview && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={13} className="text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Preview (first {previewRows.length} rows)</span>
            </div>
            <div className="overflow-x-auto scrollbar-thin rounded-lg border border-border">
              <table className="w-full text-xs min-w-[600px]">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {['Address', 'Contact', 'Phone', 'City/State', 'Beds', 'Price'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium text-foreground truncate max-w-[140px]">{row.address || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.contact || '—'}</td>
                      <td className="px-3 py-2">
                        {row.phone ? (
                          <span className="flex items-center gap-1 text-emerald-600"><Phone size={9} />{row.phone}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{[row.city, row.state].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-3 py-2 font-mono">{row.beds || '—'}</td>
                      <td className="px-3 py-2 font-mono">{row.price || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── IMPORT PREVIEW PANEL ─────────────────────────────────────────── */}
        {importPreview && !importSummary && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye size={15} className="text-blue-600 shrink-0" />
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Import Preview</p>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  No changes made yet
                </span>
              </div>
              <button
                onClick={() => setShowPreviewDetails(v => !v)}
                className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
              >
                {showPreviewDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showPreviewDetails ? 'Hide' : 'Show'} row details
              </button>
            </div>

            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'CSV Rows', value: importPreview.csvRows, color: 'text-foreground' },
                { label: 'Unique After CSV Dedup', value: importPreview.uniquePropertiesAfterCsvDedup, color: 'text-foreground' },
                { label: 'NEW PROSPECTS', value: importPreview.newProspects, color: 'text-emerald-700 font-bold' },
                { label: 'EXISTING MATCHES', value: importPreview.existingMatches, color: 'text-blue-700' },
                { label: 'TO ENRICH', value: importPreview.existingToEnrich, color: 'text-blue-600' },
                { label: 'UNCHANGED', value: importPreview.unchangedExisting, color: 'text-muted-foreground' },
                { label: 'DUPES IN CSV', value: importPreview.duplicatesWithinCsv, color: 'text-purple-600' },
                { label: 'REVIEW REQUIRED', value: importPreview.reviewRequired, color: 'text-amber-600' },
                { label: 'NEW STATES', value: importPreview.newStatesDetected, color: 'text-teal-600' },
                { label: 'NEW PORTFOLIOS', value: importPreview.newPortfoliosToCreate, color: 'text-teal-600' },
                { label: 'PHONE LEADS', value: importPreview.verifiedPhoneLeads, color: 'text-emerald-600' },
                { label: 'NEW PHONE NUMBERS', value: importPreview.newPhoneNumbers, color: 'text-emerald-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-[11px] bg-card rounded px-2 py-1.5 border border-border">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-bold tabular-nums ${color}`}>{value}</span>
                </div>
              ))}
            </div>

            {/* New states/portfolios */}
            {importPreview.newStates.length > 0 && (
              <div className="rounded-lg bg-teal-500/10 border border-teal-500/20 p-3">
                <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 mb-1.5 flex items-center gap-1.5">
                  <Building2 size={11} />
                  New Portfolios to Create ({importPreview.newStates.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {importPreview.newStates.map(s => (
                    <span key={s} className="text-[10px] bg-teal-500/10 text-teal-700 border border-teal-500/20 px-1.5 py-0.5 rounded font-mono">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Idempotency note */}
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/50 rounded p-2">
              <Info size={11} className="mt-0.5 shrink-0 text-blue-500" />
              <span>
                <strong>Idempotency guaranteed:</strong> Re-uploading this same CSV will not create additional prospects.
                Existing records will be enriched only when the CSV provides genuinely new information.
              </span>
            </div>

            {/* Row details table */}
            {showPreviewDetails && importPreview.rowResults.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border max-h-48">
                <table className="w-full text-[10px] min-w-[500px]">
                  <thead className="bg-muted/50 border-b border-border sticky top-0">
                    <tr>
                      {['#', 'Address', 'State', 'Outcome', 'Phone', 'Match'].map(h => (
                        <th key={h} className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rowResults.slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                        <td className="px-2 py-1 text-muted-foreground font-mono">{r.rowIndex + 1}</td>
                        <td className="px-2 py-1 truncate max-w-[160px] text-foreground">{r.address}</td>
                        <td className="px-2 py-1 font-mono text-muted-foreground">{r.stateCode}</td>
                        <td className="px-2 py-1"><OutcomeBadge outcome={r.outcome} /></td>
                        <td className="px-2 py-1">
                          {r.hasPhone ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground truncate max-w-[100px]">
                          {r.matchStrategy ? (
                            <span className="text-[9px] bg-blue-500/10 text-blue-600 px-1 py-0.5 rounded">{r.matchStrategy}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    {importPreview.rowResults.length > 100 && (
                      <tr>
                        <td colSpan={6} className="px-2 py-2 text-center text-muted-foreground text-[10px]">
                          … and {importPreview.rowResults.length - 100} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── POST-IMPORT SUMMARY ──────────────────────────────────────────── */}
        {importSummary && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Import Complete</p>
            </div>

            <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Row Outcomes</p>
              {[
                { label: 'NEW', value: importSummary.rowsNew, color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' },
                { label: 'UPDATED_EXISTING', value: importSummary.rowsUpdatedExisting, color: 'text-blue-600 bg-blue-500/10 border-blue-500/20' },
                { label: 'DUPLICATE_IN_FILE', value: importSummary.rowsDuplicateInFile, color: 'text-purple-600 bg-purple-500/10 border-purple-500/20' },
                { label: 'UNCHANGED_EXISTING', value: importSummary.rowsUnchangedExisting, color: 'text-muted-foreground bg-muted border-border' },
                { label: 'REVIEW_REQUIRED', value: importSummary.rowsReviewRequired, color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
                { label: 'ERROR', value: importSummary.rowsError, color: 'text-red-600 bg-red-500/10 border-red-500/20' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-[10px]">
                  <span className={`font-mono font-semibold px-1.5 py-0.5 rounded border ${color}`}>{label}</span>
                  <span className="font-semibold tabular-nums text-foreground">{value ?? 0}</span>
                </div>
              ))}
              <div className="border-t border-border pt-1.5 flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground font-semibold">TOTAL ROWS PROCESSED</span>
                <span className="font-bold text-foreground">{importSummary.rowsProcessed}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                { label: 'Phone Numbers Added', value: importSummary.phoneNumbersImported, icon: Phone },
                { label: 'Rent Prices Found', value: importSummary.rentPricesFound, icon: TrendingUp },
                { label: 'New Portfolios', value: importSummary.newPortfoliosCreated, icon: Building2 },
                { label: 'Existing Portfolios', value: importSummary.existingPortfoliosReused, icon: Building2 },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><Icon size={9} />{label}</span>
                  <span className="font-semibold tabular-nums text-foreground">{value}</span>
                </div>
              ))}
            </div>

            {importSummary.newPortfoliosCreated > 0 && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                ✓ {importSummary.newPortfoliosCreated} new state portfolio{importSummary.newPortfoliosCreated > 1 ? 's' : ''} created automatically
              </p>
            )}
            {(importSummary.postAuditDuplicatesFound ?? 0) > 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-500/10 px-2 py-1 rounded flex items-center gap-1.5">
                <AlertCircle size={10} />
                Post-import audit found {importSummary.postAuditDuplicatesFound} possible duplicate group{(importSummary.postAuditDuplicatesFound ?? 0) > 1 ? 's' : ''} — flagged for review in Duplicate Detection.
              </p>
            )}
          </div>
        )}

        {/* Progress bar */}
        {(importing || previewLoading) && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" />
                {previewLoading ? 'Calculating preview…' : progressLabel}
              </span>
              {importing && <span>{progress}%</span>}
            </div>
            {importing && (
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="h-2 bg-primary rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-red-600">
            <AlertCircle size={13} />
            {error}
          </div>
        )}

        {/* ── ACTION BUTTONS ───────────────────────────────────────────────── */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={handleClose}
            disabled={importing || previewLoading}
            className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importSummary ? 'Close' : 'Cancel'}
          </button>

          {/* Step 1: Calculate Preview */}
          {!importPreview && !importSummary && (
            <button
              onClick={handleCalculatePreview}
              disabled={!file || previewLoading || importing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-w-[180px] justify-center"
            >
              {previewLoading ? (
                <><Loader2 size={13} className="animate-spin" />Calculating…</>
              ) : (
                <><Eye size={13} />Preview Import</>
              )}
            </button>
          )}

          {/* Step 1b: Re-calculate preview */}
          {importPreview && !importSummary && (
            <button
              onClick={handleCalculatePreview}
              disabled={previewLoading || importing}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-all disabled:opacity-50"
            >
              <RefreshCw size={12} />
              Recalculate
            </button>
          )}

          {/* Step 2: Confirm Import */}
          {importPreview && !importSummary && (
            <button
              onClick={handleConfirmImport}
              disabled={importing || previewLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-w-[180px] justify-center"
            >
              {importing ? (
                <><Loader2 size={13} className="animate-spin" />Importing…</>
              ) : (
                <>
                  <ArrowRight size={13} />
                  Confirm Import ({importPreview.newProspects} new + {importPreview.existingToEnrich} enrich)
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}