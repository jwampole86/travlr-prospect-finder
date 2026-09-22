'use client';

import { useRef, useState } from 'react';
import Papa, { type ParseResult, type Parser } from 'papaparse';
import * as tus from 'tus-js-client';
import { Database, FileText, Loader2, ShieldCheck, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import type { MasterFieldMapping } from '@/lib/masterHomeownerData';

interface FileResult {
  name: string;
  rows: number;
  qualified: number;
  matched: number;
  enriched: number;
  leadsCreated: number;
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface ImportTotals {
  rows: number;
  qualified: number;
  matched: number;
  enriched: number;
  leadsCreated: number;
}

const API_BATCH_SIZE = 500;
const PARSE_CHUNK_SIZE = 1024 * 1024;
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;
const STORAGE_PART_SIZE = 40 * 1024 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024;

function uploadObjectResumable(file: Blob, storagePath: string, contentType: string, accessToken: string, onProgress: (uploaded: number, total: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!projectUrl || !anonKey) {
      reject(new Error('Supabase storage is not configured'));
      return;
    }

    const upload = new tus.Upload(file, {
      endpoint: `${projectUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${accessToken}`, apikey: anonKey, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE,
      fingerprint: () => Promise.resolve(`master-homeowner-${storagePath}-${file.size}`),
      metadata: {
        bucketName: 'master-homeowner-data',
        objectName: storagePath,
        contentType,
        cacheControl: '3600',
      },
      onError: reject,
      onProgress,
      onSuccess: () => resolve(),
    });
    upload.findPreviousUploads().then(previous => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(reject);
  });
}

async function archiveFileResumable(file: File, basePath: string, accessToken: string, onProgress: (percentage: number) => void) {
  const contentType = file.type || 'text/plain';
  if (file.size <= STORAGE_PART_SIZE) {
    await uploadObjectResumable(file, basePath, contentType, accessToken, (uploaded, total) => {
      onProgress(total > 0 ? Math.round((uploaded / total) * 100) : 0);
    });
    return basePath;
  }

  const archivePath = `${basePath}.parts`;
  const partCount = Math.ceil(file.size / STORAGE_PART_SIZE);
  const parts: Array<{ path: string; size: number }> = [];
  let completedBytes = 0;

  for (let index = 0; index < partCount; index += 1) {
    const start = index * STORAGE_PART_SIZE;
    const end = Math.min(start + STORAGE_PART_SIZE, file.size);
    const part = file.slice(start, end, contentType);
    const partPath = `${archivePath}/part-${String(index + 1).padStart(5, '0')}`;
    await uploadObjectResumable(part, partPath, contentType, accessToken, uploaded => {
      onProgress(Math.round(((completedBytes + uploaded) / file.size) * 100));
    });
    completedBytes += part.size;
    parts.push({ path: partPath, size: part.size });
  }

  const manifestPath = `${archivePath}/manifest.json`;
  const manifest = new Blob([JSON.stringify({
    version: 1,
    filename: file.name,
    size: file.size,
    contentType,
    partSize: STORAGE_PART_SIZE,
    parts,
  })], { type: 'application/json' });
  await uploadObjectResumable(manifest, manifestPath, 'text/plain', accessToken, () => {});
  onProgress(100);
  return manifestPath;
}

function formatImportError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Import failed';
  if (/413|maximum size exceeded/i.test(message)) {
    return 'A storage part exceeded the Supabase project limit. Retry after refreshing; large files are now split into sub-40 MB parts.';
  }
  if (/network|fetch|timeout/i.test(message)) return 'Upload interrupted by the network. Retry to resume the archived parts.';
  return message.length > 280 ? `${message.slice(0, 277)}...` : message;
}

async function postImport(payload: Record<string, unknown>) {
  const response = await fetch('/api/leads/master-homeowner-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Master homeowner import failed');
  return data;
}

async function streamFileRows(
  file: File,
  storagePath: string,
  minimumScore: number,
  useAnthropic: boolean,
  propertyOnly: boolean,
  createQualifiedLeads: boolean,
  onProgress: (processed: number) => void,
) {
  let fileId = '';
  let mapping: MasterFieldMapping = {};
  let rowOffset = 0;
  const totals: ImportTotals = { rows: 0, qualified: 0, matched: 0, enriched: 0, leadsCreated: 0 };

  await new Promise<void>((resolve, reject) => {
    let failed = false;
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      chunkSize: PARSE_CHUNK_SIZE,
      chunk: (result: ParseResult<Record<string, unknown>>, parser: Parser) => {
        parser.pause();
        void (async () => {
          try {
            if (!fileId) {
              const headers = (result.meta.fields || []).map(header => header.trim()).filter(Boolean);
              const initialized = await postImport({
                action: 'initialize', filename: file.name, storagePath,
                contentType: file.type || 'text/plain', sizeBytes: file.size,
                headers, useAnthropic, propertyOnly,
              });
              fileId = initialized.fileId;
              mapping = initialized.mapping;
            }

            for (let index = 0; index < result.data.length; index += API_BATCH_SIZE) {
              const rows = result.data.slice(index, index + API_BATCH_SIZE).map(row => Object.fromEntries(
                Object.values(mapping).filter((header): header is string => Boolean(header)).map(header => [header, row[header]])
              ));
              if (rows.length === 0) continue;
              const chunk = await postImport({
                action: 'chunk', fileId, rows, rowOffset, mapping,
                minimumScore, propertyOnly, createQualifiedLeads,
              });
              rowOffset += rows.length;
              totals.rows += chunk.processed || 0;
              totals.qualified += chunk.qualified || 0;
              totals.matched += chunk.matched || 0;
              totals.enriched += chunk.enriched || 0;
              totals.leadsCreated += chunk.leadsCreated || 0;
              onProgress(rowOffset);
            }
            parser.resume();
          } catch (error) {
            failed = true;
            parser.abort();
            reject(error);
          }
        })();
      },
      complete: () => {
        if (!failed) resolve();
      },
      error: error => reject(error),
    });
  });

  if (!fileId) throw new Error('No header row or data records found');
  await postImport({
    action: 'complete', fileId, rowCount: totals.rows,
    qualifiedCount: totals.qualified, matchedCount: totals.matched,
    leadsCreated: totals.leadsCreated,
  });
  return totals;
}

export default function MasterHomeownerUploadModal({ open, onClose, onComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [minimumScore, setMinimumScore] = useState(70);
  const [useAnthropic, setUseAnthropic] = useState(true);
  const [propertyOnly, setPropertyOnly] = useState(true);
  const [createQualifiedLeads, setCreateQualifiedLeads] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<FileResult[]>([]);

  const selectFiles = (selected: File[]) => {
    const accepted = selected.filter(file => /\.(csv|txt)$/i.test(file.name) && file.size <= MAX_FILE_SIZE);
    if (accepted.length !== selected.length) toast.error('Only CSV or TXT files up to 10 GB are supported');
    setFiles(accepted.slice(0, 20));
    setResults([]);
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    setProcessing(true);
    setResults([]);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Sign in before uploading homeowner data');
      setProcessing(false);
      return;
    }

    const completed: FileResult[] = [];
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      try {
        const baseStoragePath = `${session.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9._-]+/gi, '-')}`;
        const storagePath = propertyOnly
          ? `sanitized-records-only://${baseStoragePath}`
          : await archiveFileResumable(file, baseStoragePath, session.access_token, percentage => {
              setProgress(`Uploading ${file.name} (${fileIndex + 1}/${files.length}): ${percentage}%`);
            });
        const totals = await streamFileRows(file, storagePath, minimumScore, useAnthropic, propertyOnly, createQualifiedLeads, processed => {
          setProgress(`Matching ${file.name}: ${processed.toLocaleString()} rows processed`);
        });
        completed.push({ name: file.name, ...totals });
      } catch (error) {
        completed.push({
          name: file.name, rows: 0, qualified: 0, matched: 0, enriched: 0, leadsCreated: 0,
          error: formatImportError(error),
        });
      }
      setResults([...completed]);
    }
    setProgress('');
    setProcessing(false);
    if (completed.some(result => !result.error)) {
      toast.success('Master homeowner data processed');
      onComplete();
    }
  };

  return (
    <Modal open={open} onClose={processing ? () => {} : onClose} title="Upload Master Homeowner Data" size="xl">
      <div className="space-y-5">
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-foreground">Property-only mode strips personal, financial, demographic, and behavioral columns before transmission. Existing lead values are never overwritten.</p>
        </div>

        <button type="button" onClick={() => inputRef.current?.click()} className="w-full min-h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-primary/5 transition-colors">
          <Upload className="w-6 h-6 text-primary" />
          <span className="text-sm font-semibold text-foreground">Choose multiple CSV or TXT files</span>
          <span className="text-xs text-muted-foreground text-center px-4">Up to 20 files, 10 GB each. Large files upload resumably and parse in bounded-memory chunks.</span>
        </button>
        <input ref={inputRef} type="file" accept=".csv,.txt,text/csv,text/plain" multiple className="hidden" onChange={event => selectFiles(Array.from(event.target.files || []))} />

        {files.length > 0 && (
          <div className="divide-y divide-border rounded-lg border border-border max-h-48 overflow-y-auto">
            {files.map(file => (
              <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 px-3 py-2.5">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground truncate flex-1">{file.name}</span>
                <span className="text-[10px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                {!processing && <button onClick={() => setFiles(current => current.filter(item => item !== file))} aria-label={`Remove ${file.name}`}><X className="w-4 h-4 text-muted-foreground" /></button>}
              </div>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-foreground">Minimum record quality: {minimumScore}</span>
            <input type="range" min="50" max="100" step="5" value={minimumScore} onChange={event => setMinimumScore(Number(event.target.value))} className="w-full accent-primary" />
            <span className="block text-[10px] text-muted-foreground">Address, state, and at least one owner contact field are always required.</span>
          </label>
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-xs text-foreground"><input type="checkbox" checked={propertyOnly} onChange={event => setPropertyOnly(event.target.checked)} className="mt-0.5" /><span><strong>Property-only privacy mode</strong><br /><span className="text-muted-foreground">Keeps only address, location, county, residence type, home age/value, ownership category, and APN. Raw files are not archived.</span></span></label>
            <label className="flex items-start gap-2 text-xs text-foreground"><input type="checkbox" checked={useAnthropic} onChange={event => setUseAnthropic(event.target.checked)} className="mt-0.5" /><span><strong>Use Anthropic for column mapping</strong><br /><span className="text-muted-foreground">Only column names are sent, never homeowner rows.</span></span></label>
            <label className="flex items-start gap-2 text-xs text-foreground"><input type="checkbox" checked={createQualifiedLeads} onChange={event => setCreateQualifiedLeads(event.target.checked)} className="mt-0.5" /><span><strong>Create qualified unmatched leads</strong><br /><span className="text-muted-foreground">Matched records fill blank owner and phone fields.</span></span></label>
          </div>
        </div>

        {results.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {results.map(result => (
              <div key={result.name} className={`rounded-lg border p-3 ${result.error ? 'border-red-500/30 bg-red-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
                <p className="text-xs font-semibold text-foreground">{result.name}</p>
                {result.error ? <p className="text-xs text-red-600 mt-1">{result.error}</p> : <p className="text-[11px] text-muted-foreground mt-1">{result.rows.toLocaleString()} stored · {result.qualified.toLocaleString()} qualified · {result.matched.toLocaleString()} matched · {result.enriched.toLocaleString()} enriched · {result.leadsCreated.toLocaleString()} new leads</p>}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={processing} className="px-4 py-2 rounded-md border border-border text-sm font-medium disabled:opacity-50">Close</button>
          <button type="button" onClick={processFiles} disabled={processing || files.length === 0} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {processing ? progress || 'Processing' : `Store & Match ${files.length || ''} File${files.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
