'use client';

import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Search, BookOpen, Play, ChevronDown, ChevronUp, ExternalLink, HelpCircle, Zap, Users, BarChart2, MessageSquare, Database, Shield, X } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  summary: string;
  readTime: string;
  href: string;
  tags: string[];
}

interface VideoEmbed {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  duration: string;
}

interface FAQItem {
  q: string;
  a: string;
}

interface FeatureGroup {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  articles: Article[];
  videos: VideoEmbed[];
  faqs: FAQItem[];
}

// ─── Content Data ─────────────────────────────────────────────────────────────

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    key: 'getting-started',
    label: 'Getting Started',
    icon: Zap,
    color: 'text-amber-500',
    articles: [
      { id: 'gs-1', title: 'Platform Overview & First Steps', summary: 'A complete walkthrough of the dashboard, sidebar navigation, and core concepts to get your team productive on day one.', readTime: '5 min', href: '#', tags: ['onboarding', 'dashboard', 'navigation'] },
      { id: 'gs-2', title: 'Connecting Your Data Sources', summary: 'How to link Zillow, Realtor.com, Craigslist, and SalesGenie to start pulling leads automatically into your pipeline.', readTime: '8 min', href: '#', tags: ['data', 'sync', 'sources'] },
      { id: 'gs-3', title: 'Inviting Team Members & Setting Roles', summary: 'Add agents, managers, and viewers. Understand role-based permissions and how they affect data visibility.', readTime: '4 min', href: '#', tags: ['team', 'roles', 'permissions'] },
      { id: 'gs-4', title: 'Running the Team Onboarding Wizard', summary: 'Use the 4-step onboarding wizard to configure data sources, seed cadence templates, define assignment rules, and connect SMS/email services.', readTime: '6 min', href: '/team-onboarding', tags: ['onboarding', 'wizard', 'setup'] },
    ],
    videos: [
      { id: 'gs-v1', title: 'Platform Walkthrough (5 min)', description: 'A quick tour of every major section — from the Dashboard to Lead Management to Cadence Performance.', youtubeId: 'dQw4w9WgXcQ', duration: '5:12' },
    ],
    faqs: [
      { q: 'How long does initial data sync take?', a: 'First-time syncs typically complete within 5–15 minutes depending on lead volume. You can monitor progress in the Sync Health dashboard.' },
      { q: 'Can I import leads from a CSV file?', a: 'Yes. Go to Lead Management → Bulk Actions → CSV Upload. The system maps columns automatically and flags duplicates before import.' },
      { q: 'What is the difference between an Agent and a Manager role?', a: 'Agents see only their assigned leads. Managers see all leads across their portfolio and can reassign, bulk-act, and view team analytics.' },
    ],
  },
  {
    key: 'lead-management',
    label: 'Lead Management',
    icon: Users,
    color: 'text-violet-500',
    articles: [
      { id: 'lm-1', title: 'Filtering & Saved Presets', summary: 'Build complex filter combinations with date ranges, score thresholds, lead source, and stage — then save them as one-click presets.', readTime: '4 min', href: '#', tags: ['filters', 'presets', 'search'] },
      { id: 'lm-2', title: 'Bulk Reassign & Agent Assignment Rules', summary: 'Reassign hundreds of leads at once. Set conditional rules by agent capacity, property type, geography, and custom tags.', readTime: '6 min', href: '/lead-management', tags: ['bulk', 'assign', 'rules'] },
      { id: 'lm-3', title: 'Duplicate Detection & Merge', summary: 'Identify duplicate properties across data sources and merge them with field-level conflict resolution before confirming.', readTime: '5 min', href: '/duplicate-detection', tags: ['duplicates', 'merge', 'data quality'] },
      { id: 'lm-4', title: 'ML Prospect Scoring Explained', summary: 'Understand how the blended score combines base prospect score with ML conversion probability from cadence engagement signals.', readTime: '7 min', href: '/ml-prospect-scoring', tags: ['scoring', 'ML', 'probability'] },
    ],
    videos: [
      { id: 'lm-v1', title: 'Bulk Actions Deep Dive', description: 'Watch how to select leads, apply filters, and dispatch bulk SMS, reassign agents, and tag portfolios in under 2 minutes.', youtubeId: 'dQw4w9WgXcQ', duration: '3:45' },
    ],
    faqs: [
      { q: 'How do I resurface warm leads before agents call?', a: 'Use the ML Prospect Scoring page. The "Warm Leads" panel automatically surfaces high-engagement prospects with a blended score above your threshold.' },
      { q: 'Can I assign leads to multiple agents?', a: 'Yes. The bulk reassign workflow supports assigning to a single agent or moving to a territory, which then distributes based on your assignment rules.' },
      { q: 'What does the regulation badge mean?', a: 'The regulation badge shows the STR compliance status for the property\'s city/state. Green = compliant, Yellow = restricted, Red = prohibited.' },
    ],
  },
  {
    key: 'cadence-outreach',
    label: 'Cadence & Outreach',
    icon: MessageSquare,
    color: 'text-emerald-500',
    articles: [
      { id: 'co-1', title: 'Building Your First Cadence Sequence', summary: 'Step-by-step guide to creating multi-touch sequences with SMS, email, and call steps — including timing, delays, and escalation triggers.', readTime: '8 min', href: '/cadence-engine', tags: ['cadence', 'sequence', 'SMS', 'email'] },
      { id: 'co-2', title: 'Template AI Suggestions Workflow', summary: 'How OpenAI analyzes your template performance and generates compliance-safe improvement suggestions with a human review step before applying.', readTime: '5 min', href: '/template-ai-suggestions', tags: ['AI', 'templates', 'compliance'] },
      { id: 'co-3', title: 'Understanding Delivery KPIs', summary: 'Carrier rejection codes, DND opt-outs, bounce rates, and spam complaints — what they mean and how to improve them.', readTime: '6 min', href: '/delivery-kpis', tags: ['delivery', 'SMS', 'email', 'KPIs'] },
      { id: 'co-4', title: 'Cadence AI Insights & Optimization', summary: 'Use Anthropic to analyze sequence performance, get cohort engagement insights, and receive early-warning signals for stalled leads.', readTime: '5 min', href: '/cadence-ai-insights', tags: ['AI', 'cadence', 'optimization'] },
    ],
    videos: [
      { id: 'co-v1', title: 'Cadence Performance Walkthrough', description: 'See how to read per-sequence metrics, identify your highest-converting sequences, and clone their structure for new campaigns.', youtubeId: 'dQw4w9WgXcQ', duration: '4:20' },
    ],
    faqs: [
      { q: 'What is the STOP rate and why does it matter?', a: 'The STOP rate is the percentage of SMS recipients who replied STOP to opt out. A rate above 2% signals your messaging may feel spammy — review template tone and frequency.' },
      { q: 'How do escalation triggers work?', a: 'When a lead replies or clicks a link, the system automatically escalates them out of the automated sequence and flags them for agent follow-up in the Escalated Leads view.' },
      { q: 'Can I A/B test templates?', a: 'Yes. Create two template variants and assign them to separate sequences. Compare engagement rates in the Template Performance dashboard.' },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics & Reports',
    icon: BarChart2,
    color: 'text-blue-500',
    articles: [
      { id: 'an-1', title: 'Advanced Reports: Filters & Saved Templates', summary: 'Build custom date-range reports with multi-select filters, score thresholds, and save them as reusable templates for your team.', readTime: '5 min', href: '/advanced-reports', tags: ['reports', 'filters', 'export'] },
      { id: 'an-2', title: 'Agent Leaderboard & Best Practices', summary: 'How the leaderboard ranks agents by conversion rate and days-to-close, and how AI extracts winning templates and talk tracks from top performers.', readTime: '4 min', href: '/agent-leaderboard', tags: ['agents', 'leaderboard', 'AI'] },
      { id: 'an-3', title: 'Scheduled Email Exports', summary: 'Set up weekly or monthly automated report exports to admin and homeowner mailboxes in CSV or PDF format.', readTime: '3 min', href: '/advanced-reports', tags: ['exports', 'email', 'scheduled'] },
    ],
    videos: [],
    faqs: [
      { q: 'How do I share a report with a homeowner?', a: 'Use Scheduled Exports in Advanced Reports. Add the homeowner\'s email as a recipient and set the frequency. They receive a formatted PDF without needing portal access.' },
      { q: 'What is the Executive Overview vs Analytics?', a: 'Executive Overview shows high-level KPIs for leadership. Analytics provides granular breakdowns by source, stage, agent, and time period for operational decisions.' },
    ],
  },
  {
    key: 'data-integrations',
    label: 'Data & Integrations',
    icon: Database,
    color: 'text-cyan-500',
    articles: [
      { id: 'di-1', title: 'Integration Hub: Connect & Manage Services', summary: 'Connect Twilio, Resend, DocuSign, and data sources via OAuth. View verification status, usage quotas, and manage API keys in one place.', readTime: '6 min', href: '/integration-hub', tags: ['integrations', 'OAuth', 'API keys'] },
      { id: 'di-2', title: 'Lead Data Quality Dashboard', summary: 'Monitor enrichment completeness, source reliability scores, data freshness age, and missing field trends to surface stale records.', readTime: '4 min', href: '/lead-data-quality', tags: ['data quality', 'enrichment', 'freshness'] },
      { id: 'di-3', title: 'Sync Health & Troubleshooting', summary: 'Diagnose sync failures, review error logs, and manually trigger re-syncs for specific data sources from the Sync Health dashboard.', readTime: '5 min', href: '/sync-health', tags: ['sync', 'health', 'troubleshooting'] },
    ],
    videos: [],
    faqs: [
      { q: 'Why are some leads showing as "stale"?', a: 'Leads are marked stale when their enrichment data is older than your configured freshness threshold (default: 30 days). Re-enrich them from the Lead Data Quality page.' },
      { q: 'How do I reconnect a disconnected integration?', a: 'Go to Integration Hub, find the disconnected service, and click "Re-authenticate". This restarts the OAuth flow without losing your existing configuration.' },
    ],
  },
  {
    key: 'admin-compliance',
    label: 'Admin & Compliance',
    icon: Shield,
    color: 'text-rose-500',
    articles: [
      { id: 'ac-1', title: 'Subscription Plans & Seat Management', summary: 'Switch plans, manage team seats, view invoices, and update payment methods from the Subscription & Billing page.', readTime: '3 min', href: '/billing', tags: ['billing', 'seats', 'plans'] },
      { id: 'ac-2', title: 'TCPA Compliance & Audit Trail', summary: 'How the platform logs every outreach action for TCPA compliance, and how to export audit reports for legal review.', readTime: '5 min', href: '/compliance-audit', tags: ['compliance', 'TCPA', 'audit'] },
      { id: 'ac-3', title: 'Homeowner Portal & White-Label Dashboard', summary: 'Give property owners access to their portfolio performance, lease-up status, and revenue estimates without admin interface access.', readTime: '4 min', href: '/owner-dashboard', tags: ['homeowner', 'portal', 'white-label'] },
    ],
    videos: [],
    faqs: [
      { q: 'Can homeowners see agent contact details?', a: 'No. The homeowner portal is scoped to portfolio-level metrics only. Agent names, emails, and internal notes are never exposed.' },
      { q: 'How do I export the compliance audit log?', a: 'Go to Compliance Audit → Export. You can filter by date range, agent, and action type before downloading as CSV or PDF.' },
    ],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function VideoModal({ video, onClose }: { video: VideoEmbed; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">{video.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{video.description}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full rounded-xl"
              src={`https://www.youtube.com/embed/${video.youtubeId}?autoplay=1`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FAQAccordion({ faqs }: { faqs: FAQItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {faqs.map((faq, i) => (
        <div key={i} className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-all"
          >
            <span className="text-sm font-medium text-foreground pr-4">{faq.q}</span>
            {openIdx === i ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
          </button>
          {openIdx === i && (
            <div className="px-4 pb-4 pt-1">
              <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HelpCenterPage() {
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'articles' | 'videos' | 'faq'>('articles');
  const [playingVideo, setPlayingVideo] = useState<VideoEmbed | null>(null);

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return FEATURE_GROUPS;
    const q = query.toLowerCase();
    return FEATURE_GROUPS.map((group) => ({
      ...group,
      articles: group.articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.tags.some((t) => t.includes(q))
      ),
      videos: group.videos.filter(
        (v) => v.title.toLowerCase().includes(q) || v.description.toLowerCase().includes(q)
      ),
      faqs: group.faqs.filter(
        (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
      ),
    })).filter((g) => g.articles.length > 0 || g.videos.length > 0 || g.faqs.length > 0);
  }, [query]);

  const selectedGroup = activeGroup
    ? filteredGroups.find((g) => g.key === activeGroup) ?? filteredGroups[0]
    : filteredGroups[0];

  const totalResults = filteredGroups.reduce(
    (acc, g) => acc + g.articles.length + g.videos.length + g.faqs.length,
    0
  );

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Hero */}
        <div className="bg-gradient-to-br from-primary/8 via-background to-background border-b border-border px-6 py-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
              <HelpCircle size={12} />
              Help Center
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">How can we help you?</h1>
            <p className="text-sm text-muted-foreground mb-6">Search articles, watch tutorials, and find answers to common questions.</p>
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveGroup(null); }}
                placeholder="Search articles, videos, FAQs…"
                className="w-full pl-11 pr-4 py-3 text-sm bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              )}
            </div>
            {query && (
              <p className="text-xs text-muted-foreground mt-3">
                {totalResults} result{totalResults !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex max-w-7xl mx-auto px-4 py-6 gap-6">
          {/* Left: Feature Group Nav */}
          <aside className="w-52 shrink-0 hidden lg:block">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">Topics</p>
            <nav className="space-y-0.5">
              {filteredGroups.map((group) => {
                const Icon = group.icon;
                const isActive = (activeGroup ?? filteredGroups[0]?.key) === group.key;
                return (
                  <button
                    key={group.key}
                    onClick={() => setActiveGroup(group.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all text-sm ${
                      isActive ? 'bg-primary/8 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                  >
                    <Icon size={14} className={isActive ? 'text-primary' : group.color} />
                    <span className="truncate">{group.label}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {group.articles.length + group.videos.length + group.faqs.length}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Right: Content */}
          <div className="flex-1 min-w-0">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-20">
                <Search size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No results found</p>
                <p className="text-xs text-muted-foreground mt-1">Try different keywords or browse all topics</p>
                <button onClick={() => setQuery('')} className="mt-4 text-xs text-primary hover:underline">Clear search</button>
              </div>
            ) : selectedGroup ? (
              <div>
                {/* Group Header */}
                <div className="flex items-center gap-3 mb-5">
                  {React.createElement(selectedGroup.icon, { size: 20, className: selectedGroup.color })}
                  <div>
                    <h2 className="text-base font-semibold text-foreground">{selectedGroup.label}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedGroup.articles.length} articles · {selectedGroup.videos.length} videos · {selectedGroup.faqs.length} FAQs
                    </p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-border mb-5">
                  {(['articles', 'videos', 'faq'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all capitalize ${
                        activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab === 'articles' && <BookOpen size={12} />}
                      {tab === 'videos' && <Play size={12} />}
                      {tab === 'faq' && <HelpCircle size={12} />}
                      {tab === 'faq' ? 'FAQ' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({tab === 'articles' ? selectedGroup.articles.length : tab === 'videos' ? selectedGroup.videos.length : selectedGroup.faqs.length})
                      </span>
                    </button>
                  ))}
                </div>

                {/* Articles */}
                {activeTab === 'articles' && (
                  <div className="space-y-3">
                    {selectedGroup.articles.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No articles match your search.</p>
                    ) : (
                      selectedGroup.articles.map((article) => (
                        <a
                          key={article.id}
                          href={article.href}
                          className="block p-4 bg-card border border-border rounded-xl hover:border-primary/40 hover:shadow-sm transition-all group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <BookOpen size={13} className="text-primary shrink-0" />
                                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{article.title}</p>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed mb-2">{article.summary}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-muted-foreground">{article.readTime} read</span>
                                {article.tags.slice(0, 3).map((tag) => (
                                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{tag}</span>
                                ))}
                              </div>
                            </div>
                            <ExternalLink size={13} className="text-muted-foreground group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                          </div>
                        </a>
                      ))
                    )}
                  </div>
                )}

                {/* Videos */}
                {activeTab === 'videos' && (
                  <div className="space-y-3">
                    {selectedGroup.videos.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No videos in this section yet.</p>
                    ) : (
                      selectedGroup.videos.map((video) => (
                        <button
                          key={video.id}
                          onClick={() => setPlayingVideo(video)}
                          className="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/40 hover:shadow-sm transition-all text-left group"
                        >
                          <div className="relative w-28 h-16 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                            <img
                              src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
                              alt={video.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/20 transition-all">
                              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                                <Play size={12} className="text-gray-900 ml-0.5" fill="currentColor" />
                              </div>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors mb-1">{video.title}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{video.description}</p>
                            <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{video.duration}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {/* FAQ */}
                {activeTab === 'faq' && (
                  <div>
                    {selectedGroup.faqs.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No FAQs match your search.</p>
                    ) : (
                      <FAQAccordion faqs={selectedGroup.faqs} />
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Video Modal */}
      {playingVideo && <VideoModal video={playingVideo} onClose={() => setPlayingVideo(null)} />}
    </AppLayout>
  );
}
