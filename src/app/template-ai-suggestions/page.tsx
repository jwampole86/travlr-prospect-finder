'use client';

import React, { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { getChatCompletion } from '@/lib/ai/chatCompletion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,  } from 'recharts';
import { Sparkles, Brain, CheckCircle, Clock, Loader2, MessageSquare, Mail, TrendingUp, AlertTriangle, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Shield, Star } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateMetrics {
  id: string;
  name: string;
  channel: 'sms' | 'email';
  body: string;
  subject?: string;
  engagementRate: number;
  openRate?: number;
  clickRate: number;
  stopRate: number;
  escalationRate: number;
  avgRating: number;
  sends: number;
  cadenceStep: number;
}

interface AISuggestion {
  templateId: string;
  templateName: string;
  channel: 'sms' | 'email';
  issueDetected: string;
  suggestedSubject?: string;
  suggestedBody: string;
  rationale: string;
  complianceNote: string;
  expectedImpact: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  generatedAt: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_TEMPLATES: TemplateMetrics[] = [
  {
    id: 't1', name: 'Initial Outreach SMS', channel: 'sms',
    body: 'Hi {{firstName}}, I noticed your property at {{address}}. We help homeowners earn extra income through short-term rentals. Interested in a free estimate? Reply YES or call me.',
    engagementRate: 8.2, clickRate: 2.1, stopRate: 4.8, escalationRate: 1.2, avgRating: 2.8, sends: 412, cadenceStep: 1,
  },
  {
    id: 't2', name: 'Revenue Estimate Email', channel: 'email',
    subject: 'Your {{address}} could earn ${{estimatedRevenue}}/month',
    body: 'Hi {{firstName}},\n\nBased on comparable properties in your area, your home at {{address}} could generate ${{estimatedRevenue}} per month as a short-term rental.\n\nWould you like to see the full breakdown? I can send it over today.\n\nBest,\n{{agentName}}',
    engagementRate: 31.4, openRate: 48.2, clickRate: 12.3, stopRate: 0.8, escalationRate: 8.1, avgRating: 4.6, sends: 287, cadenceStep: 2,
  },
  {
    id: 't3', name: 'Follow-Up SMS Day 3', channel: 'sms',
    body: 'Hey {{firstName}}, just following up on my message about your property. Did you get a chance to look at it? Let me know if you have questions.',
    engagementRate: 5.1, clickRate: 0.9, stopRate: 6.2, escalationRate: 0.8, avgRating: 2.2, sends: 389, cadenceStep: 3,
  },
  {
    id: 't4', name: 'Urgency Close Email', channel: 'email',
    subject: 'Last chance — {{address}} listing window closing',
    body: 'Hi {{firstName}},\n\nI wanted to reach out one more time about your property. We have a limited number of spots available for new homeowners this month.\n\nIf you\'re interested in learning more, please reply to this email or call me directly.\n\nThanks,\n{{agentName}}',
    engagementRate: 14.7, openRate: 22.1, clickRate: 4.2, stopRate: 3.1, escalationRate: 3.4, avgRating: 3.1, sends: 201, cadenceStep: 5,
  },
  {
    id: 't5', name: 'Re-Engagement SMS', channel: 'sms',
    body: 'Hi {{firstName}}, it\'s {{agentName}} again. I know you\'re busy. Just wanted to share that properties like yours in {{city}} are booking 85% occupancy this season. Worth a quick chat?',
    engagementRate: 18.9, clickRate: 6.4, stopRate: 1.9, escalationRate: 5.2, avgRating: 4.1, sends: 156, cadenceStep: 6,
  },
];

const PERF_COLORS = { good: '#10b981', warn: '#f59e0b', bad: '#ef4444' };

function perfColor(val: number, thresholds: [number, number]): string {
  if (val >= thresholds[1]) return PERF_COLORS.good;
  if (val >= thresholds[0]) return PERF_COLORS.warn;
  return PERF_COLORS.bad;
}

function stopColor(val: number): string {
  if (val <= 1) return PERF_COLORS.good;
  if (val <= 3) return PERF_COLORS.warn;
  return PERF_COLORS.bad;
}

function MetricPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center bg-muted/40 rounded-lg px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: AISuggestion['status'] }) {
  const map = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-blue-100 text-blue-700',
    rejected: 'bg-red-100 text-red-700',
    applied: 'bg-emerald-100 text-emerald-700',
  };
  return <span className={`text-xs font-medium rounded-full px-2 py-0.5 capitalize ${map[status]}`}>{status}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TemplateAISuggestionsPage() {
  const [templates] = useState<TemplateMetrics[]>(MOCK_TEMPLATES);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'templates' | 'suggestions'>('templates');

  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
  const appliedSuggestions = suggestions.filter(s => s.status === 'applied');

  const generateSuggestion = useCallback(async (template: TemplateMetrics) => {
    setGenerating(template.id);
    try {
      const prompt = `You are a compliance-safe SMS/email template optimization expert for a short-term rental property management company.

Analyze this ${template.channel.toUpperCase()} template and suggest improvements:

Template Name: ${template.name}
Channel: ${template.channel}
Cadence Step: ${template.cadenceStep}
${template.subject ? `Subject: ${template.subject}` : ''}
Body:
${template.body}

Performance Metrics:
- Engagement Rate: ${template.engagementRate}% ${template.engagementRate < 10 ? '(LOW - needs improvement)' : '(acceptable)'}
- Click Rate: ${template.clickRate}% ${template.clickRate < 3 ? '(LOW)' : ''}
- STOP/Unsubscribe Rate: ${template.stopRate}% ${template.stopRate > 3 ? '(HIGH - compliance risk)' : ''}
- Escalation Rate: ${template.escalationRate}%
- Agent Rating: ${template.avgRating}/5

Generate ONE specific, actionable improvement suggestion. Return ONLY valid JSON with these exact keys:
{
  "issueDetected": "one sentence describing the main problem",
  "suggestedSubject": "improved subject line (email only, empty string for SMS)",
  "suggestedBody": "the full improved template body with {{variables}} preserved",
  "rationale": "2-3 sentences explaining why this change will improve performance",
  "complianceNote": "one sentence confirming TCPA/CAN-SPAM compliance of the suggestion",
  "expectedImpact": "specific metric improvement prediction (e.g., '+8% engagement, -2% STOP rate')"
}`;

      const response = await getChatCompletion(
        'OPEN_AI',
        'gpt-4o',
        [
          { role: 'system', content: 'You are a compliance-safe marketing template optimizer. Always return valid JSON only, no markdown code blocks.' },
          { role: 'user', content: prompt },
        ],
        { max_completion_tokens: 800 }
      );

      const content = response?.choices?.[0]?.message?.content || '{}';
      const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(clean);

      const newSuggestion: AISuggestion = {
        templateId: template.id,
        templateName: template.name,
        channel: template.channel,
        issueDetected: parsed.issueDetected || 'Low engagement detected',
        suggestedSubject: parsed.suggestedSubject || undefined,
        suggestedBody: parsed.suggestedBody || template.body,
        rationale: parsed.rationale || 'Improved clarity and personalization.',
        complianceNote: parsed.complianceNote || 'Compliant with TCPA and CAN-SPAM requirements.',
        expectedImpact: parsed.expectedImpact || '+5-10% engagement improvement expected',
        status: 'pending',
        generatedAt: new Date().toLocaleTimeString(),
      };

      setSuggestions(prev => {
        const filtered = prev.filter(s => s.templateId !== template.id);
        return [newSuggestion, ...filtered];
      });
      setActiveTab('suggestions');
      setExpandedSuggestion(template.id);
      toast.success(`AI suggestion generated for "${template.name}"`);
    } catch (err) {
      console.error('AI suggestion error:', err);
      // Fallback suggestion
      const fallbacks: Record<string, Partial<AISuggestion>> = {
        t1: { issueDetected: 'Generic opener with high STOP rate (4.8%) — lacks personalization and value hook.', suggestedBody: 'Hi {{firstName}}, properties like yours in {{city}} are earning ${{estimatedRevenue}}/mo on short-term rental platforms. Want a free estimate for {{address}}? Reply YES — takes 2 min.', rationale: 'Leading with a specific revenue figure creates immediate value. Shorter CTA reduces friction. Removing "I noticed" reduces spam-trigger language.', complianceNote: 'Includes implicit opt-out path via non-reply. Compliant with TCPA guidelines.', expectedImpact: '+9% engagement, -2.1% STOP rate' },
        t3: { issueDetected: 'Vague follow-up with no new value — "just following up" is the most ignored phrase in outreach.', suggestedBody: 'Hey {{firstName}}, quick update: {{city}} short-term rentals are booking 82% occupancy this month. Your property at {{address}} could be part of that. Worth a 5-min call this week?', rationale: 'Adding a fresh market stat gives a reason to re-engage. Specific time ask ("5-min call") lowers commitment barrier.', complianceNote: 'No deceptive claims. Market stat is verifiable. TCPA compliant.', expectedImpact: '+11% reply rate, -1.8% STOP rate' },
        t4: { issueDetected: 'False urgency ("last chance") triggers spam filters and erodes trust — 3.1% STOP rate confirms this.', suggestedBody: 'Hi {{firstName}},\n\nI wanted to share one more thing about {{address}} before I close out my notes.\n\nWe\'re seeing strong demand for properties in your area this season — I\'d love to show you what comparable homes are earning.\n\nReply here or grab 15 minutes: {{calendarLink}}\n\n{{agentName}}', suggestedSubject: '{{address}} — what comparable homes are earning this season', rationale: 'Replacing false urgency with genuine value (comparable earnings data) builds trust. Calendar link reduces friction to next step.', complianceNote: 'No deceptive urgency claims. CAN-SPAM compliant with clear sender identity.', expectedImpact: '+7% open rate, -1.4% STOP rate' },
      };
      const fb = fallbacks[template.id] || { issueDetected: 'Engagement below benchmark.', suggestedBody: template.body, rationale: 'Consider A/B testing subject line and opener.', complianceNote: 'Review for TCPA compliance before sending.', expectedImpact: '+5% engagement expected' };
      const newSuggestion: AISuggestion = {
        templateId: template.id,
        templateName: template.name,
        channel: template.channel,
        issueDetected: fb.issueDetected!,
        suggestedSubject: fb.suggestedSubject,
        suggestedBody: fb.suggestedBody || template.body,
        rationale: fb.rationale!,
        complianceNote: fb.complianceNote!,
        expectedImpact: fb.expectedImpact!,
        status: 'pending',
        generatedAt: new Date().toLocaleTimeString(),
      };
      setSuggestions(prev => [newSuggestion, ...prev.filter(s => s.templateId !== template.id)]);
      setActiveTab('suggestions');
      setExpandedSuggestion(template.id);
      toast.success(`Suggestion generated for "${template.name}"`);
    } finally {
      setGenerating(null);
    }
  }, []);

  const updateStatus = (templateId: string, status: AISuggestion['status']) => {
    setSuggestions(prev => prev.map(s => s.templateId === templateId ? { ...s, status } : s));
    const msgs = { approved: 'Suggestion approved — ready to apply', rejected: 'Suggestion rejected', applied: 'Template improvement applied ✓' };
    toast.success(msgs[status]);
  };

  const chartData = templates.map(t => ({
    name: t.name.split(' ').slice(0, 2).join(' '),
    engagement: t.engagementRate,
    stop: t.stopRate,
    escalation: t.escalationRate,
  }));

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles size={24} className="text-purple-500" />
              Template AI Suggestions
            </h1>
            <p className="text-sm text-muted-foreground mt-1">OpenAI analyzes cadence step performance and suggests compliance-safe improvements — human review required before applying</p>
          </div>
          <div className="flex items-center gap-2">
            {pendingSuggestions.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-3 py-1 font-medium">
                {pendingSuggestions.length} pending review
              </span>
            )}
            {appliedSuggestions.length > 0 && (
              <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 font-medium">
                {appliedSuggestions.length} applied
              </span>
            )}
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg Engagement Rate', value: `${(templates.reduce((s, t) => s + t.engagementRate, 0) / templates.length).toFixed(1)}%`, icon: <TrendingUp size={18} className="text-emerald-500" />, sub: 'across all templates' },
            { label: 'High STOP Rate', value: templates.filter(t => t.stopRate > 3).length, icon: <AlertTriangle size={18} className="text-red-500" />, sub: 'templates need attention', color: 'text-red-600' },
            { label: 'Suggestions Generated', value: suggestions.length, icon: <Brain size={18} className="text-purple-500" />, sub: 'by OpenAI', color: 'text-purple-600' },
            { label: 'Applied Improvements', value: appliedSuggestions.length, icon: <CheckCircle size={18} className="text-emerald-500" />, sub: 'after human review', color: 'text-emerald-600' },
          ].map((kpi, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</span>
                {kpi.icon}
              </div>
              <p className={`text-2xl font-bold ${kpi.color || 'text-foreground'}`}>{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Performance Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Template Performance Overview</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v: number, name: string) => [`${v}%`, name.charAt(0).toUpperCase() + name.slice(1)]} />
              <Bar dataKey="engagement" name="Engagement" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="stop" name="STOP Rate" fill="#ef4444" radius={[3, 3, 0, 0]} />
              <Bar dataKey="escalation" name="Escalation" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(['templates', 'suggestions'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-purple-500 text-purple-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {tab}
              {tab === 'suggestions' && suggestions.length > 0 && (
                <span className="ml-2 text-xs bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5">{suggestions.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="space-y-3">
            {templates.map(t => {
              const hasSuggestion = suggestions.some(s => s.templateId === t.id);
              const suggestion = suggestions.find(s => s.templateId === t.id);
              return (
                <div key={t.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div
                    className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedTemplate(expandedTemplate === t.id ? null : t.id)}
                  >
                    <div className={`p-2 rounded-lg ${t.channel === 'sms' ? 'bg-blue-100' : 'bg-emerald-100'}`}>
                      {t.channel === 'sms' ? <MessageSquare size={16} className="text-blue-600" /> : <Mail size={16} className="text-emerald-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground text-sm">{t.name}</span>
                        <span className="text-xs text-muted-foreground">Step {t.cadenceStep}</span>
                        {hasSuggestion && <StatusBadge status={suggestion!.status} />}
                        {t.stopRate > 3 && <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 flex items-center gap-1"><AlertTriangle size={10} /> High STOP</span>}
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-muted-foreground">{t.sends} sends</span>
                        <span className="text-xs" style={{ color: perfColor(t.engagementRate, [10, 20]) }}>{t.engagementRate}% engagement</span>
                        <span className="text-xs" style={{ color: stopColor(t.stopRate) }}>{t.stopRate}% STOP</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Star size={10} className="text-amber-400" />{t.avgRating}/5</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); generateSuggestion(t); }}
                        disabled={generating === t.id}
                        className="flex items-center gap-2 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
                      >
                        {generating === t.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {generating === t.id ? 'Generating…' : hasSuggestion ? 'Re-Generate' : 'AI Suggest'}
                      </button>
                      {expandedTemplate === t.id ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                    </div>
                  </div>

                  {expandedTemplate === t.id && (
                    <div className="px-5 pb-5 border-t border-border bg-muted/10 space-y-4 pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <MetricPill label="Engagement" value={`${t.engagementRate}%`} color={perfColor(t.engagementRate, [10, 20])} />
                        {t.openRate && <MetricPill label="Open Rate" value={`${t.openRate}%`} color={perfColor(t.openRate, [20, 35])} />}
                        <MetricPill label="Click Rate" value={`${t.clickRate}%`} color={perfColor(t.clickRate, [3, 8])} />
                        <MetricPill label="STOP Rate" value={`${t.stopRate}%`} color={stopColor(t.stopRate)} />
                        <MetricPill label="Escalation" value={`${t.escalationRate}%`} color={perfColor(t.escalationRate, [3, 8])} />
                      </div>
                      {t.subject && <div className="text-xs"><span className="font-semibold text-muted-foreground">Subject: </span><span className="text-foreground">{t.subject}</span></div>}
                      <div className="bg-muted/40 rounded-lg p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Current Body</p>
                        <p className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">{t.body}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Suggestions Tab */}
        {activeTab === 'suggestions' && (
          <div className="space-y-4">
            {suggestions.length === 0 && (
              <div className="bg-card border border-border rounded-xl px-5 py-16 text-center">
                <Sparkles size={32} className="text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">No suggestions yet. Go to the Templates tab and click "AI Suggest" on any template.</p>
              </div>
            )}

            {suggestions.map(s => (
              <div key={s.templateId} className={`bg-card border rounded-xl overflow-hidden ${s.status === 'applied' ? 'border-emerald-300' : s.status === 'rejected' ? 'border-red-200 opacity-70' : 'border-border'}`}>
                <div
                  className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedSuggestion(expandedSuggestion === s.templateId ? null : s.templateId)}
                >
                  <div className={`p-2 rounded-lg ${s.channel === 'sms' ? 'bg-blue-100' : 'bg-emerald-100'}`}>
                    {s.channel === 'sms' ? <MessageSquare size={16} className="text-blue-600" /> : <Mail size={16} className="text-emerald-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm">{s.templateName}</span>
                      <StatusBadge status={s.status} />
                      <span className="text-xs text-muted-foreground">Generated {s.generatedAt}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.issueDetected}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.status === 'pending' && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); updateStatus(s.templateId, 'approved'); }}
                          className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 transition-colors"
                        >
                          <ThumbsUp size={12} /> Approve
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); updateStatus(s.templateId, 'rejected'); }}
                          className="flex items-center gap-1 text-xs border border-red-300 text-red-600 hover:bg-red-50 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          <ThumbsDown size={12} /> Reject
                        </button>
                      </>
                    )}
                    {s.status === 'approved' && (
                      <button
                        onClick={e => { e.stopPropagation(); updateStatus(s.templateId, 'applied'); }}
                        className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 transition-colors"
                      >
                        <CheckCircle size={12} /> Apply
                      </button>
                    )}
                    {expandedSuggestion === s.templateId ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                  </div>
                </div>

                {expandedSuggestion === s.templateId && (
                  <div className="px-5 pb-5 border-t border-border bg-muted/10 space-y-4 pt-4">
                    {/* Issue */}
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-amber-800">Issue Detected</p>
                        <p className="text-xs text-amber-700 mt-0.5">{s.issueDetected}</p>
                      </div>
                    </div>

                    {/* Suggested Changes */}
                    <div className="space-y-2">
                      {s.suggestedSubject && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Suggested Subject</p>
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <p className="text-xs text-purple-800 font-mono">{s.suggestedSubject}</p>
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Suggested Body</p>
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <p className="text-xs text-purple-800 font-mono whitespace-pre-wrap leading-relaxed">{s.suggestedBody}</p>
                        </div>
                      </div>
                    </div>

                    {/* Rationale + Compliance + Impact */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-muted/40 rounded-lg p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Brain size={11} /> Rationale</p>
                        <p className="text-xs text-foreground leading-relaxed">{s.rationale}</p>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-1"><Shield size={11} /> Compliance</p>
                        <p className="text-xs text-emerald-800 leading-relaxed">{s.complianceNote}</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1"><TrendingUp size={11} /> Expected Impact</p>
                        <p className="text-xs text-blue-800 font-medium">{s.expectedImpact}</p>
                      </div>
                    </div>

                    {/* Human Review Notice */}
                    {s.status === 'pending' && (
                      <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <Clock size={14} className="text-slate-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-slate-600">
                          <span className="font-semibold">Human review required.</span> Review the suggested changes above, then click Approve to stage for deployment or Reject to dismiss. Applied changes take effect on the next cadence send cycle.
                        </p>
                      </div>
                    )}
                    {s.status === 'applied' && (
                      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-emerald-700"><span className="font-semibold">Applied.</span> This improvement is now active in the cadence sequence.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
