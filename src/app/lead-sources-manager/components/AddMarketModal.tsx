import React, { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import type { IngestionMethod } from '@/lib/leadSourceTypes';

export interface NewMarket { sourceName: string; market: string; state: string; city: string; url: string; method: IngestionMethod; notes: string }

interface Props {
  open: boolean;
  initialSource: string;
  sourceNames: string[];
  onClose: () => void;
  /** Resolves to an error message, or null when saved. */
  onCreate: (m: NewMarket) => Promise<string | null>;
}

const METHODS: Array<{ id: IngestionMethod; label: string; hint: string }> = [
  { id: 'manual', label: 'Manual', hint: 'Leads are brought in by hand or by CSV' },
  { id: 'scrape', label: 'Scrape', hint: 'Pulled from the source page on a schedule' },
  { id: 'api', label: 'API', hint: 'Pulled through the source\'s API' },
  { id: 'webhook', label: 'Webhook', hint: 'The source pushes leads to us' },
];

const field = 'w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';

export default function AddMarketModal({ open, initialSource, sourceNames, onClose, onCreate }: Props) {
  const blank: NewMarket = { sourceName: initialSource, market: '', state: '', city: '', url: '', method: 'manual', notes: '' };
  const [form, setForm] = useState<NewMarket>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setForm({ ...blank, sourceName: initialSource }); setError(null); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSource]);

  if (!open) return null;
  const set = <K extends keyof NewMarket>(k: K, v: NewMarket[K]) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null);
    const err = await onCreate(form);
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Add a market">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <form onSubmit={submit} className="relative w-full sm:max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Add a market</h2>
            <p className="text-xs text-muted-foreground mt-0.5">A source can run in several markets. Each one is paused, resumed and tracked on its own.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg hover:bg-muted inline-flex items-center justify-center text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-foreground">Source</span>
            <input list="lead-source-names" value={form.sourceName} onChange={e => set('sourceName', e.target.value)} placeholder="Zillow, Trulia, Dwellsy..." className={`${field} mt-1`} required minLength={2} maxLength={60} />
            <datalist id="lead-source-names">{sourceNames.map(n => <option key={n} value={n} />)}</datalist>
          </label>
          <div className="grid grid-cols-[1fr_88px] gap-3">
            <label className="block"><span className="text-xs font-semibold text-foreground">Market</span><input value={form.market} onChange={e => set('market', e.target.value)} placeholder="Denver, CO" className={`${field} mt-1`} required minLength={2} maxLength={80} /></label>
            <label className="block"><span className="text-xs font-semibold text-foreground">State</span><input value={form.state} onChange={e => set('state', e.target.value.toUpperCase())} placeholder="CO" maxLength={2} className={`${field} mt-1 uppercase`} /></label>
          </div>
          <label className="block"><span className="text-xs font-semibold text-foreground">City <span className="font-normal text-muted-foreground">(optional)</span></span><input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Aspen" maxLength={80} className={`${field} mt-1`} /></label>
          <label className="block"><span className="text-xs font-semibold text-foreground">Search link <span className="font-normal text-muted-foreground">(optional)</span></span><input type="url" value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://..." className={`${field} mt-1`} /></label>
          <fieldset>
            <legend className="text-xs font-semibold text-foreground mb-1.5">How leads come in</legend>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map(m => (
                <button key={m.id} type="button" onClick={() => set('method', m.id)} aria-pressed={form.method === m.id} className={`text-left rounded-xl border p-2.5 transition-colors ${form.method === m.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted'}`}>
                  <span className="block text-sm font-semibold text-foreground">{m.label}</span>
                  <span className="block text-[11px] text-muted-foreground leading-snug">{m.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block"><span className="text-xs font-semibold text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></span><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} maxLength={500} placeholder="Filters used, who owns it, anything the next person should know" className={`${field} mt-1 h-auto py-2 resize-none`} /></label>
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
          <button type="submit" disabled={saving} className="h-10 px-5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add market
          </button>
        </div>
      </form>
    </div>
  );
}
