'use client';

import React, { useState, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Upload, FileText, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Edit3, Copy, RotateCcw, Play, X, Info, Zap } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type IssueType = 'duplicate_address' | 'invalid_format' | 'missing_required' | 'invalid_source' | 'invalid_stage';
type IssueSeverity = 'error' | 'warning';
type RowStatus = 'valid' | 'error' | 'warning' | 'fixed' | 'skipped';

interface RowIssue {
  type: IssueType;
  severity: IssueSeverity;
  field: string;
  message: string;
  suggestion?: string;
}

interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  address: string;
  source: string;
  stage: string;
  beds: string;
  baths: string;
  price: string;
  notes: string;
  issues: RowIssue[];
  status: RowStatus;
  edited: boolean;
}

interface PreflightSummary {
  total: number;
  valid: number;
  errors: number;
  warnings: number;
  duplicates: number;
  missingRequired: number;
  invalidFormat: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['address'];
const VALID_SOURCES = ['Zillow', 'Craigslist', 'Facebook Marketplace', 'Realtor.com', 'Direct', 'Referral', 'LoopNet', 'HotPads', 'Apartments.com', 'Trulia', 'Redfin', 'MLS', 'Airbnb', 'VRBO', 'Other'];
const VALID_STAGES = ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiating', 'Closed', 'Lost'];
const ADDRESS_REGEX = /\d+\s+[\w\s]+(?:st|ave|blvd|dr|rd|ln|ct|pl|way|circle|cir|terrace|ter|pkwy|hwy|route|rt)\.?/i;

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result.map(v => v.trim().replace(/^"|"$/g, ''));
}

function parseCSV(text: string): ParsedRow[] {
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

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = (vals[idx] || '').trim(); });

    rows.push({
      rowIndex: i,
      raw,
      address: raw['address'] || '',
      source: raw['source'] || 'Direct',
      stage: raw['stage'] || 'New Lead',
      beds: raw['beds'] || '3',
      baths: raw['baths'] || '2',
      price: raw['price'] || '2500',
      notes: raw['notes'] || '',
      issues: [],
      status: 'valid',
      edited: false,
    });
  }
  return rows;
}

function validateRows(rows: ParsedRow[]): ParsedRow[] {
  const addressSet = new Map<string, number[]>();

  // First pass: collect addresses for duplicate detection
  rows.forEach((row, idx) => {
    const normalized = row.address.toLowerCase().trim();
    if (normalized) {
      if (!addressSet.has(normalized)) addressSet.set(normalized, []);
      addressSet.get(normalized)!.push(idx);
    }
  });

  return rows.map((row, idx) => {
    const issues: RowIssue[] = [];

    // Missing required fields
    if (!row.address.trim()) {
      issues.push({ type: 'missing_required', severity: 'error', field: 'address', message: 'Address is required', suggestion: 'Add a valid street address' });
    }

    // Invalid address format
    if (row.address.trim() && !ADDRESS_REGEX.test(row.address)) {
      issues.push({ type: 'invalid_format', severity: 'warning', field: 'address', message: 'Address format may be invalid', suggestion: 'Use format: 123 Main St, City, ST 12345' });
    }

    // Duplicate address
    const normalized = row.address.toLowerCase().trim();
    if (normalized && addressSet.has(normalized) && addressSet.get(normalized)!.length > 1) {
      const otherRows = addressSet.get(normalized)!.filter(i => i !== idx);
      issues.push({ type: 'duplicate_address', severity: 'error', field: 'address', message: `Duplicate address — also on row ${otherRows.map(r => r + 1).join(', ')}`, suggestion: 'Remove duplicate or merge records' });
    }

    // Invalid source
    if (row.source && !VALID_SOURCES.includes(row.source)) {
      issues.push({ type: 'invalid_source', severity: 'warning', field: 'source', message: `Unknown source "${row.source}"`, suggestion: `Use one of: ${VALID_SOURCES.slice(0, 5).join(', ')}, …` });
    }

    // Invalid stage
    if (row.stage && !VALID_STAGES.includes(row.stage)) {
      issues.push({ type: 'invalid_stage', severity: 'warning', field: 'stage', message: `Unknown stage "${row.stage}"`, suggestion: `Use one of: ${VALID_STAGES.join(', ')}` });
    }

    // Invalid price
    if (row.price && isNaN(Number(row.price.replace(/[$,]/g, '')))) {
      issues.push({ type: 'invalid_format', severity: 'warning', field: 'price', message: 'Price must be a number', suggestion: 'Enter a numeric value like 2500' });
    }

    const hasErrors = issues.some(i => i.severity === 'error');
    const hasWarnings = issues.some(i => i.severity === 'warning');

    return {
      ...row,
      issues,
      status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'valid',
    };
  });
}

// ─── Issue Badge ──────────────────────────────────────────────────────────────

function IssueBadge({ issue }: { issue: RowIssue }) {
  const colors = {
    duplicate_address: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    invalid_format: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    missing_required: 'bg-red-500/10 text-red-600 border-red-500/20',
    invalid_source: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    invalid_stage: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  };
  const labels = {
    duplicate_address: 'Duplicate',
    invalid_format: 'Bad Format',
    missing_required: 'Missing Field',
    invalid_source: 'Unknown Source',
    invalid_stage: 'Unknown Stage',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${colors[issue.type]}`}>
      {issue.severity === 'error' ? <XCircle size={9} /> : <AlertTriangle size={9} />}
      {labels[issue.type]}
    </span>
  );
}

// ─── Row Editor ───────────────────────────────────────────────────────────────

function RowEditor({ row, onSave, onSkip, onClose }: {
  row: ParsedRow;
  onSave: (updated: Partial<ParsedRow>) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [address, setAddress] = useState(row.address);
  const [source, setSource] = useState(row.source);
  const [stage, setStage] = useState(row.stage);
  const [price, setPrice] = useState(row.price);

  return (
    <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Edit Row {row.rowIndex}</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-[11px] text-muted-foreground mb-1 block">Address *</label>
          <input value={address} onChange={e => setAddress(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">Source</label>
          <select value={source} onChange={e => setSource(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary">
            {VALID_SOURCES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">Stage</label>
          <select value={stage} onChange={e => setStage(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary">
            {VALID_STAGES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">Price</label>
          <input value={price} onChange={e => setPrice(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary" />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => onSave({ address, source, stage, price, status: 'fixed', edited: true })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
          <CheckCircle2 size={12} /> Save Fix
        </button>
        <button onClick={onSkip}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:text-foreground transition-colors">
          Skip Row
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CsvPreflightPage() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [phase, setPhase] = useState<'upload' | 'review' | 'done'>('upload');
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<RowStatus | 'all'>('all');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      const validated = validateRows(parsed);
      setRows(validated);
      setPhase('review');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleSaveEdit = (rowIndex: number, updates: Partial<ParsedRow>) => {
    setRows(prev => {
      const updated = prev.map(r => r.rowIndex === rowIndex ? { ...r, ...updates } : r);
      return validateRows(updated.map(r => r.rowIndex === rowIndex ? { ...r, ...updates } : r));
    });
    setEditingRow(null);
  };

  const handleSkipRow = (rowIndex: number) => {
    setRows(prev => prev.map(r => r.rowIndex === rowIndex ? { ...r, status: 'skipped' } : r));
    setEditingRow(null);
  };

  const handleAutoFix = () => {
    setRows(prev => prev.map(row => {
      if (row.status === 'warning') {
        const fixed = { ...row };
        if (!VALID_SOURCES.includes(fixed.source)) fixed.source = 'Other';
        if (!VALID_STAGES.includes(fixed.stage)) fixed.stage = 'New Lead';
        if (isNaN(Number(fixed.price.replace(/[$,]/g, '')))) fixed.price = '2500';
        return { ...fixed, status: 'fixed', edited: true, issues: [] };
      }
      return row;
    }));
  };

  const handleImport = async () => {
    setImporting(true);
    await new Promise(r => setTimeout(r, 1500));
    const toImport = rows.filter(r => r.status === 'valid' || r.status === 'fixed' || r.status === 'warning');
    const skipped = rows.filter(r => r.status === 'error' || r.status === 'skipped');
    setImportResult({ imported: toImport.length, skipped: skipped.length });
    setImporting(false);
    setPhase('done');
  };

  const handleReset = () => {
    setRows([]);
    setFileName('');
    setPhase('upload');
    setEditingRow(null);
    setImportResult(null);
    setFilterStatus('all');
  };

  const summary: PreflightSummary = {
    total: rows.length,
    valid: rows.filter(r => r.status === 'valid').length,
    errors: rows.filter(r => r.status === 'error').length,
    warnings: rows.filter(r => r.status === 'warning').length,
    duplicates: rows.filter(r => r.issues.some(i => i.type === 'duplicate_address')).length,
    missingRequired: rows.filter(r => r.issues.some(i => i.type === 'missing_required')).length,
    invalidFormat: rows.filter(r => r.issues.some(i => i.type === 'invalid_format')).length,
  };

  const filteredRows = filterStatus === 'all' ? rows : rows.filter(r => r.status === filterStatus);
  const canImport = rows.some(r => r.status === 'valid' || r.status === 'fixed' || r.status === 'warning');

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">CSV Pre-Flight Check</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Validate CSV uploads before import — flags duplicates, invalid formats, and missing fields with a correction workflow.
          </p>
        </div>

        {/* Upload Phase */}
        {phase === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Upload size={28} className="text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">Drop your CSV file here</p>
                <p className="text-sm text-muted-foreground mt-1">or click to browse — supports address, source, stage, beds, baths, price, notes</p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-500" /> Duplicate detection</span>
                <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-500" /> Format validation</span>
                <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-500" /> Required field check</span>
              </div>
            </div>
          </div>
        )}

        {/* Review Phase */}
        {phase === 'review' && (
          <>
            {/* File info bar */}
            <div className="flex items-center justify-between bg-muted/40 border border-border rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{fileName}</p>
                  <p className="text-[11px] text-muted-foreground">{rows.length} rows parsed</p>
                </div>
              </div>
              <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <RotateCcw size={13} /> Upload new file
              </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Valid', value: summary.valid, color: 'text-emerald-500', bg: 'border-emerald-500/20', icon: <CheckCircle2 size={15} className="text-emerald-500" /> },
                { label: 'Errors', value: summary.errors, color: 'text-red-500', bg: 'border-red-500/20', icon: <XCircle size={15} className="text-red-500" /> },
                { label: 'Warnings', value: summary.warnings, color: 'text-amber-500', bg: 'border-amber-500/20', icon: <AlertTriangle size={15} className="text-amber-500" /> },
                { label: 'Duplicates', value: summary.duplicates, color: 'text-orange-500', bg: 'border-orange-500/20', icon: <Copy size={15} className="text-orange-500" /> },
              ].map(({ label, value, color, bg, icon }) => (
                <div key={label} className={`bg-card border ${bg} rounded-xl p-4`}>
                  <div className="flex items-center gap-2 mb-1">{icon}<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span></div>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {(['all', 'valid', 'error', 'warning', 'fixed', 'skipped'] as const).map(f => (
                  <button key={f} onClick={() => setFilterStatus(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                      filterStatus === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}>
                    {f === 'all' ? `All (${rows.length})` : `${f} (${rows.filter(r => r.status === f).length})`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {summary.warnings > 0 && (
                  <button onClick={handleAutoFix}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20 text-xs font-medium hover:bg-amber-500/20 transition-colors">
                    <Zap size={13} /> Auto-fix Warnings
                  </button>
                )}
                <button onClick={handleImport} disabled={!canImport || importing}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {importing ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
                  {importing ? 'Importing…' : `Import ${rows.filter(r => ['valid', 'fixed', 'warning'].includes(r.status)).length} rows`}
                </button>
              </div>
            </div>

            {/* Row table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-10">#</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Address</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Stage</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Issues</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(row => (
                      <React.Fragment key={row.rowIndex}>
                        <tr className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${
                          row.status === 'error' ? 'bg-red-500/3' :
                          row.status === 'warning' ? 'bg-amber-500/3' :
                          row.status === 'fixed' ? 'bg-emerald-500/3' :
                          row.status === 'skipped' ? 'opacity-40' : ''
                        }`}>
                          <td className="px-4 py-2.5 text-[11px] text-muted-foreground">{row.rowIndex}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs text-foreground font-medium">{row.address || <span className="text-red-400 italic">missing</span>}</span>
                            {row.edited && <span className="ml-1.5 text-[9px] text-emerald-500 font-medium">edited</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.source}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.stage}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {row.issues.map((issue, i) => <IssueBadge key={i} issue={issue} />)}
                              {row.issues.length === 0 && <span className="text-[10px] text-emerald-500">—</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              row.status === 'valid' ? 'bg-emerald-500/10 text-emerald-600' :
                              row.status === 'error' ? 'bg-red-500/10 text-red-600' :
                              row.status === 'warning' ? 'bg-amber-500/10 text-amber-600' :
                              row.status === 'fixed'? 'bg-blue-500/10 text-blue-600' : 'bg-muted text-muted-foreground'
                            }`}>{row.status}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              {row.status !== 'skipped' && (
                                <button onClick={() => setEditingRow(editingRow === row.rowIndex ? null : row.rowIndex)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                  <Edit3 size={13} />
                                </button>
                              )}
                              {row.status !== 'skipped' && (
                                <button onClick={() => handleSkipRow(row.rowIndex)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors">
                                  <X size={13} />
                                </button>
                              )}
                              {row.status === 'skipped' && (
                                <button onClick={() => setRows(prev => prev.map(r => r.rowIndex === row.rowIndex ? { ...r, status: r.issues.some(i => i.severity === 'error') ? 'error' : r.issues.length > 0 ? 'warning' : 'valid' } : r))}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                  <RotateCcw size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {editingRow === row.rowIndex && (
                          <tr>
                            <td colSpan={7} className="px-4 py-3 bg-muted/20">
                              <RowEditor
                                row={row}
                                onSave={updates => handleSaveEdit(row.rowIndex, updates)}
                                onSkip={() => handleSkipRow(row.rowIndex)}
                                onClose={() => setEditingRow(null)}
                              />
                            </td>
                          </tr>
                        )}
                        {/* Issue suggestions */}
                        {row.issues.length > 0 && editingRow !== row.rowIndex && (
                          <tr>
                            <td colSpan={7} className="px-4 pb-2">
                              <div className="space-y-1">
                                {row.issues.map((issue, i) => (
                                  <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                                    <Info size={11} className="mt-0.5 flex-shrink-0 text-blue-400" />
                                    <span><span className="font-medium text-foreground">{issue.field}:</span> {issue.message}
                                      {issue.suggestion && <span className="text-muted-foreground"> — {issue.suggestion}</span>}
                                    </span>
                                  </div>
                                ))}
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
          </>
        )}

        {/* Done Phase */}
        {phase === 'done' && importResult && (
          <div className="text-center py-16 space-y-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} className="text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Import Complete</h2>
              <p className="text-muted-foreground mt-1">Your CSV has been processed successfully.</p>
            </div>
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-500">{importResult.imported}</p>
                <p className="text-sm text-muted-foreground">Leads imported</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-muted-foreground">{importResult.skipped}</p>
                <p className="text-sm text-muted-foreground">Rows skipped</p>
              </div>
            </div>
            <button onClick={handleReset}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
              <Upload size={16} /> Upload Another File
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
