'use client';

import React, { useState, useCallback } from 'react';
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Zap, Brain, TrendingUp, Shield, Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import type { LeadQualificationRequest, LeadQualificationResult } from '@/app/api/ai/lead-qualification/route';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeadQualificationSignals {
  leadId: string;
  // Owner signals
  ownerProfile?: LeadQualificationRequest['ownerProfile'];
  // Property signals
  propertyProfile?: LeadQualificationRequest['propertyProfile'];
  // Response/engagement signals
  responsePatterns?: LeadQualificationRequest['responsePatterns'];
  // Regulatory context
  regulatoryContext?: LeadQualificationRequest['regulatoryContext'];
  // Current state
  currentStage?: string;
  currentScore?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  high: {
    label: 'High Priority',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />,
  },
  medium: {
    label: 'Medium Priority',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
  },
  low: {
    label: 'Low Priority',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: <Brain className="w-3.5 h-3.5 text-blue-600" />,
  },
  disqualified: {
    label: 'Disqualified',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-red-600" />,
  },
};

const PRIORITY_LABELS: Record<string, string> = {
  immediate: 'Call Immediately',
  this_week: 'This Week',
  next_cycle: 'Next Cycle',
  deprioritize: 'Deprioritize',
};

const PRIORITY_COLORS: Record<string, string> = {
  immediate: 'bg-red-100 text-red-700 border-red-200',
  this_week: 'bg-amber-100 text-amber-700 border-amber-200',
  next_cycle: 'bg-blue-100 text-blue-700 border-blue-200',
  deprioritize: 'bg-gray-100 text-gray-500 border-gray-200',
};

const BREAKDOWN_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  ownerTenureSignal: { label: 'Owner Tenure', icon: <User className="w-3 h-3" /> },
  propertyFitSignal: { label: 'Property Fit', icon: <Shield className="w-3 h-3" /> },
  responseEngagementSignal: { label: 'Engagement', icon: <TrendingUp className="w-3 h-3" /> },
  regulatoryFeasibility: { label: 'Regulatory', icon: <CheckCircle className="w-3 h-3" /> },
};

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#3b82f6' : '#ef4444';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={4} className="text-muted/30" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AILeadQualificationPanelProps {
  signals: LeadQualificationSignals;
  /** compact = inline card for Prospect Finder rows; full = expanded panel for Lead Profile */
  variant?: 'compact' | 'full';
  className?: string;
}

export default function AILeadQualificationPanel({
  signals,
  variant = 'full',
  className = '',
}: AILeadQualificationPanelProps) {
  const [result, setResult] = useState<LeadQualificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(variant === 'full');

  const runQualification = useCallback(async () => {
    setLoading(true);
    try {
      const payload: LeadQualificationRequest = {
        leadId: signals.leadId,
        ownerProfile: signals.ownerProfile,
        propertyProfile: signals.propertyProfile,
        responsePatterns: signals.responsePatterns,
        regulatoryContext: signals.regulatoryContext,
        currentStage: signals.currentStage,
        currentScore: signals.currentScore,
      };

      const res = await fetch('/api/ai/lead-qualification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Qualification request failed');
      }

      const data: LeadQualificationResult = await res.json();
      setResult(data);
      setExpanded(true);
      toast.success(`AI qualification: ${data.qualificationScore}/100 — ${TIER_CONFIG[data.priorityTier]?.label || data.priorityTier}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI qualification failed');
    } finally {
      setLoading(false);
    }
  }, [signals]);

  const tierCfg = result ? (TIER_CONFIG[result.priorityTier] || TIER_CONFIG.low) : null;

  // ── Compact variant (for Prospect Finder rows) ────────────────────────────
  if (variant === 'compact') {
    return (
      <div className={`mt-2 ${className}`}>
        {!result ? (
          <button
            onClick={runQualification}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {loading ? 'Analyzing…' : 'Qualify with AI'}
          </button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${tierCfg?.bg} ${tierCfg?.border} ${tierCfg?.color}`}>
                {tierCfg?.icon}
                <span>Qual: {result.qualificationScore}</span>
                <span className="opacity-60">({Math.round(result.confidence * 100)}% conf.)</span>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[result.outreachPriority] || ''}`}>
                {PRIORITY_LABELS[result.outreachPriority] || result.outreachPriority}
              </span>
              <button
                onClick={runQualification}
                disabled={loading}
                className="p-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
                title="Re-analyze"
              >
                <RefreshCw className={`w-3 h-3 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setExpanded(e => !e)}
                className="p-1 rounded hover:bg-gray-100 transition-colors"
              >
                {expanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
              </button>
            </div>

            {expanded && (
              <div className={`rounded-xl p-3 space-y-2 border ${tierCfg?.bg} ${tierCfg?.border}`}>
                {result.reasoning && (
                  <p className="text-xs leading-relaxed text-gray-700">{result.reasoning}</p>
                )}
                {result.recommendedAction && (
                  <div className="flex items-start gap-1.5">
                    <Zap className="w-3 h-3 text-indigo-500 mt-0.5 shrink-0" />
                    <p className="text-xs font-semibold text-indigo-700">{result.recommendedAction}</p>
                  </div>
                )}
                {result.keySignals.positive.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {result.keySignals.positive.map((s, i) => (
                      <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle className="w-2.5 h-2.5" />{s}
                      </span>
                    ))}
                  </div>
                )}
                {result.keySignals.negative.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {result.keySignals.negative.map((s, i) => (
                      <span key={i} className="text-xs bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" />{s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Full variant (for Lead Profile page) ─────────────────────────────────
  return (
    <div className={`bg-card border border-border rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Lead Qualification</h3>
            <p className="text-[11px] text-muted-foreground">
              Anthropic Claude · Homeowner signal analysis
              {result && ` · Analyzed ${new Date(result.qualifiedAt).toLocaleTimeString()}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={runQualification}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              title="Re-analyze"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {!result ? (
            <button
              onClick={runQualification}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {loading ? 'Analyzing signals…' : 'Analyze & Qualify'}
            </button>
          ) : (
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && !result && (
        <div className="px-5 py-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
          <span>Claude is analyzing homeowner signals…</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !result && (
        <div className="px-5 py-6 text-center space-y-2">
          <Brain className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">
            Analyze owner tenure, property profile, and response patterns to predict qualification probability.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Signals analyzed: owner tenure · property fit · engagement patterns · regulatory feasibility
          </p>
        </div>
      )}

      {/* Result */}
      {result && expanded && (
        <div className="p-5 space-y-5">
          {/* Score summary row */}
          <div className="flex items-center gap-5">
            <ScoreRing score={result.qualificationScore} size={64} />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {tierCfg && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${tierCfg.bg} ${tierCfg.border} ${tierCfg.color}`}>
                    {tierCfg.icon}
                    {tierCfg.label}
                  </span>
                )}
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${PRIORITY_COLORS[result.outreachPriority] || ''}`}>
                  {PRIORITY_LABELS[result.outreachPriority] || result.outreachPriority}
                </span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(result.qualificationProbability * 100)}% qual. probability · {Math.round(result.confidence * 100)}% confidence
                </span>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{result.reasoning}</p>
            </div>
          </div>

          {/* Score breakdown */}
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(result.scoreBreakdown) as [string, number][]).map(([key, value]) => {
              const cfg = BREAKDOWN_LABELS[key];
              const pct = (value / 25) * 100;
              const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : pct >= 40 ? 'bg-blue-500' : 'bg-red-400';
              return (
                <div key={key} className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {cfg?.icon}
                      <span>{cfg?.label || key}</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">{value}/25</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Key signals */}
          {(result.keySignals.positive.length > 0 || result.keySignals.negative.length > 0) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Key Signals</p>
              <div className="flex flex-wrap gap-1.5">
                {result.keySignals.positive.map((s, i) => (
                  <span key={`pos-${i}`} className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-2.5 h-2.5 shrink-0" />{s}
                  </span>
                ))}
                {result.keySignals.negative.map((s, i) => (
                  <span key={`neg-${i}`} className="flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />{s}
                  </span>
                ))}
                {result.keySignals.neutral.map((s, i) => (
                  <span key={`neu-${i}`} className="flex items-center gap-1 text-xs bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommended action */}
          {result.recommendedAction && (
            <div className="flex items-start gap-2.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-lg p-3">
              <Zap className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 mb-0.5">Recommended Action</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-300">{result.recommendedAction}</p>
              </div>
            </div>
          )}

          {/* Footer */}
          <p className="text-[10px] text-muted-foreground/60 text-right">
            Powered by Claude · {new Date(result.qualifiedAt).toLocaleString()} · For agent context only
          </p>
        </div>
      )}

      {/* Collapsed result summary */}
      {result && !expanded && (
        <div className="px-5 py-3 flex items-center gap-3">
          <ScoreRing score={result.qualificationScore} size={36} />
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {tierCfg && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold ${tierCfg.bg} ${tierCfg.border} ${tierCfg.color}`}>
                {tierCfg.icon}
                {tierCfg.label}
              </span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[result.outreachPriority] || ''}`}>
              {PRIORITY_LABELS[result.outreachPriority]}
            </span>
            <span className="text-xs text-muted-foreground">{Math.round(result.qualificationProbability * 100)}% probability</span>
          </div>
        </div>
      )}
    </div>
  );
}
