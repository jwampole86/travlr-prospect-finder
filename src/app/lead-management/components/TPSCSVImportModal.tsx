'use client';

import React, { useState, useRef, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import { Upload, FileText, AlertCircle, CheckCircle, X, Phone, Eye, ArrowRight, Loader2, RefreshCw, ChevronDown, ChevronUp, Shield, Database, Activity,  } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { TpsImportSummary, TpsRowResult } from '@/app/api/leads/tps-csv-import/route';

// ─── CSV parsing ──────────────────────────────────────────────────────────────
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

function parseTPSCsv(text: string): Record<string, string>[] {
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

  // Strip BOM from first header
  const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    const row: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      row[h] = (vals[idx] || '').trim().replace(/^"|"$/g, '');
    });
    rows.push(row);
  }
  return rows;
}

// ─── Detect CSV format ────────────────────────────────────────────────────────
type CsvFormat = 'TPS' | 'SIMPLE' | 'STANDARD' | 'UNKNOWN';

function detectCsvFormat(headers: string[]): CsvFormat {
  const normalized = headers.map(h => h.toLowerCase().replace(/^\uFEFF/, '').trim());
  if (normalized.some(h => h.includes('truepeoplesearch') || h.includes('phones_found'))) return 'TPS';
  if (normalized.includes('phone') && normalized.includes('address') && normalized.includes('contact') && normalized.length <= 4) return 'SIMPLE';
  if (normalized.includes('address') || normalized.includes('contact')) return 'STANDARD';
  return 'UNKNOWN';
}

// ─── Outcome badge ────────────────────────────────────────────────────────────
function OutcomeBadge({ outcome }: { outcome: TpsRowResult['outcome'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    NEW: { label: 'NEW', cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
    UPDATED_EXISTING: { label: 'UPDATED', cls: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
    UNCHANGED_EXISTING: { label: 'UNCHANGED', cls: 'bg-muted text-muted-foreground border-border' },
    DUPLICATE_IN_CSV: { label: 'DUPE', cls: 'bg-purple-500/10 text-purple-700 border-purple-500/20' },
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

// ─── Props ────────────────────────────────────────────────────────────────────
interface TPSCSVImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: (newLeadsCount: number) => void;
}

interface PreviewData {
  csvRows: number;
  validRows: number;
  uniqueAfterCsvDedup: number;
  duplicateInCsv: number;
  newProspects: number;
  existingToUpdate: number;
  unchangedExisting: number;
  reviewRequired: number;
  errors: number;
  willNewlyPhoneAvailable: number;
  willNewlyFullyVerified: number;
  willIncreaseTotalLeads: number;
}

export default function TPSCSVImportModal({ open, onClose, onImportComplete }: TPSCSVImportModalProps) {
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [csvFormat, setCsvFormat] = useState<CsvFormat>('UNKNOWN');
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState('');

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [showPreviewDetails, setShowPreviewDetails] = useState(false);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [importSummary, setImportSummary] = useState<TpsImportSummary | null>(null);
  const [importBatchId, setImportBatchId] = useState('');
  const [showReviewRows, setShowReviewRows] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv')) { setError('Please upload a .csv file'); return; }
    setError('');
    setFile(f);
    setPreview(null);
    setImportSummary(null);
    setImportBatchId('');

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseTPSCsv(text);
      if (rows.length === 0) { setError('CSV appears empty or malformed.'); return; }
      setParsedRows(rows);
      // Detect format from headers
      const headers = Object.keys(rows[0] || {});
      setCsvFormat(detectCsvFormat(headers));
    };
    reader.readAsText(f.slice(0, 131072)); // Read first 128KB for detection
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

  // ── STEP 1: Preview ───────────────────────────────────────────────────────
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

      const rows = parseTPSCsv(text);
      if (rows.length === 0) { setError('CSV appears empty or malformed.'); setPreviewLoading(false); return; }
      setParsedRows(rows);

      const batchId = `tps-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setImportBatchId(batchId);

      const res = await fetch('/api/leads/tps-csv-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          importFilename: file.name,
          importedBy: user?.id,
          importBatchId: batchId,
          previewOnly: true,
        }),
      });

      if (!res.ok) throw new Error('Preview calculation failed');
      const data = await res.json();
      if (data.preview) setPreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── STEP 2: Commit import ─────────────────────────────────────────────────
  async function handleConfirmImport() {
    if (!file || !preview) return;
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

      const rows = parseTPSCsv(text);
      setProgress(15);
      setProgressLabel(`Committing ${rows.length} rows to canonical database…`);

      // Send in chunks of 100 rows
      const CHUNK_SIZE = 100;
      const chunks: typeof rows[] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) chunks.push(rows.slice(i, i + CHUNK_SIZE));

      let aggregated: TpsImportSummary | null = null;
      let chunksDone = 0;

      for (const chunk of chunks) {
        const res = await fetch('/api/leads/tps-csv-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: chunk,
            importFilename: file.name,
            importedBy: user?.id,
            importBatchId: importBatchId,
            previewOnly: false,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.summary) {
            const s: TpsImportSummary = data.summary;
            if (!aggregated) {
              aggregated = { ...s };
            } else {
              aggregated.newLeads += s.newLeads;
              aggregated.updatedExisting += s.updatedExisting;
              aggregated.unchangedExisting += s.unchangedExisting;
              aggregated.duplicateInCsv += s.duplicateInCsv;
              aggregated.reviewRequired += s.reviewRequired;
              aggregated.errors += s.errors;
              aggregated.phonesStored += s.phonesStored;
              aggregated.newlyPhoneAvailable += s.newlyPhoneAvailable;
              aggregated.newlyFullyVerified += s.newlyFullyVerified;
              aggregated.rowResults.push(...s.rowResults);
              aggregated.reviewRows.push(...s.reviewRows);
            }
          }
        }

        chunksDone++;
        setProgress(15 + Math.round((chunksDone / chunks.length) * 75));
        setProgressLabel(`Processing batch ${chunksDone}/${chunks.length}…`);
      }

      setProgress(100);
      setProgressLabel('Complete!');

      if (aggregated) {
        setImportSummary(aggregated);
        onImportComplete(aggregated.newLeads + aggregated.updatedExisting);
        toast.success(
          `Import complete: ${aggregated.newLeads} new + ${aggregated.updatedExisting} updated. Dashboard refreshing…`,
          { duration: 8000 }
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    if (importing || previewLoading) return;
    setFile(null); setParsedRows([]); setError(''); setCsvFormat('UNKNOWN');
    setProgress(0); setPreview(null); setImportSummary(null);
    setImportBatchId(''); setShowPreviewDetails(false); setShowReviewRows(false);
    onClose();
  }

  const previewSample = parsedRows.slice(0, 3);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal open={open} onClose={handleClose} title="Import TruePeopleSearch / Phone Leads" size="lg">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">

        {/* Format guide */}
        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-400 space-y-1.5">
          <p className="font-semibold flex items-center gap-1.5">
            <Shield size={12} />
            Canonical Import — TruePeopleSearch / Phone Research CSV
          </p>
          <p className="text-muted-foreground">
            Supports two formats:
          </p>
          <div className="space-y-1">
            <p className="font-mono text-[10px] bg-blue-500/10 px-2 py-1 rounded">
              Format A: State, Contact, Address, TruePeopleSearch_Name, TruePeopleSearch_Address, Phones_Found
            </p>
            <p className="font-mono text-[10px] bg-blue-500/10 px-2 py-1 rounded">
              Format B: Address, Contact, Phone
            </p>
          </div>
          <p className="text-muted-foreground">
            <strong>Canonical pipeline:</strong> Normalize → Deduplicate → Match existing → Upsert → Store phones → Derive verified flags → Refresh Dashboard.
            No SMS consent fabricated. No pipeline stage advanced. No scores hardcoded.
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
              dragOver ? 'border-primary bg-primary/5' : file ?'border-emerald-500 bg-emerald-500/5' :'border-border hover:border-primary/50 hover:bg-muted/30'
            } ${(importing || previewLoading) ? 'cursor-not-allowed opacity-70' : ''}`}
            role="button"
            aria-label="Upload TruePeopleSearch CSV file"
          >
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle size={26} className="text-emerald-600" />
                <p className="text-sm font-semibold text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {parsedRows.length > 0 && `${parsedRows.length} rows detected`}
                  {csvFormat !== 'UNKNOWN' && (
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      csvFormat === 'TPS' ? 'bg-blue-500/10 text-blue-700' : 'bg-emerald-500/10 text-emerald-700'
                    }`}>
                      {csvFormat === 'TPS' ? 'TPS FORMAT' : csvFormat === 'SIMPLE' ? 'SIMPLE FORMAT' : 'STANDARD FORMAT'}
                    </span>
                  )}
                </p>
                {!importing && !previewLoading && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null); setParsedRows([]); setPreview(null);
                      setImportBatchId(''); setCsvFormat('UNKNOWN');
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
                <p className="text-xs text-muted-foreground">TruePeopleSearch format or simple Address/Contact/Phone</p>
              </div>
            )}
          </div>
        )}

        {/* CSV sample preview */}
        {previewSample.length > 0 && !importing && !importSummary && !preview && (
          <div>
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <FileText size={12} className="text-muted-foreground" />
              Sample rows (first {previewSample.length})
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs min-w-[500px]">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {Object.keys(previewSample[0] || {}).slice(0, 5).map(h => (
                      <th key={h} className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate max-w-[120px]">
                        {h.replace(/^\uFEFF/, '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewSample.map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {Object.values(row).slice(0, 5).map((val, j) => (
                        <td key={j} className="px-2 py-1.5 text-muted-foreground truncate max-w-[120px]" title={String(val)}>
                          {String(val) || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-red-700">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* Calculate preview button */}
        {file && !preview && !importing && !importSummary && (
          <button
            onClick={handleCalculatePreview}
            disabled={previewLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {previewLoading ? (
              <><Loader2 size={14} className="animate-spin" /> Analyzing {parsedRows.length} rows…</>
            ) : (
              <><Eye size={14} /> Calculate Import Preview</>
            )}
          </button>
        )}

        {/* ── PREVIEW PANEL ─────────────────────────────────────────────────── */}
        {preview && !importSummary && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-blue-600" />
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Import Preview</p>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">No changes made yet</span>
              </div>
              <button onClick={() => setShowPreviewDetails(v => !v)} className="text-xs text-muted-foreground flex items-center gap-1">
                {showPreviewDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showPreviewDetails ? 'Less' : 'More'}
              </button>
            </div>

            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'CSV Rows', value: preview.csvRows, cls: '' },
                { label: 'Valid Rows', value: preview.validRows, cls: '' },
                { label: 'New Prospects', value: preview.newProspects, cls: 'text-emerald-700 font-bold' },
                { label: 'Update Existing', value: preview.existingToUpdate, cls: 'text-blue-700 font-bold' },
                { label: 'Unchanged', value: preview.unchangedExisting, cls: 'text-muted-foreground' },
                { label: 'Duplicate in CSV', value: preview.duplicateInCsv, cls: 'text-purple-700' },
                { label: 'Review Required', value: preview.reviewRequired, cls: 'text-amber-700' },
                { label: 'Errors', value: preview.errors, cls: preview.errors > 0 ? 'text-red-700' : 'text-muted-foreground' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="flex justify-between items-center p-2 rounded bg-background/60 border border-border">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-mono font-semibold ${cls}`}>{value}</span>
                </div>
              ))}
            </div>

            {showPreviewDetails && (
              <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-blue-500/20">
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-emerald-700 font-bold text-base">{preview.willIncreaseTotalLeads}</p>
                  <p className="text-emerald-700 text-[10px]">Total Leads +</p>
                </div>
                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-center">
                  <p className="text-blue-700 font-bold text-base">{preview.willNewlyPhoneAvailable}</p>
                  <p className="text-blue-700 text-[10px]">Phone Available +</p>
                </div>
                <div className="p-2 rounded bg-purple-500/10 border border-purple-500/20 text-center">
                  <p className="text-purple-700 font-bold text-base">{preview.willNewlyFullyVerified}</p>
                  <p className="text-purple-700 text-[10px]">Fully Verified +</p>
                </div>
              </div>
            )}

            {/* Guarantees */}
            <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t border-blue-500/20">
              <p className="flex items-center gap-1"><CheckCircle size={9} className="text-emerald-600" /> New leads start as <strong>New Lead</strong> — no pipeline advancement</p>
              <p className="flex items-center gap-1"><CheckCircle size={9} className="text-emerald-600" /> No SMS consent fabricated — phone research ≠ consent</p>
              <p className="flex items-center gap-1"><CheckCircle size={9} className="text-emerald-600" /> Existing CRM stages and history preserved</p>
              <p className="flex items-center gap-1"><CheckCircle size={9} className="text-emerald-600" /> TruePeopleSearch URLs stored as provenance</p>
              <p className="flex items-center gap-1"><CheckCircle size={9} className="text-emerald-600" /> All phone numbers parsed and stored individually</p>
            </div>

            {/* Confirm button */}
            <button
              onClick={handleConfirmImport}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Database size={14} />
              Commit {preview.newProspects + preview.existingToUpdate} Records to Canonical DB
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* ── PROGRESS ──────────────────────────────────────────────────────── */}
        {importing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" />
                {progressLabel}
              </span>
              <span className="font-mono text-foreground">{progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* ── IMPORT SUMMARY ────────────────────────────────────────────────── */}
        {importSummary && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-700">Import Complete</p>
                <p className="text-xs text-muted-foreground">
                  Batch ID: <span className="font-mono">{importSummary.importBatchId}</span>
                </p>
              </div>
            </div>

            {/* Final summary */}
            <div className="rounded-lg border border-border overflow-hidden text-xs">
              <div className="bg-muted/50 px-3 py-2 font-semibold text-foreground flex items-center gap-1.5">
                <Activity size={12} />
                IMPORT FILE: {importSummary.importFile}
              </div>
              <div className="divide-y divide-border">
                {[
                  { label: 'SOURCE ROWS', value: importSummary.sourceRows },
                  { label: 'VALID', value: importSummary.valid },
                  { label: 'NEW', value: importSummary.newLeads, cls: 'text-emerald-700 font-bold' },
                  { label: 'UPDATED_EXISTING', value: importSummary.updatedExisting, cls: 'text-blue-700 font-bold' },
                  { label: 'UNCHANGED_EXISTING', value: importSummary.unchangedExisting },
                  { label: 'DUPLICATE_IN_CSV', value: importSummary.duplicateInCsv, cls: 'text-purple-700' },
                  { label: 'REVIEW_REQUIRED', value: importSummary.reviewRequired, cls: 'text-amber-700' },
                  { label: 'ERRORS', value: importSummary.errors, cls: importSummary.errors > 0 ? 'text-red-700' : '' },
                  { label: 'PHONES STORED', value: importSummary.phonesStored, cls: 'text-blue-700' },
                  { label: 'NEWLY PHONE AVAILABLE', value: importSummary.newlyPhoneAvailable, cls: 'text-emerald-700' },
                  { label: 'NEWLY FULLY VERIFIED', value: importSummary.newlyFullyVerified, cls: 'text-purple-700' },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="flex justify-between items-center px-3 py-1.5">
                    <span className="font-mono text-muted-foreground">{label}:</span>
                    <span className={`font-mono font-semibold ${cls || 'text-foreground'}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Review rows */}
            {importSummary.reviewRows.length > 0 && (
              <div>
                <button
                  onClick={() => setShowReviewRows(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 font-medium"
                >
                  <span className="flex items-center gap-1.5">
                    <AlertCircle size={12} />
                    {importSummary.reviewRows.length} rows require review
                  </span>
                  {showReviewRows ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showReviewRows && (
                  <div className="mt-2 overflow-x-auto rounded-lg border border-amber-500/20">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead className="bg-amber-500/5 border-b border-amber-500/20">
                        <tr>
                          {['Contact', 'Address', 'State', 'Phone', 'Outcome', 'Reason'].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-amber-700">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importSummary.reviewRows.map((row, i) => (
                          <tr key={i} className="border-b border-amber-500/10 last:border-0">
                            <td className="px-2 py-1.5 text-foreground truncate max-w-[100px]">{row.contact || '—'}</td>
                            <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[140px]">{row.address || '—'}</td>
                            <td className="px-2 py-1.5 font-mono">{row.state || '—'}</td>
                            <td className="px-2 py-1.5">
                              {row.phones.length > 0 ? (
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <Phone size={9} />{row.phones[0]}
                                  {row.phones.length > 1 && <span className="text-muted-foreground">+{row.phones.length - 1}</span>}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-2 py-1.5"><OutcomeBadge outcome={row.outcome} /></td>
                            <td className="px-2 py-1.5 text-amber-700 font-mono text-[10px]">{row.reviewReason || row.errorCode || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Done — View in Lead Management
              </button>
              <button
                onClick={() => {
                  setFile(null); setParsedRows([]); setPreview(null);
                  setImportSummary(null); setImportBatchId('');
                  setCsvFormat('UNKNOWN'); setShowReviewRows(false);
                }}
                className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={13} /> Import Another
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
