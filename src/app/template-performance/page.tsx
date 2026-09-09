'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Mail, Eye, MessageSquare, ArrowRight, Star, Clock, Search } from 'lucide-react';
import type { EmailTemplate } from '../page';
import Icon from '@/components/ui/AppIcon';


interface TemplateStats {
  templateId: string;
  sends: number;
  opens: number;
  replies: number;
  conversions: number;
  openRate: number;
  replyRate: number;
  conversionRate: number;
}

const mockStats: Record<string, TemplateStats> = {
  'tpl-1': { templateId: 'tpl-1', sends: 140, opens: 45, replies: 11, conversions: 4, openRate: 32, replyRate: 8, conversionRate: 3 },
  'tpl-2': { templateId: 'tpl-2', sends: 98, opens: 28, replies: 6, conversions: 2, openRate: 29, replyRate: 6, conversionRate: 2 },
  'tpl-3': { templateId: 'tpl-3', sends: 67, opens: 31, replies: 14, conversions: 7, openRate: 46, replyRate: 21, conversionRate: 10 },
  'tpl-4': { templateId: 'tpl-4', sends: 45, opens: 18, replies: 3, conversions: 1, openRate: 40, replyRate: 7, conversionRate: 2 },
};

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min((value / max) * 100, 100)}%` }} />
      </div>
      <span className="text-xs font-bold text-foreground w-8 text-right">{value}%</span>
    </div>
  );
}

function getRatingLabel(openRate: number, replyRate: number): { label: string; color: string } {
  const score = openRate * 0.4 + replyRate * 0.6;
  if (score >= 20) return { label: 'Top Performer', color: 'bg-success/10 text-success border-success/30' };
  if (score >= 12) return { label: 'Good', color: 'bg-info/10 text-info border-info/30' };
  if (score >= 6) return { label: 'Average', color: 'bg-warning/10 text-warning border-warning/30' };
  return { label: 'Needs Work', color: 'bg-danger/10 text-danger border-danger/30' };
}

export default function TemplatePerformancePage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'openRate' | 'replyRate' | 'conversionRate' | 'sends'>('replyRate');
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data } = await supabase.from('email_templates').select('*').order('category');
        if (data && data.length > 0) {
          setTemplates(data as EmailTemplate[]);
        } else {
          // Fallback mock templates for display
          setTemplates([
            { id: 'tpl-1', name: 'Initial Outreach — Denver', subject: 'Maximize Your Denver Property Revenue', body: '', category: 'outreach', created_at: '2026-07-01' },
            { id: 'tpl-2', name: 'Follow-Up #1', subject: 'Quick Follow-Up on Your Property', body: '', category: 'follow_up', created_at: '2026-07-05' },
            { id: 'tpl-3', name: 'Check-In — Luxury Markets', subject: 'Your Aspen Property Could Earn More', body: '', category: 'follow_up', created_at: '2026-07-10' },
            { id: 'tpl-4', name: 'Proposal Email', subject: 'TRAVLR Partnership Proposal for Your Property', body: '', category: 'proposal', created_at: '2026-07-15' },
          ]);
        }
      } catch {
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [supabase]);

  const templatesWithStats = templates
    .map(t => ({
      ...t,
      stats: mockStats[t.id] || {
        templateId: t.id,
        sends: Math.floor(Math.random() * 80) + 10,
        opens: 0,
        replies: 0,
        conversions: 0,
        openRate: Math.floor(Math.random() * 40) + 10,
        replyRate: Math.floor(Math.random() * 15) + 2,
        conversionRate: Math.floor(Math.random() * 8) + 1,
      },
    }))
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.stats[sortBy] as number) - (a.stats[sortBy] as number));

  const avgOpenRate = templatesWithStats.length
    ? Math.round(templatesWithStats.reduce((s, t) => s + t.stats.openRate, 0) / templatesWithStats.length)
    : 0;
  const avgReplyRate = templatesWithStats.length
    ? Math.round(templatesWithStats.reduce((s, t) => s + t.stats.replyRate, 0) / templatesWithStats.length)
    : 0;
  const totalSends = templatesWithStats.reduce((s, t) => s + t.stats.sends, 0);

  const categoryColors: Record<string, string> = {
    outreach: 'bg-blue-500/10 text-blue-600 border-blue-200',
    follow_up: 'bg-amber-500/10 text-amber-600 border-amber-200',
    proposal: 'bg-purple-500/10 text-purple-600 border-purple-200',
    closing: 'bg-green-500/10 text-green-600 border-green-200',
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Template Performance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Track open rates, reply rates, and conversion rates per template</p>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Sends', value: totalSends.toLocaleString(), icon: Mail, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Avg Open Rate', value: `${avgOpenRate}%`, icon: Eye, color: 'text-info', bg: 'bg-info/10' },
            { label: 'Avg Reply Rate', value: `${avgReplyRate}%`, icon: MessageSquare, color: 'text-success', bg: 'bg-success/10' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon size={15} className={color} />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Sort by:</span>
            {[
              { key: 'replyRate', label: 'Reply Rate' },
              { key: 'openRate', label: 'Open Rate' },
              { key: 'conversionRate', label: 'Conversion' },
              { key: 'sends', label: 'Volume' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key as typeof sortBy)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  sortBy === opt.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Template Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-muted/50 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templatesWithStats.map((tpl, idx) => {
              const rating = getRatingLabel(tpl.stats.openRate, tpl.stats.replyRate);
              return (
                <div key={tpl.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary/20 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {idx === 0 && <Star size={13} className="text-amber-400 fill-amber-400" />}
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${categoryColors[tpl.category] || 'bg-muted text-muted-foreground border-border'}`}>
                        {tpl.category.replace('_', ' ')}
                      </span>
                    </div>
                    <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full border ${rating.color}`}>{rating.label}</span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground mb-0.5 truncate">{tpl.name}</h3>
                  <p className="text-xs text-muted-foreground mb-4 truncate">Subject: {tpl.subject || '(no subject)'}</p>

                  <div className="space-y-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1"><Eye size={9} /> Open Rate</span>
                      </div>
                      <StatBar value={tpl.stats.openRate} max={60} color="bg-info" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1"><MessageSquare size={9} /> Reply Rate</span>
                      </div>
                      <StatBar value={tpl.stats.replyRate} max={30} color="bg-success" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1"><ArrowRight size={9} /> Conversion Rate</span>
                      </div>
                      <StatBar value={tpl.stats.conversionRate} max={15} color="bg-primary" />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Mail size={9} />
                      <span>{tpl.stats.sends} sends</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Eye size={9} />
                      <span>{tpl.stats.opens} opens</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MessageSquare size={9} />
                      <span>{tpl.stats.replies} replies</span>
                    </div>
                    {tpl.created_at && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                        <Clock size={9} />
                        <span>{new Date(tpl.created_at).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
