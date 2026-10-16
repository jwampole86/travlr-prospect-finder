'use client';

import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { AlertCircle, CheckCircle2, Database, Eye, FileUp, Loader2 } from 'lucide-react';

const FEEDS = {
  for_sale_by_agent: { label: 'For sale by agent', shards: 34 },
  for_sale_by_owner: { label: 'For sale by owner', shards: 1 },
} as const;

type FeedFamily = keyof typeof FEEDS;

type ImportResult = {
  family: FeedFamily;
  shard: number;
  sourceUrl: string;
  urlsSeen: number;
  uniqueZpids: number;
  duplicatesInShard: number;
  upserted?: number;
  dryRun: boolean;
};

type TruliaImportResult = {
  received: number;
  uniqueListings: number;
  duplicatesInPayload: number;
  skippedMissingIdentity: number;
  reportedTotal: number | null;
  sourceSearchUrl: string | null;
  upserted: number | null;
  dryRun: boolean;
};

function parseTruliaExport(text: string): unknown {
  const source = text
    .replace(/^\s*PDF PARSED TEXT:\s*/i, '')
    .replace(/<PARSED TEXT FOR PAGE:\s*\d+\s*\/\s*\d+\s*>/gi, ' ');
  let normalized = '';
  let insideString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (insideString) {
      if (escaped) {
        normalized += character;
        escaped = false;
      } else if (character === '\\') {
        normalized += character;
        escaped = true;
      } else if (character === '"') {
        normalized += character;
        insideString = false;
      } else if (character === '\n' || character === '\r' || character === '\t') {
        normalized += ' ';
      } else {
        normalized += character;
      }
    } else {
      normalized += character;
      if (character === '"') insideString = true;
    }
  }

  return JSON.parse(normalized);
}

export default function ZillowSitemapImportPage() {
  const [activeSource, setActiveSource] = useState<'zillow' | 'trulia'>('zillow');
  const [family, setFamily] = useState<FeedFamily>('for_sale_by_owner');
  const [shard, setShard] = useState('0');
  const [truliaJson, setTruliaJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [truliaResult, setTruliaResult] = useState<TruliaImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport(dryRun: boolean) {
    const shardNumber = Number(shard);
    if (!Number.isInteger(shardNumber) || shardNumber < 0 || shardNumber >= FEEDS[family].shards) {
      setError(`Choose a shard from 0 to ${FEEDS[family].shards - 1}.`);
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/zillow/sitemap/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ family, shard: shardNumber, dryRun }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Import failed.');
      setResult(payload as ImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runTruliaImport(dryRun: boolean) {
    let payload: unknown;
    try {
      payload = parseTruliaExport(truliaJson);
    } catch {
      setError('Paste a valid JSON response or choose a JSON file.');
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    setTruliaResult(null);
    try {
      const response = await fetch('/api/trulia/rentals/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, dryRun }),
      });
      const responseBody = await response.json();
      if (!response.ok) throw new Error(responseBody.error || 'Import failed.');
      setTruliaResult(responseBody as TruliaImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <header className="mb-6 border-b border-border pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Data acquisition
          </p>
          <h1 className="mt-1 text-xl font-bold text-foreground">Property Feed Import</h1>
        </header>

        <div
          role="tablist"
          aria-label="Property source"
          className="mb-5 flex border-b border-border"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSource === 'zillow'}
            onClick={() => {
              setActiveSource('zillow');
              setError(null);
            }}
            className={`border-b-2 px-4 py-2 text-sm font-semibold ${activeSource === 'zillow' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Zillow sitemap
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSource === 'trulia'}
            onClick={() => {
              setActiveSource('trulia');
              setError(null);
            }}
            className={`border-b-2 px-4 py-2 text-sm font-semibold ${activeSource === 'trulia' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Trulia rentals
          </button>
        </div>

        {activeSource === 'zillow' ? (
          <section className="max-w-xl space-y-5">
            <div>
              <label
                htmlFor="feed-family"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Feed
              </label>
              <select
                id="feed-family"
                value={family}
                onChange={(event) => {
                  setFamily(event.target.value as FeedFamily);
                  setShard('0');
                  setResult(null);
                  setError(null);
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {Object.entries(FEEDS).map(([value, feed]) => (
                  <option key={value} value={value}>
                    {feed.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="feed-shard"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Shard
              </label>
              <input
                id="feed-shard"
                type="number"
                min={0}
                max={FEEDS[family].shards - 1}
                step={1}
                value={shard}
                onChange={(event) => setShard(event.target.value)}
                className="w-36 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
              <span className="ml-2 text-sm text-muted-foreground">
                of {FEEDS[family].shards} shards
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runImport(true)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                <Eye size={15} /> Preview shard
              </button>
              <button
                type="button"
                onClick={() => runImport(false)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
                Import shard
              </button>
            </div>

            <p className="border-l-2 border-amber-500 pl-3 text-sm text-muted-foreground">
              Imports unique Zillow IDs and listing URLs into staging. It does not create leads or
              fetch property details. Re-running a shard is safe; records are deduplicated by zpid.
            </p>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <div role="status" className="rounded-md border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CheckCircle2 size={17} className="text-emerald-600" />
                  {result.dryRun ? 'Preview complete' : 'Shard imported'}
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Sitemap URLs</dt>
                  <dd className="text-right font-medium text-foreground">
                    {result.urlsSeen.toLocaleString()}
                  </dd>
                  <dt className="text-muted-foreground">Unique zpids</dt>
                  <dd className="text-right font-medium text-foreground">
                    {result.uniqueZpids.toLocaleString()}
                  </dd>
                  <dt className="text-muted-foreground">Duplicates in shard</dt>
                  <dd className="text-right font-medium text-foreground">
                    {result.duplicatesInShard.toLocaleString()}
                  </dd>
                  {!result.dryRun && (
                    <>
                      <dt className="text-muted-foreground">Rows merged</dt>
                      <dd className="text-right font-medium text-foreground">
                        {(result.upserted || 0).toLocaleString()}
                      </dd>
                    </>
                  )}
                </dl>
                <p className="mt-3 break-all border-t border-border pt-3 text-xs text-muted-foreground">
                  {result.sourceUrl}
                </p>
              </div>
            )}
          </section>
        ) : (
          <section className="max-w-2xl space-y-5">
            <div>
              <label
                htmlFor="trulia-json-file"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Provider JSON or extracted-text file
              </label>
              <input
                id="trulia-json-file"
                type="file"
                accept=".json,.txt,application/json,text/plain"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setTruliaJson(await file.text());
                  setTruliaResult(null);
                  setError(null);
                }}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
              />
            </div>

            <div>
              <label
                htmlFor="trulia-json"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Or paste the response text
              </label>
              <textarea
                id="trulia-json"
                rows={12}
                value={truliaJson}
                onChange={(event) => {
                  setTruliaJson(event.target.value);
                  setTruliaResult(null);
                  setError(null);
                }}
                placeholder={
                  '{"data":{"url":"https://www.trulia.com/for_rent/...","total":1958,"listings":[...]}}'
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runTruliaImport(true)}
                disabled={busy || !truliaJson.trim()}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                <Eye size={15} /> Preview JSON
              </button>
              <button
                type="button"
                onClick={() => runTruliaImport(false)}
                disabled={busy || !truliaJson.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
                Import rentals
              </button>
            </div>

            <p className="border-l-2 border-amber-500 pl-3 text-sm text-muted-foreground">
              Imports JSON exported from your licensed data provider. It does not fetch Trulia pages
              or create leads. Rental listings and communities are staged with their raw provider
              record; repeats merge by provider ID, zpid, or canonical listing URL.
            </p>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {truliaResult && (
              <div role="status" className="rounded-md border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CheckCircle2 size={17} className="text-emerald-600" />
                  {truliaResult.dryRun ? 'Preview complete' : 'Rental records staged'}
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Records in file</dt>
                  <dd className="text-right font-medium text-foreground">
                    {truliaResult.received.toLocaleString()}
                  </dd>
                  <dt className="text-muted-foreground">Unique records</dt>
                  <dd className="text-right font-medium text-foreground">
                    {truliaResult.uniqueListings.toLocaleString()}
                  </dd>
                  <dt className="text-muted-foreground">Duplicates in file</dt>
                  <dd className="text-right font-medium text-foreground">
                    {truliaResult.duplicatesInPayload.toLocaleString()}
                  </dd>
                  <dt className="text-muted-foreground">Skipped without identity</dt>
                  <dd className="text-right font-medium text-foreground">
                    {truliaResult.skippedMissingIdentity.toLocaleString()}
                  </dd>
                  {truliaResult.reportedTotal !== null && (
                    <>
                      <dt className="text-muted-foreground">Provider-reported matches</dt>
                      <dd className="text-right font-medium text-foreground">
                        {truliaResult.reportedTotal.toLocaleString()}
                      </dd>
                    </>
                  )}
                  {!truliaResult.dryRun && (
                    <>
                      <dt className="text-muted-foreground">Rows merged</dt>
                      <dd className="text-right font-medium text-foreground">
                        {(truliaResult.upserted || 0).toLocaleString()}
                      </dd>
                    </>
                  )}
                </dl>
                {truliaResult.sourceSearchUrl && (
                  <p className="mt-3 break-all border-t border-border pt-3 text-xs text-muted-foreground">
                    {truliaResult.sourceSearchUrl}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </AppLayout>
  );
}
