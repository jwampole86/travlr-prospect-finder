'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Brain, TrendingUp, Users, Database, ChevronDown, ChevronUp, Search, Loader2, RefreshCw, Phone, Mail, Info, Building2, Zap, ArrowUp, ArrowDown, Minus, Shield } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import { calculateProspectScore } from '@/lib/scoring/prospectScoring';


interface Lead {
  id: string;
  address?: string;
  city?: string;
  state?: string;
  stage?: string;
  prospect_score?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  estimated_net_monthly?: number;
  estimated_gross_monthly?: number;
  estimated_adr?: number;
  regulation_status?: string;
  enrichment_status?: string;
  dnc_flagged?: boolean;
  do_not_contact?: boolean;
  tcpa_risk?: string;
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  square_feet?: number;
  year_built?: number;
  verified_owner?: boolean;
  verified_number?: boolean;
  verified_address?: string | boolean | null;
  luxury?: boolean;
  assigned_agent_id?: string;
  created_at?: string;
}

interface ScoreBreakdown {
  total: number;
  calculatedTotal: number;
  revenuePotential: { score: number; max: number; factors: ScoreFactor[] };
  propertyFit: { score: number; max: number; factors: ScoreFactor[] };
  regulatoryFeasibility: { score: number; max: number; factors: ScoreFactor[] };
  leadQuality: { score: number; max: number; factors: ScoreFactor[] };
  engagement: { score: number; max: number; factors: ScoreFactor[] };
}

interface ScoreFactor {
  label: string;
  value: string | number;
  impact: 'positive' | 'negative' | 'neutral';
  points: number;
  maxPoints: number;
  explanation: string;
}

function toImpact(score: number): ScoreFactor['impact'] {
  if (score >= 70) return 'positive';
  if (score >= 40) return 'neutral';
  return 'negative';
}

function toScoreFactor(factor: ReturnType<typeof calculateProspectScore>['factors'][number]): ScoreFactor {
  return {
    label: factor.label,
    value: `${factor.score}/100 raw`,
    impact: toImpact(factor.score),
    points: factor.weightedPoints,
    maxPoints: factor.weight,
    explanation: factor.explanation,
  };
}

function generateBreakdown(lead: Lead): ScoreBreakdown {
  const result = calculateProspectScore({
    estimatedNetMonthly: lead.estimated_net_monthly,
    estimatedGrossMonthly: lead.estimated_gross_monthly,
    estimatedADR: lead.estimated_adr,
    beds: lead.bedrooms,
    baths: lead.bathrooms,
    propertyType: lead.property_type,
    regulationStatus: lead.regulation_status,
    verifiedOwner: lead.verified_owner,
    verifiedNumber: lead.verified_number,
    verifiedAddress: lead.verified_address,
    contactPhone: lead.contact_phone,
    contactEmail: lead.contact_email,
    doNotContact: lead.do_not_contact || lead.dnc_flagged,
    stage: lead.stage,
    luxury: lead.luxury,
  });

  const factorMap = new Map(result.factors.map((factor) => [factor.key, toScoreFactor(factor)]));
  const blockerFactors: ScoreFactor[] = result.blockers.map((blocker) => ({
    label: 'Blocking Factor',
    value: 'Blocked',
    impact: 'negative',
    points: 0,
    maxPoints: 0,
    explanation: blocker,
  }));

  return {
    total: lead.prospect_score || result.score,
    calculatedTotal: result.score,
    revenuePotential: { score: factorMap.get('revenuePotential')?.points ?? 0, max: factorMap.get('revenuePotential')?.maxPoints ?? 25, factors: [factorMap.get('revenuePotential')!].filter(Boolean) },
    propertyFit: { score: factorMap.get('propertyFit')?.points ?? 0, max: factorMap.get('propertyFit')?.maxPoints ?? 25, factors: [factorMap.get('propertyFit')!].filter(Boolean) },
    regulatoryFeasibility: { score: factorMap.get('regulatoryFeasibility')?.points ?? 0, max: factorMap.get('regulatoryFeasibility')?.maxPoints ?? 25, factors: [factorMap.get('regulatoryFeasibility')!].filter(Boolean).concat(blockerFactors) },
    leadQuality: { score: factorMap.get('leadQuality')?.points ?? 0, max: factorMap.get('leadQuality')?.maxPoints ?? 15, factors: [factorMap.get('leadQuality')!].filter(Boolean) },
    engagement: { score: factorMap.get('engagement')?.points ?? 0, max: factorMap.get('engagement')?.maxPoints ?? 10, factors: [factorMap.get('engagement')!].filter(Boolean) },
  };
}

function ScoreRing({ score, max, color }: { score: number; max: number; color: string }) {
  const pct = Math.min(100, (score / max) * 100);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <svg width="72" height="72" className="rotate-[-90deg]">
      <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/40" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
    </svg>
  );
}

function ImpactIcon({ impact }: { impact: 'positive' | 'negative' | 'neutral' }) {
  if (impact === 'positive') return <ArrowUp size={10} className="text-emerald-400" />;
  if (impact === 'negative') return <ArrowDown size={10} className="text-red-400" />;
  return <Minus size={10} className="text-muted-foreground" />;
}

function CategoryPanel({
  title, icon: Icon, color, score, max, factors, expanded, onToggle
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  score: number;
  max: number;
  factors: ScoreFactor[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round((score / max) * 100);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="relative shrink-0">
          <ScoreRing score={score} max={max} color={color} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold text-foreground">{score}</span>
            <span className="text-[9px] text-muted-foreground">/{max}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon size={14} style={{ color }} />
            <span className="text-sm font-semibold text-foreground">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border/50">
          {factors.map((factor, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-3">
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                <ImpactIcon impact={factor.impact} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-foreground">{factor.label}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-bold text-foreground">{factor.points}</span>
                    <span className="text-[10px] text-muted-foreground">/{factor.maxPoints} pts</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${factor.impact === 'positive' ? 'bg-emerald-500/10 text-emerald-400' : factor.impact === 'negative' ? 'bg-red-500/10 text-red-400' : 'bg-muted text-muted-foreground'}`}>
                    {factor.value}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{factor.explanation}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ScoreBreakdownPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['revenuePotential']));

  const loadLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('leads')
        .select('id, address, city, state, stage, prospect_score, contact_name, contact_phone, contact_email, estimated_net_monthly, estimated_gross_monthly, estimated_adr, regulation_status, enrichment_status, dnc_flagged, do_not_contact, tcpa_risk, property_type, bedrooms, bathrooms, square_feet, year_built, verified_owner, verified_number, verified_address, luxury, assigned_agent_id, created_at')
        .eq('user_id', user.id)
        .not('prospect_score', 'is', null)
        .order('prospect_score', { ascending: false })
        .limit(100);
      setLeads(data || []);
      if (data && data.length > 0) setSelectedLead(data[0]);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const filteredLeads = leads.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (l.address || '').toLowerCase().includes(q) || (l.contact_name || '').toLowerCase().includes(q) || (l.city || '').toLowerCase().includes(q);
  });

  function toggleCategory(key: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const breakdown = selectedLead ? generateBreakdown(selectedLead) : null;

  function getScoreColor(score: number) {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#3b82f6';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  }

  function getScoreLabel(score: number) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Low';
  }

  const categories = breakdown ? [
    { key: 'revenuePotential', title: 'Revenue Potential', icon: TrendingUp, color: '#3b82f6', data: breakdown.revenuePotential },
    { key: 'propertyFit', title: 'Property Fit', icon: Building2, color: '#f59e0b', data: breakdown.propertyFit },
    { key: 'regulatoryFeasibility', title: 'Regulatory Feasibility', icon: Shield, color: '#10b981', data: breakdown.regulatoryFeasibility },
    { key: 'leadQuality', title: 'Lead Quality', icon: Database, color: '#8b5cf6', data: breakdown.leadQuality },
    { key: 'engagement', title: 'Engagement & Freshness', icon: Users, color: '#e11d48', data: breakdown.engagement },
  ] : [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">AI Score Breakdown</h1>
              <p className="text-xs text-muted-foreground">Understand why each lead scores the way it does</p>
            </div>
          </div>
          <button onClick={loadLeads} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <RefreshCw size={14} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Lead list */}
          <div className="w-72 border-r border-border flex flex-col overflow-hidden bg-card/30">
            <div className="px-3 py-2.5 border-b border-border">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border">
                <Search size={12} className="text-muted-foreground shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search leads..."
                  className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-xs text-muted-foreground">No scored leads found</p>
                </div>
              ) : (
                filteredLeads.map(lead => {
                  const score = lead.prospect_score || 0;
                  const color = getScoreColor(score);
                  const isSelected = selectedLead?.id === lead.id;
                  return (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors text-left ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                    >
                      {/* Score circle */}
                      <div className="relative shrink-0 w-10 h-10">
                        <svg width="40" height="40" className="rotate-[-90deg]">
                          <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/40" />
                          <circle cx="20" cy="20" r="16" fill="none" stroke={color} strokeWidth="3"
                            strokeDasharray={`${(score / 100) * (2 * Math.PI * 16)} ${2 * Math.PI * 16}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[11px] font-bold text-foreground">{score}</span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{lead.address || '—'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{lead.contact_name || lead.city || '—'}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{lead.stage || 'New'}</span>
                          {lead.dnc_flagged && <span className="text-[9px] px-1 rounded bg-red-500/10 text-red-400">DNC</span>}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Score breakdown panel */}
          <div className="flex-1 overflow-y-auto">
            {!selectedLead ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Brain size={40} className="text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Select a lead to see its score breakdown</p>
                </div>
              </div>
            ) : breakdown ? (
              <div className="p-6 max-w-2xl">
                {/* Lead header */}
                <div className="flex items-start gap-4 mb-6">
                  {/* Big score */}
                  <div className="relative shrink-0">
                    <svg width="100" height="100" className="rotate-[-90deg]">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke={getScoreColor(breakdown.total)} strokeWidth="6"
                        strokeDasharray={`${(breakdown.total / 100) * (2 * Math.PI * 42)} ${2 * Math.PI * 42}`}
                        strokeLinecap="round"
                        className="transition-all duration-700"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-foreground">{breakdown.total}</span>
                      <span className="text-[10px] text-muted-foreground">/100</span>
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold text-foreground">{selectedLead.address || 'Unknown Property'}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold`} style={{ backgroundColor: `${getScoreColor(breakdown.total)}20`, color: getScoreColor(breakdown.total) }}>
                        {getScoreLabel(breakdown.total)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {[selectedLead.city, selectedLead.state].filter(Boolean).join(', ')} · {selectedLead.contact_name || 'No contact'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedLead.contact_phone && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Phone size={10} /> {selectedLead.contact_phone}
                        </span>
                      )}
                      {selectedLead.contact_email && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Mail size={10} /> {selectedLead.contact_email}
                        </span>
                      )}
                      <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${selectedLead.stage === 'Qualified' || selectedLead.stage === 'Proposal' ? 'bg-blue-500/10 text-blue-400' : 'bg-muted text-muted-foreground'}`}>
                        {selectedLead.stage || 'New'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score distribution bar */}
                <div className="bg-card border border-border rounded-xl p-4 mb-4">
                  <p className="text-xs font-semibold text-foreground mb-3">Score Distribution</p>
                  <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                    {categories.map(cat => (
                      <div
                        key={cat.key}
                        className="h-full rounded-sm transition-all duration-700"
                        style={{
                          width: `${(cat.data.score / 100) * 100}%`,
                          backgroundColor: cat.color,
                          opacity: 0.85,
                        }}
                        title={`${cat.title}: ${cat.data.score}/${cat.data.max}`}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2.5">
                    {categories.map(cat => (
                      <div key={cat.key} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="text-[11px] text-muted-foreground">{cat.title}: <span className="text-foreground font-medium">{cat.data.score}/{cat.data.max}</span></span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Category panels */}
                <div className="space-y-3">
                  {categories.map(cat => (
                    <CategoryPanel
                      key={cat.key}
                      title={cat.title}
                      icon={cat.icon}
                      color={cat.color}
                      score={cat.data.score}
                      max={cat.data.max}
                      factors={cat.data.factors}
                      expanded={expandedCategories.has(cat.key)}
                      onToggle={() => toggleCategory(cat.key)}
                    />
                  ))}
                </div>

                {/* Improvement tips */}
                <div className="mt-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap size={14} className="text-amber-400" />
                    <span className="text-xs font-semibold text-foreground">How to improve this score</span>
                  </div>
                  <ul className="space-y-1.5">
                    {breakdown.leadQuality.score < 10 && (
                      <li className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-amber-400 mt-0.5">→</span>
                        Run enrichment to improve owner, address, phone, and email readiness (+{15 - breakdown.leadQuality.score} pts potential)
                      </li>
                    )}
                    {breakdown.regulatoryFeasibility.score < 15 && (
                      <li className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-amber-400 mt-0.5">→</span>
                        Review local STR rules before agent outreach so compliance risk is clear
                      </li>
                    )}
                    {selectedLead.dnc_flagged || selectedLead.do_not_contact ? (
                      <li className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-red-400 mt-0.5">⚠</span>
                        Obtain written consent before outreach — compliance flags block standard calling
                      </li>
                    ) : null}
                    {breakdown.engagement.score < 6 && (
                      <li className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-amber-400 mt-0.5">→</span>
                        Use SMS, email clicks, callbacks, or answered calls to raise engagement priority
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
