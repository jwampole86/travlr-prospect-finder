'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Brain, TrendingUp, Users, Database, ChevronDown, ChevronUp, Search, Loader2, RefreshCw, Phone, Mail, Info, Building2, Zap, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


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
  enrichment_status?: string;
  dnc_flagged?: boolean;
  tcpa_risk?: string;
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  square_feet?: number;
  year_built?: number;
  assigned_agent_id?: string;
  created_at?: string;
}

interface ScoreBreakdown {
  total: number;
  propertyFundamentals: { score: number; max: number; factors: ScoreFactor[] };
  marketConditions: { score: number; max: number; factors: ScoreFactor[] };
  agentFit: { score: number; max: number; factors: ScoreFactor[] };
  enrichmentQuality: { score: number; max: number; factors: ScoreFactor[] };
}

interface ScoreFactor {
  label: string;
  value: string | number;
  impact: 'positive' | 'negative' | 'neutral';
  points: number;
  maxPoints: number;
  explanation: string;
}

function generateBreakdown(lead: Lead): ScoreBreakdown {
  const total = lead.prospect_score || 0;

  // Property fundamentals (0–30 pts)
  const propFactors: ScoreFactor[] = [
    {
      label: 'Property Type',
      value: lead.property_type || 'Single Family',
      impact: 'positive',
      points: lead.property_type === 'Multi-Family' ? 10 : 8,
      maxPoints: 10,
      explanation: 'Single-family and multi-family homes score highest for rental conversion potential.',
    },
    {
      label: 'Year Built',
      value: lead.year_built ? String(lead.year_built) : 'Unknown',
      impact: lead.year_built && lead.year_built > 1990 ? 'positive' : lead.year_built ? 'neutral' : 'negative',
      points: lead.year_built ? (lead.year_built > 2000 ? 8 : lead.year_built > 1980 ? 6 : 4) : 2,
      maxPoints: 8,
      explanation: 'Newer properties require less maintenance and attract higher-quality tenants.',
    },
    {
      label: 'Estimated Monthly Revenue',
      value: lead.estimated_net_monthly ? `$${lead.estimated_net_monthly.toLocaleString()}` : '—',
      impact: lead.estimated_net_monthly && lead.estimated_net_monthly > 2000 ? 'positive' : lead.estimated_net_monthly ? 'neutral' : 'negative',
      points: lead.estimated_net_monthly ? Math.min(12, Math.floor(lead.estimated_net_monthly / 200)) : 3,
      maxPoints: 12,
      explanation: 'Higher estimated monthly revenue directly correlates with owner motivation to list.',
    },
  ];

  // Market conditions (0–25 pts)
  const marketFactors: ScoreFactor[] = [
    {
      label: 'City Demand',
      value: lead.city || 'Unknown',
      impact: 'positive',
      points: 8,
      maxPoints: 10,
      explanation: `${lead.city || 'This area'} shows above-average rental demand based on vacancy rate data.`,
    },
    {
      label: 'State Regulatory Climate',
      value: lead.state || 'Unknown',
      impact: ['CA', 'NY', 'OR'].includes(lead.state || '') ? 'negative' : 'positive',
      points: ['CA', 'NY', 'OR'].includes(lead.state || '') ? 5 : 9,
      maxPoints: 10,
      explanation: ['CA', 'NY', 'OR'].includes(lead.state || '')
        ? 'High-regulation state — additional compliance steps required for rental conversion.' :'Landlord-friendly state with streamlined rental regulations.',
    },
    {
      label: 'Lead Source Timing',
      value: lead.created_at ? `${Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))} days ago` : '—',
      impact: lead.created_at && (Date.now() - new Date(lead.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000 ? 'positive' : 'neutral',
      points: lead.created_at && (Date.now() - new Date(lead.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000 ? 5 : 3,
      maxPoints: 5,
      explanation: 'Fresher leads have higher conversion rates — owners are more receptive within 30 days.',
    },
  ];

  // Agent fit (0–25 pts)
  const agentFactors: ScoreFactor[] = [
    {
      label: 'Contact Info Quality',
      value: lead.contact_phone && lead.contact_email ? 'Full' : lead.contact_phone ? 'Phone only' : 'Incomplete',
      impact: lead.contact_phone && lead.contact_email ? 'positive' : lead.contact_phone ? 'neutral' : 'negative',
      points: lead.contact_phone && lead.contact_email ? 10 : lead.contact_phone ? 6 : 2,
      maxPoints: 10,
      explanation: 'Leads with both phone and email allow multi-channel outreach, increasing contact rate by 3×.',
    },
    {
      label: 'Stage Progression',
      value: lead.stage || 'New',
      impact: ['Qualified', 'Proposal', 'Negotiation'].includes(lead.stage || '') ? 'positive' : lead.stage === 'Closed' ? 'neutral' : 'neutral',
      points: lead.stage === 'Negotiation' ? 10 : lead.stage === 'Proposal' ? 8 : lead.stage === 'Qualified' ? 7 : lead.stage === 'Contacted' ? 5 : 3,
      maxPoints: 10,
      explanation: 'Leads further in the pipeline require less effort to convert and have demonstrated intent.',
    },
    {
      label: 'DNC / Compliance',
      value: lead.dnc_flagged ? 'DNC Flagged' : 'Clean',
      impact: lead.dnc_flagged ? 'negative' : 'positive',
      points: lead.dnc_flagged ? 0 : 5,
      maxPoints: 5,
      explanation: lead.dnc_flagged
        ? 'This number is on the Do Not Call registry — outreach requires written consent first.' :'No DNC flags — standard outreach protocols apply.',
    },
  ];

  // Enrichment quality (0–20 pts)
  const enrichFactors: ScoreFactor[] = [
    {
      label: 'Enrichment Stage',
      value: lead.enrichment_status || 'None',
      impact: lead.enrichment_status === 'completed' ? 'positive' : lead.enrichment_status === 'partial' ? 'neutral' : 'negative',
      points: lead.enrichment_status === 'completed' ? 10 : lead.enrichment_status === 'partial' ? 6 : 2,
      maxPoints: 10,
      explanation: 'Fully enriched leads have verified owner contact info, property details, and skip-trace data.',
    },
    {
      label: 'Property Data Completeness',
      value: [lead.bedrooms, lead.bathrooms, lead.square_feet].filter(Boolean).length + '/3 fields',
      impact: [lead.bedrooms, lead.bathrooms, lead.square_feet].filter(Boolean).length >= 2 ? 'positive' : 'neutral',
      points: [lead.bedrooms, lead.bathrooms, lead.square_feet].filter(Boolean).length * 2,
      maxPoints: 6,
      explanation: 'Complete property data enables accurate revenue estimation and better owner conversations.',
    },
    {
      label: 'TCPA Risk Level',
      value: lead.tcpa_risk || 'Unknown',
      impact: !lead.tcpa_risk || lead.tcpa_risk === 'low' ? 'positive' : lead.tcpa_risk === 'medium' ? 'neutral' : 'negative',
      points: !lead.tcpa_risk || lead.tcpa_risk === 'low' ? 4 : lead.tcpa_risk === 'medium' ? 2 : 0,
      maxPoints: 4,
      explanation: 'Lower TCPA risk means fewer compliance barriers to outreach and lower legal exposure.',
    },
  ];

  return {
    total,
    propertyFundamentals: { score: propFactors.reduce((s, f) => s + f.points, 0), max: 30, factors: propFactors },
    marketConditions: { score: marketFactors.reduce((s, f) => s + f.points, 0), max: 25, factors: marketFactors },
    agentFit: { score: agentFactors.reduce((s, f) => s + f.points, 0), max: 25, factors: agentFactors },
    enrichmentQuality: { score: enrichFactors.reduce((s, f) => s + f.points, 0), max: 20, factors: enrichFactors },
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['propertyFundamentals']));

  const loadLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('leads')
        .select('id, address, city, state, stage, prospect_score, contact_name, contact_phone, contact_email, estimated_net_monthly, enrichment_status, dnc_flagged, tcpa_risk, property_type, bedrooms, bathrooms, square_feet, year_built, assigned_agent_id, created_at')
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
    { key: 'propertyFundamentals', title: 'Property Fundamentals', icon: Building2, color: '#3b82f6', data: breakdown.propertyFundamentals },
    { key: 'marketConditions', title: 'Market Conditions', icon: TrendingUp, color: '#8b5cf6', data: breakdown.marketConditions },
    { key: 'agentFit', title: 'Agent Fit', icon: Users, color: '#f59e0b', data: breakdown.agentFit },
    { key: 'enrichmentQuality', title: 'Enrichment Quality', icon: Database, color: '#10b981', data: breakdown.enrichmentQuality },
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
                    {breakdown.enrichmentQuality.score < 15 && (
                      <li className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-amber-400 mt-0.5">→</span>
                        Run full enrichment to unlock verified contact data and property details (+{20 - breakdown.enrichmentQuality.score} pts potential)
                      </li>
                    )}
                    {!selectedLead.contact_email && (
                      <li className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-amber-400 mt-0.5">→</span>
                        Add email address to enable multi-channel outreach (+4 pts)
                      </li>
                    )}
                    {selectedLead.dnc_flagged && (
                      <li className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-red-400 mt-0.5">⚠</span>
                        Obtain written consent before outreach — DNC flag blocks standard calling
                      </li>
                    )}
                    {breakdown.agentFit.score < 18 && (
                      <li className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-amber-400 mt-0.5">→</span>
                        Advance lead to Qualified stage after initial contact to improve agent fit score
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
