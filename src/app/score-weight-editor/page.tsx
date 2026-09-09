'use client';

import React, { useState, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Save, RotateCcw, Info, TrendingUp, TrendingDown, Home, Clock, Shield, Zap, BarChart2, ChevronDown, ChevronUp,  } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreWeights {
  // Property Features
  beds: number;
  baths: number;
  price: number;
  // Recency Decay
  daysOnMarket: number;
  recencyDecay: number;
  // Source Weighting
  sourceZillow: number;
  sourceCraigslist: number;
  sourceApartments: number;
  sourceOther: number;
  // Regulation Bonus
  regulationAllowed: number;
  regulationRestricted: number;
  regulationPending: number;
  regulationBanned: number;
}

interface SampleLead {
  id: string;
  label: string;
  first_name: string;
  last_name: string;
  address: string;
  city: string;
  beds: number;
  baths: number;
  price: number;
  daysOnMarket: number;
  source: 'Zillow' | 'Craigslist' | 'Apartments.com' | 'Other';
  regulation: 'Allowed' | 'Restricted' | 'Pending' | 'Banned';
  baseScore: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'travlr_score_weights_v2';

const DEFAULT_WEIGHTS: ScoreWeights = {
  beds: 15,
  baths: 10,
  price: 20,
  daysOnMarket: 15,
  recencyDecay: 10,
  sourceZillow: 20,
  sourceCraigslist: 10,
  sourceApartments: 15,
  sourceOther: 10,
  regulationAllowed: 25,
  regulationRestricted: 10,
  regulationPending: 5,
  regulationBanned: 0,
};

const SAMPLE_LEADS: SampleLead[] = [
  {
    id: 'sl-1', label: 'High-Value Aspen', first_name: 'Sarah', last_name: 'Mitchell',
    address: '142 Aspen Ridge Dr', city: 'Aspen, CO',
    beds: 4, baths: 3, price: 3200, daysOnMarket: 45,
    source: 'Zillow', regulation: 'Allowed', baseScore: 72,
  },
  {
    id: 'sl-2', label: 'Mid-Tier Nashville', first_name: 'David', last_name: 'Nguyen',
    address: '87 Sunset Blvd', city: 'Nashville, TN',
    beds: 3, baths: 2, price: 1850, daysOnMarket: 12,
    source: 'Apartments.com', regulation: 'Restricted', baseScore: 55,
  },
  {
    id: 'sl-3', label: 'Budget Austin', first_name: 'Priya', last_name: 'Sharma',
    address: '310 Lakefront Ave', city: 'Austin, TX',
    beds: 2, baths: 1, price: 1400, daysOnMarket: 3,
    source: 'Craigslist', regulation: 'Pending', baseScore: 38,
  },
  {
    id: 'sl-4', label: 'Banned Market', first_name: 'Tom', last_name: 'Bradley',
    address: '55 Ocean View Rd', city: 'Santa Monica, CA',
    beds: 3, baths: 2, price: 4500, daysOnMarket: 60,
    source: 'Zillow', regulation: 'Banned', baseScore: 20,
  },
];

// ─── Score Calculation ────────────────────────────────────────────────────────

function calcScore(lead: SampleLead, w: ScoreWeights): number {
  let score = lead.baseScore;

  // Property features contribution
  const bedsBonus = Math.min(lead.beds / 5, 1) * (w.beds / 100) * 30;
  const bathsBonus = Math.min(lead.baths / 4, 1) * (w.baths / 100) * 20;
  // Price: lower price relative to market = higher score (normalize to 0-1 where 5000 = 0, 1000 = 1)
  const priceNorm = Math.max(0, 1 - (lead.price - 1000) / 4000);
  const priceBonus = priceNorm * (w.price / 100) * 25;

  // Days on market: more days = more motivated seller
  const domNorm = Math.min(lead.daysOnMarket / 90, 1);
  const domBonus = domNorm * (w.daysOnMarket / 100) * 20;

  // Recency decay: fewer days = fresher lead
  const recencyNorm = Math.max(0, 1 - lead.daysOnMarket / 60);
  const recencyBonus = recencyNorm * (w.recencyDecay / 100) * 15;

  // Source weighting
  const sourceMap: Record<string, number> = {
    Zillow: w.sourceZillow,
    Craigslist: w.sourceCraigslist,
    'Apartments.com': w.sourceApartments,
    Other: w.sourceOther,
  };
  const sourceBonus = (sourceMap[lead.source] ?? w.sourceOther) / 100 * 20;

  // Regulation bonus
  const regMap: Record<string, number> = {
    Allowed: w.regulationAllowed,
    Restricted: w.regulationRestricted,
    Pending: w.regulationPending,
    Banned: w.regulationBanned,
  };
  const regBonus = (regMap[lead.regulation] ?? 0) / 100 * 30;

  const raw = score + bedsBonus + bathsBonus + priceBonus + domBonus + recencyBonus + sourceBonus + regBonus;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

// ─── Slider Component ─────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  description: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  color: string;
  onChange: (v: number) => void;
}

function SliderRow({ label, description, value, min = 0, max = 50, step = 5, color, onChange }: SliderRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
        <span className="text-xl font-bold text-foreground font-mono shrink-0">{value}<span className="text-sm text-muted-foreground font-normal">%</span></span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, ${color} 0%, ${color} ${(value / max) * 100}%, var(--color-muted) ${(value / max) * 100}%, var(--color-muted) 100%)` }}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground/60">
        <span>0%</span>
        <span>{max}%</span>
      </div>
    </div>
  );
}

// ─── Score Bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, prevScore }: { score: number; prevScore: number }) {
  const delta = score - prevScore;
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : score >= 30 ? '#f97316' : '#ef4444';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold text-foreground">{score}</span>
        {delta !== 0 && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${delta > 0 ? 'text-emerald-500' : 'text-danger'}`}>
            {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function loadWeights(): ScoreWeights {
  if (typeof window === 'undefined') return DEFAULT_WEIGHTS;
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return { ...DEFAULT_WEIGHTS, ...JSON.parse(s) };
  } catch {}
  return DEFAULT_WEIGHTS;
}

export default function ScoreWeightEditorPage() {
  const [weights, setWeights] = useState<ScoreWeights>(loadWeights);
  const [prevWeights, setPrevWeights] = useState<ScoreWeights>(loadWeights);
  const [expandedSection, setExpandedSection] = useState<string | null>('property');

  const set = useCallback((key: keyof ScoreWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  }, []);

  function handleSave() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(weights));
    setPrevWeights(weights);
    toast.success('Score weights saved', { description: 'New weights apply to all future prospect score calculations.' });
  }

  function handleReset() {
    setWeights(DEFAULT_WEIGHTS);
    toast.info('Reset to default weights');
  }

  const sections = [
    {
      key: 'property',
      label: 'Property Features',
      icon: Home,
      color: '#3b82f6',
      description: 'How beds, baths, and price affect the score',
      sliders: [
        { key: 'beds' as keyof ScoreWeights, label: 'Bedrooms', description: 'More bedrooms → higher STR capacity → higher score', color: '#3b82f6' },
        { key: 'baths' as keyof ScoreWeights, label: 'Bathrooms', description: 'More bathrooms → better guest experience → higher score', color: '#60a5fa' },
        { key: 'price' as keyof ScoreWeights, label: 'Price Competitiveness', description: 'Lower listing price relative to market → higher score', color: '#93c5fd' },
      ],
    },
    {
      key: 'recency',
      label: 'Recency & Days on Market',
      icon: Clock,
      color: '#f59e0b',
      description: 'Freshness vs. motivated-seller signals',
      sliders: [
        { key: 'daysOnMarket' as keyof ScoreWeights, label: 'Days on Market Bonus', description: 'Longer on market → motivated seller → higher score', color: '#f59e0b' },
        { key: 'recencyDecay' as keyof ScoreWeights, label: 'Recency Freshness', description: 'Newer listings → higher freshness score', color: '#fbbf24' },
      ],
    },
    {
      key: 'source',
      label: 'Source Weighting',
      icon: Zap,
      color: '#8b5cf6',
      description: 'Adjust trust/quality weight per lead source',
      sliders: [
        { key: 'sourceZillow' as keyof ScoreWeights, label: 'Zillow', description: 'Weight for leads sourced from Zillow', color: '#0066ff' },
        { key: 'sourceApartments' as keyof ScoreWeights, label: 'Apartments.com', description: 'Weight for leads from Apartments.com', color: '#8b5cf6' },
        { key: 'sourceCraigslist' as keyof ScoreWeights, label: 'Craigslist', description: 'Weight for leads sourced from Craigslist', color: '#a78bfa' },
        { key: 'sourceOther' as keyof ScoreWeights, label: 'Other Sources', description: 'Weight for all other lead sources', color: '#c4b5fd' },
      ],
    },
    {
      key: 'regulation',
      label: 'Regulation Bonus',
      icon: Shield,
      color: '#22c55e',
      description: 'STR regulation status impact on score',
      sliders: [
        { key: 'regulationAllowed' as keyof ScoreWeights, label: 'STR Allowed', description: 'Full STR permitted — maximum bonus', color: '#22c55e' },
        { key: 'regulationRestricted' as keyof ScoreWeights, label: 'STR Restricted', description: 'Partial or conditional STR allowed', color: '#f59e0b' },
        { key: 'regulationPending' as keyof ScoreWeights, label: 'Regulation Pending', description: 'Regulation status unclear or in review', color: '#f97316' },
        { key: 'regulationBanned' as keyof ScoreWeights, label: 'STR Banned', description: 'STR not permitted — no bonus', color: '#ef4444' },
      ],
    },
  ];

  return (
    <AppLayout>
      <div className="px-6 py-5 max-w-screen-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Score Weight Editor</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Adjust prospect score calculation weights — see real-time impact on sample leads
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Save size={14} />
              Save Weights
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
          {/* ── Left: Weight Sections ── */}
          <div className="space-y-3">
            {sections.map((section) => {
              const Icon = section.icon;
              const isOpen = expandedSection === section.key;
              return (
                <div key={section.key} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedSection(isOpen ? null : section.key)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: `${section.color}18` }}>
                        <Icon size={15} style={{ color: section.color }} />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-foreground">{section.label}</p>
                        <p className="text-[11px] text-muted-foreground">{section.description}</p>
                      </div>
                    </div>
                    {isOpen ? <ChevronUp size={15} className="text-muted-foreground" /> : <ChevronDown size={15} className="text-muted-foreground" />}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
                      {section.sliders.map((slider) => (
                        <SliderRow
                          key={slider.key}
                          label={slider.label}
                          description={slider.description}
                          value={weights[slider.key]}
                          color={slider.color}
                          onChange={(v) => set(slider.key, v)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Info Banner */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <Info size={15} className="text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How weights work</p>
                <p>Each weight category contributes a bonus on top of the base score. Higher weights amplify that factor's influence. The preview panel shows real-time score changes as you adjust sliders.</p>
                <p>Weights are independent — you can emphasize multiple factors simultaneously. Save to apply to all future score calculations.</p>
              </div>
            </div>
          </div>

          {/* ── Right: Real-Time Impact Preview ── */}
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <BarChart2 size={14} className="text-primary" />
                Real-Time Score Impact
              </h3>
              <p className="text-[11px] text-muted-foreground mb-4">Scores update live as you adjust weights above</p>

              <div className="space-y-4">
                {SAMPLE_LEADS.map((lead) => {
                  const newScore = calcScore(lead, weights);
                  const oldScore = calcScore(lead, prevWeights);
                  const delta = newScore - oldScore;
                  const regColor = lead.regulation === 'Allowed' ? 'text-emerald-500 bg-emerald-500/10' :
                    lead.regulation === 'Restricted' ? 'text-amber-500 bg-amber-500/10' :
                    lead.regulation === 'Pending' ? 'text-orange-500 bg-orange-500/10' : 'text-danger bg-danger/10';

                  return (
                    <div key={lead.id} className="p-3 rounded-xl border border-border hover:border-primary/30 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{lead.first_name} {lead.last_name}</p>
                          <p className="text-[11px] text-muted-foreground">{lead.address} · {lead.city}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{lead.beds}bd/{lead.baths}ba</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">${lead.price.toLocaleString()}/mo</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{lead.daysOnMarket}d on market</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{lead.source}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${regColor}`}>{lead.regulation}</span>
                          </div>
                        </div>
                      </div>
                      <ScoreBar score={newScore} prevScore={oldScore} />
                      {delta !== 0 && (
                        <p className={`text-[11px] mt-1 ${delta > 0 ? 'text-emerald-500' : 'text-danger'}`}>
                          {delta > 0 ? '↑' : '↓'} {Math.abs(delta)} pts from saved weights
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Weight Summary */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Current Weight Summary</h3>
              <div className="space-y-2">
                {[
                  { label: 'Beds', value: weights.beds, color: '#3b82f6' },
                  { label: 'Baths', value: weights.baths, color: '#60a5fa' },
                  { label: 'Price', value: weights.price, color: '#93c5fd' },
                  { label: 'Days on Market', value: weights.daysOnMarket, color: '#f59e0b' },
                  { label: 'Recency', value: weights.recencyDecay, color: '#fbbf24' },
                  { label: 'Zillow', value: weights.sourceZillow, color: '#0066ff' },
                  { label: 'Apartments.com', value: weights.sourceApartments, color: '#8b5cf6' },
                  { label: 'Craigslist', value: weights.sourceCraigslist, color: '#a78bfa' },
                  { label: 'Reg: Allowed', value: weights.regulationAllowed, color: '#22c55e' },
                  { label: 'Reg: Restricted', value: weights.regulationRestricted, color: '#f59e0b' },
                  { label: 'Reg: Pending', value: weights.regulationPending, color: '#f97316' },
                  { label: 'Reg: Banned', value: weights.regulationBanned, color: '#ef4444' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-28 shrink-0">{item.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${(item.value / 50) * 100}%`, backgroundColor: item.color }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-foreground w-8 text-right">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
