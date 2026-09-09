'use client';

import React, { useState } from 'react';
import { X, MapPin, AlertTriangle, CheckCircle } from 'lucide-react';
import { PORTFOLIOS } from '@/contexts/PortfolioContext';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface RetagPortfolioModalProps {
  selectedIds: string[];
  onClose: () => void;
  onComplete: () => void;
}

// State → representative city mapping for address correction
const STATE_DEFAULT_CITY: Record<string, { city: string; zip: string }> = {
  CO: { city: 'Denver', zip: '80202' },
  CA: { city: 'Los Angeles', zip: '90028' },
  NV: { city: 'Las Vegas', zip: '89101' },
  WA: { city: 'Seattle', zip: '98101' },
  TX: { city: 'Dallas', zip: '75201' },
  FL: { city: 'Miami', zip: '33101' },
  UT: { city: 'Salt Lake City', zip: '84101' },
  ME: { city: 'Portland', zip: '04101' },
  OR: { city: 'Portland', zip: '97201' },
  MA: { city: 'Boston', zip: '02101' },
};

export default function RetagPortfolioModal({ selectedIds, onClose, onComplete }: RetagPortfolioModalProps) {
  const [targetState, setTargetState] = useState('');
  const [updateCity, setUpdateCity] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [updatedCount, setUpdatedCount] = useState(0);

  const portfolioOptions = PORTFOLIOS.filter((p) => p.stateCode !== 'all');

  async function handleRetag() {
    if (!targetState) {
      toast.error('Please select a target portfolio');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    try {
      const updatePayload: Record<string, string> = {
        state: targetState,
        updated_at: new Date().toISOString().split('T')[0],
      };

      if (updateCity && STATE_DEFAULT_CITY[targetState]) {
        updatePayload.city = STATE_DEFAULT_CITY[targetState].city;
        updatePayload.zip = STATE_DEFAULT_CITY[targetState].zip;
      }

      // Process in batches of 100 to avoid query size limits
      const BATCH = 100;
      let totalUpdated = 0;

      for (let i = 0; i < selectedIds.length; i += BATCH) {
        const batch = selectedIds.slice(i, i + BATCH);
        const { error, count } = await supabase
          .from('leads')
          .update(updatePayload)
          .in('id', batch)
          .select('id', { count: 'exact', head: true });

        if (error) {
          toast.error(`Batch update failed: ${error.message}`);
          setSaving(false);
          return;
        }
        totalUpdated += count ?? batch.length;
      }

      setUpdatedCount(totalUpdated);
      setDone(true);
      toast.success(`${totalUpdated} lead${totalUpdated !== 1 ? 's' : ''} re-tagged to ${portfolioOptions.find(p => p.stateCode === targetState)?.label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Re-tag failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-teal-500" />
            <h2 className="text-sm font-semibold text-foreground">Re-tag Portfolio</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle size={36} className="text-success" />
              <p className="text-sm font-semibold text-foreground">
                {updatedCount} lead{updatedCount !== 1 ? 's' : ''} successfully re-tagged
              </p>
              <p className="text-xs text-muted-foreground">
                All scores, stages, notes, and enrichment data were preserved.
              </p>
              <button
                onClick={() => { onComplete(); onClose(); }}
                className="mt-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This will move <strong>{selectedIds.length} lead{selectedIds.length !== 1 ? 's' : ''}</strong> to a new portfolio by updating their state. All scores, stages, notes, and enrichment data will be preserved.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Target Portfolio
                </label>
                <select
                  value={targetState}
                  onChange={(e) => setTargetState(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select a portfolio…</option>
                  {portfolioOptions.map((p) => (
                    <option key={p.key} value={p.stateCode}>
                      {p.label} ({p.stateCode})
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateCity}
                  onChange={(e) => setUpdateCity(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-xs text-foreground">
                  Also update city/zip to match target portfolio&apos;s primary market
                </span>
              </label>

              {targetState && STATE_DEFAULT_CITY[targetState] && updateCity && (
                <p className="text-xs text-muted-foreground">
                  City will be set to <strong>{STATE_DEFAULT_CITY[targetState].city}</strong> ({STATE_DEFAULT_CITY[targetState].zip})
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRetag}
              disabled={!targetState || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Re-tagging…
                </>
              ) : (
                <>
                  <MapPin size={13} />
                  Re-tag {selectedIds.length} Lead{selectedIds.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
