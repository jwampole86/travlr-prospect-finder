'use client';

import React from 'react';
import { Clock, DollarSign, Shield, MapPin, Info } from 'lucide-react';

export interface ScoringThresholds {
  domMotivatedDays: number;       // DOM >= this = motivated seller (max score)
  domStaleDays: number;           // DOM >= this = stale (penalized)
  priceCompetitivenessPct: number; // % below market avg = competitive
  priceOverpricedPct: number;     // % above market avg = overpriced (penalized)
  saturationLowPct: number;       // STR density <= this % = low saturation (bonus)
  saturationHighPct: number;      // STR density >= this % = high saturation (penalty)
}

export const DEFAULT_THRESHOLDS: ScoringThresholds = {
  domMotivatedDays: 30,
  domStaleDays: 90,
  priceCompetitivenessPct: 10,
  priceOverpricedPct: 15,
  saturationLowPct: 15,
  saturationHighPct: 40,
};

interface Props {
  thresholds: ScoringThresholds;
  onChange: (key: keyof ScoringThresholds, value: number) => void;
}

interface ThresholdFieldProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  color: string;
}

function ThresholdField({ label, description, value, min, max, step, unit, onChange, color }: ThresholdFieldProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
          className={`w-16 px-2 py-1.5 text-sm font-mono font-semibold text-center bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary ${color}`}
        />
        <span className="text-xs text-muted-foreground w-8">{unit}</span>
      </div>
    </div>
  );
}

const REGULATION_SCORE_MAP: Record<string, number> = {
  'Allowed': 100,
  'Pending': 60,
  'Restricted': 30,
  'Banned': 0,
};

export default function ScoringThresholdsEditor({ thresholds, onChange }: Props) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Threshold Configuration</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Set the breakpoints that determine when each factor scores high, medium, or low. These override the fixed algorithm defaults.
        </p>
      </div>

      {/* DOM Thresholds */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-muted text-amber-500"><Clock size={13} /></div>
          <p className="text-sm font-semibold text-foreground">Days on Market</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3 space-y-3">
          <ThresholdField
            label="Motivated Seller Threshold"
            description="Listings on market ≥ this many days are considered motivated sellers and score highest."
            value={thresholds.domMotivatedDays}
            min={1} max={180} step={1} unit="days"
            onChange={(v) => onChange('domMotivatedDays', v)}
            color="text-amber-600"
          />
          <div className="border-t border-border" />
          <ThresholdField
            label="Stale Listing Penalty"
            description="Listings on market ≥ this many days trigger a stale penalty (possible issues with property)."
            value={thresholds.domStaleDays}
            min={thresholds.domMotivatedDays + 1} max={365} step={1} unit="days"
            onChange={(v) => onChange('domStaleDays', v)}
            color="text-red-500"
          />
        </div>
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info size={11} className="mt-0.5 shrink-0" />
          <span>Score: &lt;{thresholds.domMotivatedDays}d = low · {thresholds.domMotivatedDays}–{thresholds.domStaleDays}d = high · &gt;{thresholds.domStaleDays}d = penalized</span>
        </div>
      </div>

      {/* Price Competitiveness Thresholds */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-muted text-blue-500"><DollarSign size={13} /></div>
          <p className="text-sm font-semibold text-foreground">Price Competitiveness</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3 space-y-3">
          <ThresholdField
            label="Competitive Price Band"
            description="Listings priced ≥ this % below market average are considered competitive and score highest."
            value={thresholds.priceCompetitivenessPct}
            min={1} max={50} step={1} unit="%"
            onChange={(v) => onChange('priceCompetitivenessPct', v)}
            color="text-blue-600"
          />
          <div className="border-t border-border" />
          <ThresholdField
            label="Overpriced Penalty Band"
            description="Listings priced ≥ this % above market average are penalized in scoring."
            value={thresholds.priceOverpricedPct}
            min={1} max={60} step={1} unit="%"
            onChange={(v) => onChange('priceOverpricedPct', v)}
            color="text-red-500"
          />
        </div>
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info size={11} className="mt-0.5 shrink-0" />
          <span>Score: ≥{thresholds.priceCompetitivenessPct}% below avg = max · within band = proportional · ≥{thresholds.priceOverpricedPct}% above avg = penalized</span>
        </div>
      </div>

      {/* Regulation Status */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-muted text-emerald-500"><Shield size={13} /></div>
          <p className="text-sm font-semibold text-foreground">Regulation Status Score Map</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-[11px] text-muted-foreground mb-3">Fixed score values per regulation status. These reflect STR viability and cannot be reordered.</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(REGULATION_SCORE_MAP).map(([status, score]) => (
              <div key={status} className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2">
                <span className="text-xs font-medium text-foreground">{status}</span>
                <span className={`text-xs font-bold font-mono ${score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                  {score}/100
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Neighborhood Saturation Thresholds */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-muted text-purple-500"><MapPin size={13} /></div>
          <p className="text-sm font-semibold text-foreground">Neighborhood Saturation</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3 space-y-3">
          <ThresholdField
            label="Low Saturation Bonus"
            description="Neighborhoods with STR density ≤ this % are considered underserved and score highest."
            value={thresholds.saturationLowPct}
            min={1} max={50} step={1} unit="%"
            onChange={(v) => onChange('saturationLowPct', v)}
            color="text-purple-600"
          />
          <div className="border-t border-border" />
          <ThresholdField
            label="High Saturation Penalty"
            description="Neighborhoods with STR density ≥ this % are considered oversaturated and score lowest."
            value={thresholds.saturationHighPct}
            min={thresholds.saturationLowPct + 1} max={100} step={1} unit="%"
            onChange={(v) => onChange('saturationHighPct', v)}
            color="text-red-500"
          />
        </div>
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info size={11} className="mt-0.5 shrink-0" />
          <span>Score: ≤{thresholds.saturationLowPct}% density = max · {thresholds.saturationLowPct}–{thresholds.saturationHighPct}% = proportional · ≥{thresholds.saturationHighPct}% = penalized</span>
        </div>
      </div>
    </div>
  );
}
