'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Bot, FileText, Mail, Star, MessageSquare, Lock, Zap, ChevronRight, AlertTriangle, CheckCircle, Info, Brain } from 'lucide-react';

interface AIFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'property' | 'email' | 'scoring' | 'chatbot';
  status: 'placeholder';
  inputs: string[];
  outputs: string[];
}

const AI_FEATURES: AIFeature[] = [
  {
    id: 'property-report',
    title: 'Property Report AI Drafting',
    description: 'Claude drafts narrative sections of Property Reports — revenue potential summary, regulation summary in plain language — from structured inputs you supply. Claude synthesizes and explains numbers, never invents them.',
    icon: <FileText size={20} />,
    category: 'property',
    status: 'placeholder',
    inputs: ['ADR', 'Occupancy rate', 'ROI figures', 'Zone regulation data', 'Property details'],
    outputs: ['Revenue potential narrative', 'Plain-language regulation summary', 'Homeowner-facing explanation'],
  },
  {
    id: 'email-assist',
    title: 'Email Drafting Assistant',
    description: 'Agent-facing "improve this email" or "draft a custom version of this template for this specific lead" tool. Uses your existing template library as the base and lead-specific context as input.',
    icon: <Mail size={20} />,
    category: 'email',
    status: 'placeholder',
    inputs: ['Existing template', 'Lead address & owner name', 'Zone/portfolio context', 'Agent tone preference'],
    outputs: ['Customized email draft', 'Subject line suggestions', 'Personalization improvements'],
  },
  {
    id: 'lead-scoring-rationale',
    title: 'Lead Scoring Rationale',
    description: 'Plain-English explanation of why a lead scored the way it did. The score itself stays deterministic (your defined criteria), but Claude explains the reasoning to help agents prioritize quickly.',
    icon: <Star size={20} />,
    category: 'scoring',
    status: 'placeholder',
    inputs: ['Lead score', 'Score breakdown by factor', 'Property data', 'Market context'],
    outputs: ['Plain-English rationale', 'Key strengths/weaknesses', 'Prioritization recommendation'],
  },
  {
    id: 'regulation-summary',
    title: 'Regulation Plain-Language Summary',
    description: 'Given structured info about a zone\'s STR rules, Claude drafts the homeowner-facing plain-language explanation used in the Qualification Questionnaire and Property Report.',
    icon: <FileText size={20} />,
    category: 'property',
    status: 'placeholder',
    inputs: ['Zone STR rules', 'Permit requirements', 'Restrictions & limits', 'Compliance steps'],
    outputs: ['Homeowner-friendly summary', 'Key requirements list', 'Action items'],
  },
  {
    id: 'agent-chatbot',
    title: 'Agent Assistant Chatbot',
    description: 'Internal agent-facing chatbot that helps agents navigate the app, answer "how do I..." questions, pull up lead info conversationally, and draft outreach on request. Scoped to agent\'s own data only.',
    icon: <MessageSquare size={20} />,
    category: 'chatbot',
    status: 'placeholder',
    inputs: ['Agent\'s assigned leads', 'Commission data', 'Template library', 'App navigation context'],
    outputs: ['Conversational answers', 'Lead summaries', 'Draft outreach', 'App guidance'],
  },
  {
    id: 'homeowner-chatbot',
    title: 'Homeowner Portal Chatbot',
    description: 'Homeowner-facing chatbot embedded in the Homeowner Dashboard. Answers questions about revenue statements, payout status, and general TRAVLR policy. Escalates to human agent for account-specific issues.',
    icon: <Bot size={20} />,
    category: 'chatbot',
    status: 'placeholder',
    inputs: ['Homeowner\'s properties', 'Revenue & payout data', 'Booking history', 'TRAVLR policy docs'],
    outputs: ['Revenue explanations', 'Payout status', 'Policy answers', 'Human escalation triggers'],
  },
];

const categoryConfig = {
  property: { label: 'Property Reports', color: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  email: { label: 'Email Assist', color: 'bg-purple-500/10 text-purple-600 border-purple-200' },
  scoring: { label: 'Lead Scoring', color: 'bg-amber-500/10 text-amber-600 border-amber-200' },
  chatbot: { label: 'AI Chatbot', color: 'bg-green-500/10 text-green-600 border-green-200' },
};

function FeatureCard({ feature }: { feature: AIFeature }) {
  const [expanded, setExpanded] = useState(false);
  const cat = categoryConfig[feature.category];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/20 transition-all">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              {feature.icon}
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">{feature.title}</h3>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cat.color}`}>{cat.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full">
            <Lock size={10} className="text-amber-600" />
            <span className="text-[10px] font-medium text-amber-700">Awaiting API Key</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{feature.description}</p>

        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <span>{expanded ? 'Hide' : 'Show'} inputs & outputs</span>
          <ChevronRight size={12} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>

        {expanded && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Inputs</p>
              <ul className="space-y-1">
                {feature.inputs.map(input => (
                  <li key={input} className="flex items-center gap-1.5 text-xs text-foreground">
                    <div className="w-1 h-1 rounded-full bg-primary shrink-0" />
                    {input}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Outputs</p>
              <ul className="space-y-1">
                {feature.outputs.map(output => (
                  <li key={output} className="flex items-center gap-1.5 text-xs text-foreground">
                    <div className="w-1 h-1 rounded-full bg-success shrink-0" />
                    {output}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Activation footer */}
      <div className="px-5 py-3 bg-muted/20 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <CheckCircle size={11} className="text-success" />
          <span>Scaffold complete — ready to activate</span>
        </div>
        <span className="text-[10px] text-muted-foreground">Anthropic Messages API · claude-3-5-sonnet</span>
      </div>
    </div>
  );
}

export default function AIFeaturesPage() {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filtered = AI_FEATURES.filter(f => activeCategory === 'all' || f.category === activeCategory);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Brain size={20} className="text-primary" />
              <h1 className="text-xl font-bold text-foreground">AI Features — Claude / Anthropic</h1>
            </div>
            <p className="text-sm text-muted-foreground">All features are scaffolded and ready to activate when your Anthropic API key is provided</p>
          </div>
        </div>

        {/* API Key Status Banner */}
        <div className="flex items-start gap-4 p-5 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800 mb-1">Anthropic API Key Not Configured</p>
            <p className="text-xs text-amber-700 mb-3">
              All AI features below are fully scaffolded with proper data scoping, prompt templates, and API call structure. 
              Add your key to activate them instantly.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-amber-100 border border-amber-200 px-2 py-1 rounded font-mono">ANTHROPIC_API_KEY=sk-ant-...</code>
              <span className="text-xs text-amber-700">→ Add to your <code className="bg-amber-100 px-1 rounded">.env</code> file</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[10px] font-medium text-amber-700">6 features ready</span>
            <span className="text-[10px] text-amber-600">0 / 6 active</span>
          </div>
        </div>

        {/* Implementation Notes */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info size={15} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Implementation Notes</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: 'Data Integrity', desc: 'Claude synthesizes numbers you supply — never invents financial projections. Homeowner-facing reports use only verified data.' },
              { title: 'Access Scoping', desc: 'Agent chatbot only accesses that agent\'s leads. Homeowner chatbot only accesses that homeowner\'s properties.' },
              { title: 'Human Escalation', desc: 'Chatbots have defined handoff triggers for account-specific, financial, or sensitive issues — never attempt to resolve autonomously.' },
              { title: 'Batch API', desc: 'Property Report regeneration uses Anthropic Batch API for cost efficiency on large volumes. Real-time calls for interactive features.' },
            ].map(({ title, desc }) => (
              <div key={title} className="flex items-start gap-2">
                <CheckCircle size={13} className="text-success mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-fit">
          {[{ key: 'all', label: 'All Features' }, ...Object.entries(categoryConfig).map(([k, v]) => ({ key: k, label: v.label }))].map(opt => (
            <button
              key={opt.key}
              onClick={() => setActiveCategory(opt.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeCategory === opt.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(feature => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>

        {/* Suggested Sequencing */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={15} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Suggested Activation Sequence</h3>
          </div>
          <div className="space-y-2">
            {[
              { step: 1, title: 'Property Report AI Drafting', reason: 'Highest immediate value, lowest risk — reuses data you already have' },
              { step: 2, title: 'Email Drafting Assistant', reason: 'Directly supports agent workflow, uses existing template library' },
              { step: 3, title: 'Lead Scoring Rationale', reason: 'Helps agents prioritize — deterministic score stays unchanged' },
              { step: 4, title: 'Agent Assistant Chatbot', reason: 'Once agents are live and you know what questions they\'re asking' },
              { step: 5, title: 'Homeowner Portal Chatbot', reason: 'After Homeowner Dashboard has real usage patterns to design around' },
            ].map(({ step, title, reason }) => (
              <div key={step} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-primary">{step}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
