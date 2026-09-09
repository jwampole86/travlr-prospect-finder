'use client';

import React, { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import ScoringRulesEditor from './components/ScoringRulesEditor';
import ScoringPreview from './components/ScoringPreview';
import FollowUpTools from './components/FollowUpTools';
import ScoringThresholdsEditor, { DEFAULT_THRESHOLDS } from './components/ScoringThresholdsEditor';
import type { ScoringThresholds } from './components/ScoringThresholdsEditor';
import { SlidersHorizontal, Save, RotateCcw, Info, Mail, Target } from 'lucide-react';
import { toast } from 'sonner';

export interface ScoringWeights {
  revenuePotential: number;
  propertyFit: number;
  regulatoryFeasibility: number;
  leadQuality: number;
  engagement: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  revenuePotential: 25,
  propertyFit: 25,
  regulatoryFeasibility: 25,
  leadQuality: 15,
  engagement: 10,
};

const STORAGE_KEY = 'travlr_scoring_weights';
const THRESHOLDS_KEY = 'travlr_scoring_thresholds';

function loadWeights(): ScoringWeights {
  if (typeof window === 'undefined') return DEFAULT_WEIGHTS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_WEIGHTS;
}

function loadThresholds(): ScoringThresholds {
  if (typeof window === 'undefined') return DEFAULT_THRESHOLDS;
  try {
    const stored = localStorage.getItem(THRESHOLDS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_THRESHOLDS;
}

type ScoringSubTab = 'weights' | 'thresholds';

export default function ToolsPage() {
  const [weights, setWeights] = useState<ScoringWeights>(loadWeights);
  const [thresholds, setThresholds] = useState<ScoringThresholds>(loadThresholds);
  const [saved, setSaved] = useState(false);
  const [activeToolTab, setActiveToolTab] = useState<'scoring' | 'followup'>('scoring');
  const [scoringSubTab, setScoringSubTab] = useState<ScoringSubTab>('weights');

  const total = weights.revenuePotential + weights.propertyFit + weights.regulatoryFeasibility + weights.leadQuality + weights.engagement;
  const isValid = total === 100;

  const handleChange = useCallback((key: keyof ScoringWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleThresholdChange = useCallback((key: keyof ScoringThresholds, value: number) => {
    setThresholds((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  function handleSave() {
    if (scoringSubTab === 'weights' && !isValid) {
      toast.error('Weights must total exactly 100%', {
        description: `Current total: ${total}%. Adjust sliders to balance.`,
      });
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(weights));
    localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(thresholds));
    setSaved(true);
    toast.success('Scoring rules saved', {
      description: 'New weights and thresholds will apply to all future prospect scores.',
    });
  }

  function handleReset() {
    if (scoringSubTab === 'weights') {
      setWeights(DEFAULT_WEIGHTS);
    } else {
      setThresholds(DEFAULT_THRESHOLDS);
    }
    setSaved(false);
    toast.info('Reset to default values');
  }

  return (
    <AppLayout>
      <div className="px-6 py-5 max-w-screen-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Tools</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Scoring rules, follow-up templates, reminders, and outreach cadences.
            </p>
          </div>
          {activeToolTab === 'scoring' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground border border-border bg-card hover:bg-muted transition-all"
              >
                <RotateCcw size={13} />
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={scoringSubTab === 'weights' && !isValid}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={13} />
                {saved ? 'Saved ✓' : 'Save Rules'}
              </button>
            </div>
          )}
        </div>

        {/* Tool tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveToolTab('scoring')}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeToolTab === 'scoring' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <SlidersHorizontal size={14} />Scoring Rules
          </button>
          <button
            onClick={() => setActiveToolTab('followup')}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeToolTab === 'followup' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Mail size={14} />Follow-Up Tools
          </button>
        </div>

        {activeToolTab === 'scoring' && (
          <>
            {/* Scoring sub-tabs */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 border border-border w-fit">
              <button
                onClick={() => setScoringSubTab('weights')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${scoringSubTab === 'weights' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <SlidersHorizontal size={12} />Factor Weights
              </button>
              <button
                onClick={() => setScoringSubTab('thresholds')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${scoringSubTab === 'thresholds' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Target size={12} />Score Thresholds
              </button>
            </div>

            {scoringSubTab === 'weights' && (
              <>
                {/* Weight total indicator */}
                <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm ${
                  isValid
                    ? 'bg-success/5 border-success/30 text-success' : 'bg-warning/5 border-warning/30 text-warning'
                }`}>
                  <Info size={14} />
                  <span>
                    Total weight: <strong>{total}%</strong>
                    {isValid ? ' — balanced ✓' : ` — needs ${total > 100 ? `−${total - 100}` : `+${100 - total}`}% adjustment`}
                  </span>
                </div>

                {/* Main layout */}
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                  <div className="xl:col-span-3">
                    <ScoringRulesEditor weights={weights} onChange={handleChange} />
                  </div>
                  <div className="xl:col-span-2">
                    <ScoringPreview weights={weights} />
                  </div>
                </div>
              </>
            )}

            {scoringSubTab === 'thresholds' && (
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                <div className="xl:col-span-3">
                  <ScoringThresholdsEditor thresholds={thresholds} onChange={handleThresholdChange} />
                </div>
                <div className="xl:col-span-2">
                  <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">How Thresholds Work</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Thresholds define the <strong>breakpoints</strong> at which each scoring factor transitions between low, medium, and high scores. Unlike weights (which control relative importance), thresholds control the <strong>absolute values</strong> that trigger score changes.
                    </p>
                    <div className="space-y-2">
                      {[
                        { label: 'DOM Motivated Threshold', desc: 'Days on market before a listing is flagged as a motivated seller opportunity.' },
                        { label: 'DOM Stale Threshold', desc: 'Days on market before a listing is penalized for being potentially problematic.' },
                        { label: 'Price Competitive Band', desc: '% below market average required to be considered a competitive price.' },
                        { label: 'Engagement Thresholds', desc: 'Response, callback, click, and freshness signals that define outreach urgency.' },
                      ].map((item) => (
                        <div key={item.label} className="bg-muted/40 rounded-lg p-3">
                          <p className="text-xs font-medium text-foreground">{item.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 border-t border-border pt-3">
                      Changes take effect on the next prospect score calculation. Existing scores are not retroactively updated.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeToolTab === 'followup' && (
          <FollowUpTools />
        )}
      </div>
    </AppLayout>
  );
}
