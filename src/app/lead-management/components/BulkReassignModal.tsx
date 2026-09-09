'use client';

import React, { useState, useEffect } from 'react';
import { X, Users, MapPin, Search, Check, Loader2, UserCheck, Brain, Sparkles, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getChatCompletion } from '@/lib/ai/chatCompletion';
import { toast } from 'sonner';

interface Agent {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_initials: string;
  territories?: { id: string; name: string }[];
}

interface Territory {
  id: string;
  name: string;
  states: string[];
  description: string;
  color: string;
}

interface AIRecommendation {
  agentId: string;
  agentName: string;
  confidenceScore: number;
  reasoning: string;
  strengths: string[];
}

interface BulkReassignModalProps {
  selectedCount: number;
  selectedIds: string[];
  onClose: () => void;
  onReassigned: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-500/15 text-purple-400',
  manager: 'bg-blue-500/15 text-blue-400',
  agent: 'bg-emerald-500/15 text-emerald-400',
  viewer: 'bg-slate-500/15 text-slate-400',
};

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[10px] font-bold tabular-nums ${score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
        {score}%
      </span>
    </div>
  );
}

export default function BulkReassignModal({
  selectedCount,
  selectedIds,
  onClose,
  onReassigned,
}: BulkReassignModalProps) {
  const { user } = useAuth();
  const supabase = createClient();

  const [tab, setTab] = useState<'agent' | 'territory'>('agent');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // AI Recommendations state
  const [aiRecs, setAiRecs] = useState<AIRecommendation[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [leadContext, setLeadContext] = useState<{ property_type?: string; city?: string; state?: string; score?: number }[]>([]);

  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);
      try {
        const [agentsRes, territoriesRes, leadsRes] = await Promise.all([
          supabase
            .from('agent_profiles')
            .select('id, full_name, email, role, avatar_initials')
            .eq('owner_user_id', user.id)
            .eq('status', 'active')
            .order('full_name'),
          supabase
            .from('territories')
            .select('id, name, states, description, color')
            .eq('owner_user_id', user.id)
            .order('name'),
          supabase
            .from('leads')
            .select('property_type, city, state, score')
            .in('id', selectedIds.slice(0, 10)),
        ]);
        setAgents((agentsRes.data as Agent[]) ?? []);
        setTerritories((territoriesRes.data as Territory[]) ?? []);
        setLeadContext((leadsRes.data as { property_type?: string; city?: string; state?: string; score?: number }[]) ?? []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, supabase, selectedIds]);

  async function fetchAIRecommendations() {
    if (agents.length === 0) {
      toast.error('No agents available to analyze');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiExpanded(true);

    try {
      const leadSummary = leadContext.length > 0
        ? leadContext.map((l) => `${l.property_type ?? 'unknown type'} in ${l.city ?? '?'}, ${l.state ?? '?'} (score: ${l.score ?? 'N/A'})`).join('; ')
        : `${selectedCount} leads selected`;

      const agentList = agents.map((a) => `- ${a.full_name} (${a.role})`).join('\n');

      const messages = [
        {
          role: 'system',
          content: `You are an expert real estate lead assignment analyst. Analyze agent performance patterns and lead attributes to recommend the optimal agent assignments. Always respond with valid JSON only.`,
        },
        {
          role: 'user',
          content: `I need to bulk reassign ${selectedCount} leads to an agent. 

Lead attributes: ${leadSummary}

Available agents:
${agentList}

Based on typical agent performance patterns (conversion rates, specialization, capacity, geographic coverage), recommend the TOP 3 best agents for these leads.

Respond with ONLY this JSON structure (no markdown, no explanation):
{
  "recommendations": [
    {
      "agentName": "Full Name",
      "confidenceScore": 85,
      "reasoning": "One sentence explaining why this agent is a strong fit",
      "strengths": ["strength 1", "strength 2"]
    }
  ]
}`,
        },
      ];

      const result = await getChatCompletion('ANTHROPIC', 'claude-sonnet-4-6', messages, {
        max_tokens: 600,
        temperature: 0.3,
      });

      const content = result?.choices?.[0]?.message?.content ?? '';
      let parsed: { recommendations: { agentName: string; confidenceScore: number; reasoning: string; strengths: string[] }[] };

      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          throw new Error('Could not parse AI response');
        }
      }

      const recs: AIRecommendation[] = (parsed.recommendations ?? []).slice(0, 3).map((r) => {
        const matchedAgent = agents.find(
          (a) => a.full_name.toLowerCase().includes(r.agentName.toLowerCase()) ||
                 r.agentName.toLowerCase().includes(a.full_name.toLowerCase().split(' ')[0])
        );
        return {
          agentId: matchedAgent?.id ?? '',
          agentName: r.agentName,
          confidenceScore: Math.min(99, Math.max(1, r.confidenceScore)),
          reasoning: r.reasoning,
          strengths: r.strengths ?? [],
        };
      });

      setAiRecs(recs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI analysis failed';
      setAiError(msg);
      toast.error('AI recommendation failed: ' + msg);
    } finally {
      setAiLoading(false);
    }
  }

  const filteredAgents = agents.filter(
    (a) =>
      a.full_name.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTerritories = territories.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleReassign() {
    if (tab === 'agent' && !selectedAgentId) {
      toast.error('Please select an agent');
      return;
    }
    if (tab === 'territory' && !selectedTerritoryId) {
      toast.error('Please select a territory');
      return;
    }
    setSaving(true);
    try {
      if (tab === 'agent' && selectedAgentId) {
        const agent = agents.find((a) => a.id === selectedAgentId);

        // Use the new assign-agent API which handles notifications + DB update
        const res = await fetch('/api/leads/assign-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadIds: selectedIds,
            agentId: selectedAgentId,
            agentName: agent?.full_name ?? '',
            agentEmail: agent?.email ?? '',
            assignedBy: user?.id,
            assignedByName: user?.user_metadata?.full_name || user?.email || 'Admin',
          }),
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Assignment failed');

        // Also update agent_lead_permissions for backward compat
        const rows = selectedIds.map((leadId) => ({
          agent_id: selectedAgentId,
          surplus_lead_id: leadId,
          can_view: true,
          can_edit: false,
          can_contact: true,
          can_close: false,
          owner_user_id: user?.id,
          assigned_at: new Date().toISOString(),
          note: note.trim() || null,
        }));
        await supabase.from('agent_lead_permissions').delete().in('surplus_lead_id', selectedIds);
        await supabase.from('agent_lead_permissions').insert(rows);

        const notifMsg = json.emailSent
          ? ` · Email sent to ${agent?.full_name}`
          : '';
        toast.success(`${selectedCount} lead${selectedCount !== 1 ? 's' : ''} assigned to ${agent?.full_name ?? 'agent'}${notifMsg}`);
      } else if (tab === 'territory' && selectedTerritoryId) {
        const territory = territories.find((t) => t.id === selectedTerritoryId);
        for (const leadId of selectedIds) {
          await supabase
            .from('leads')
            .update({ territory_id: selectedTerritoryId })
            .eq('id', leadId);
        }
        toast.success(`${selectedCount} lead${selectedCount !== 1 ? 's' : ''} moved to territory "${territory?.name ?? ''}"`);
      }
      onReassigned();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Reassignment failed');
    } finally {
      setSaving(false);
    }
  }

  const canConfirm = tab === 'agent' ? !!selectedAgentId : !!selectedTerritoryId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Bulk Reassign</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reassigning <span className="font-semibold text-foreground">{selectedCount}</span> selected lead{selectedCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          <button
            onClick={() => { setTab('agent'); setSearch(''); }}
            className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-all ${
              tab === 'agent' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users size={13} />
            Assign to Agent
          </button>
          <button
            onClick={() => { setTab('territory'); setSearch(''); }}
            className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-all ${
              tab === 'territory' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <MapPin size={13} />
            Move to Territory
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* AI Recommendations Panel (Agent tab only) */}
          {tab === 'agent' && (
            <div className="mx-6 mt-4 border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => {
                  if (!aiExpanded && aiRecs.length === 0 && !aiLoading) {
                    fetchAIRecommendations();
                  } else {
                    setAiExpanded(!aiExpanded);
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-primary/5 hover:bg-primary/8 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Brain size={14} className="text-primary" />
                  <span className="text-xs font-semibold text-primary">AI Agent Recommendations</span>
                  {aiRecs.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                      Top {aiRecs.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {aiLoading && <Loader2 size={12} className="animate-spin text-primary" />}
                  {!aiLoading && aiRecs.length === 0 && (
                    <span className="text-[10px] text-primary/70">Analyze leads</span>
                  )}
                  {aiExpanded ? <ChevronUp size={13} className="text-primary" /> : <ChevronDown size={13} className="text-primary" />}
                </div>
              </button>

              {aiExpanded && (
                <div className="border-t border-border">
                  {aiLoading ? (
                    <div className="flex items-center gap-3 px-4 py-5">
                      <Loader2 size={16} className="animate-spin text-primary shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-foreground">Analyzing lead attributes & agent patterns…</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Anthropic is evaluating {agents.length} agents</p>
                      </div>
                    </div>
                  ) : aiError ? (
                    <div className="flex items-center gap-2 px-4 py-4">
                      <AlertCircle size={14} className="text-rose-500 shrink-0" />
                      <p className="text-xs text-muted-foreground">{aiError}</p>
                      <button onClick={fetchAIRecommendations} className="ml-auto text-xs text-primary hover:underline shrink-0">Retry</button>
                    </div>
                  ) : aiRecs.length === 0 ? (
                    <div className="px-4 py-4 text-center">
                      <Sparkles size={20} className="text-muted-foreground mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Click above to analyze lead attributes and get top 3 agent recommendations with confidence scores.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {aiRecs.map((rec, i) => {
                        const matchedAgent = agents.find((a) => a.id === rec.agentId);
                        const isSelected = matchedAgent && selectedAgentId === matchedAgent.id;
                        return (
                          <div
                            key={i}
                            className={`px-4 py-3 cursor-pointer transition-all hover:bg-muted/30 ${isSelected ? 'bg-primary/5' : ''}`}
                            onClick={() => matchedAgent && setSelectedAgentId(matchedAgent.id)}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">
                                {i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-xs font-semibold text-foreground">{rec.agentName}</p>
                                  {isSelected && <Check size={11} className="text-primary" />}
                                </div>
                                <ConfidenceBar score={rec.confidenceScore} />
                                <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">{rec.reasoning}</p>
                                {rec.strengths.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {rec.strengths.map((s, si) => (
                                      <span key={si} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/8 text-primary/80">{s}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="px-4 py-2 bg-muted/20">
                        <button onClick={fetchAIRecommendations} className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
                          ↻ Re-analyze
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <div className="px-6 pt-4">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === 'agent' ? 'Search agents…' : 'Search territories…'}
                className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* List */}
          <div className="px-6 py-3 space-y-1.5 min-h-[160px]">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
            ) : tab === 'agent' ? (
              filteredAgents.length === 0 ? (
                <div className="text-center py-10">
                  <Users size={24} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {agents.length === 0 ? 'No active agents found. Add agents in the Agents page.' : 'No agents match your search.'}
                  </p>
                </div>
              ) : (
                filteredAgents.map((agent) => {
                  const rec = aiRecs.find((r) => r.agentId === agent.id);
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-all text-left ${
                        selectedAgentId === agent.id
                          ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {agent.avatar_initials || agent.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-foreground truncate">{agent.full_name}</p>
                          {rec && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0">
                              AI #{aiRecs.indexOf(rec) + 1}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                        {rec && <ConfidenceBar score={rec.confidenceScore} />}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_COLORS[agent.role] ?? ROLE_COLORS.viewer}`}>
                        {agent.role}
                      </span>
                      {selectedAgentId === agent.id && (
                        <Check size={15} className="text-primary shrink-0" />
                      )}
                    </button>
                  );
                })
              )
            ) : (
              filteredTerritories.length === 0 ? (
                <div className="text-center py-10">
                  <MapPin size={24} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {territories.length === 0 ? 'No territories found. Add territories in the Agents page.' : 'No territories match your search.'}
                  </p>
                </div>
              ) : (
                filteredTerritories.map((territory) => (
                  <button
                    key={territory.id}
                    onClick={() => setSelectedTerritoryId(territory.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-all text-left ${
                      selectedTerritoryId === territory.id
                        ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: territory.color ? `${territory.color}20` : '#6366f120' }}
                    >
                      <MapPin size={14} style={{ color: territory.color ?? '#6366f1' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{territory.name}</p>
                      {territory.states?.length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">{territory.states.join(', ')}</p>
                      )}
                    </div>
                    {selectedTerritoryId === territory.id && (
                      <Check size={15} className="text-primary shrink-0" />
                    )}
                  </button>
                ))
              )
            )}
          </div>
        </div>

        {/* Note */}
        <div className="px-6 pb-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for this reassignment…"
            rows={2}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleReassign}
            disabled={!canConfirm || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
            {saving ? 'Assigning…' : `Assign ${selectedCount} Lead${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
