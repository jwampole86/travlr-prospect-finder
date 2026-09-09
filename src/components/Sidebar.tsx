'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import HelpChatPanel from '@/components/HelpChatPanel';
import ThemeToggle from '@/components/ThemeToggle';

import { LayoutDashboard, List, Map, ChevronLeft, ChevronRight, Settings, Download, RefreshCw, Bell, HelpCircle, Building2, ChevronDown, Calculator, FileText, Zap, TrendingUp, Star, SlidersHorizontal, LogOut, Radio, LineChart, Mail, UserCircle, Users, GitBranch, Inbox, History, CalendarClock, Wrench, DollarSign, CheckCircle, Kanban, Copy, Activity, BarChart2, Brain, CalendarCheck, Globe2, X, Shield, ClipboardList, Search, Radar, HeartPulse, Play, MessageSquare, Megaphone, UserPlus, Send, RotateCcw, AlertOctagon, TrendingDown, PieChart, ShieldCheck, Phone, Flame, UserCog, Edit2, CheckSquare, Webhook, Server, MonitorDot, Trophy, Sparkles, DatabaseZap, Home, Rocket, Signal, UserCheck, CreditCard, Plug, BookOpen, Lock, Globe, Database, Headphones, Award, Link2, MessageCircle, Target, Navigation, Briefcase, Mic, Calendar, AlertCircle } from 'lucide-react';

// ─── Nav Group Types ──────────────────────────────────────────────────────────

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string | null;
}

interface NavGroup {
  key: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

// ─── Admin Nav Groups ─────────────────────────────────────────────────────────

const adminNavGroups: NavGroup[] = [
  {
    key: 'core',
    label: 'Core',
    icon: LayoutDashboard,
    items: [
      { key: 'nav-dashboard', label: 'Dashboard', href: '/', icon: LayoutDashboard, badge: null },
      { key: 'nav-executive-overview', label: 'Executive Overview', href: '/executive-overview', icon: PieChart, badge: null },
      { key: 'nav-pipeline', label: 'Pipeline Board', href: '/pipeline', icon: Kanban, badge: null },
      { key: 'nav-map', label: 'Map View', href: '/map-view', icon: Map, badge: null },
      { key: 'nav-agent-field-view', label: 'Field View (Mobile)', href: '/agent-field-view', icon: Navigation, badge: null },
      { key: 'nav-agent-profile', label: 'My Profile & Prefs', href: '/agent-profile', icon: UserCheck, badge: null },
      { key: 'nav-system-health', label: 'System Health', href: '/system-health', icon: Globe, badge: null },
    ],
  },
  {
    key: 'leads',
    label: 'Leads & Pipeline',
    icon: List,
    items: [
      { key: 'nav-leads', label: 'Lead Management', href: '/lead-management', icon: List, badge: null },
      { key: 'nav-lead-record', label: 'Lead Record', href: '/lead-record', icon: UserCircle, badge: null },
      { key: 'nav-lead-profile', label: 'Lead Profile', href: '/lead-profile', icon: UserCircle, badge: null },
      { key: 'nav-lead-sources', label: 'Lead Sources', href: '/lead-sources', icon: Radio, badge: null },
      { key: 'nav-lead-sources-manager', label: 'Lead Sources Manager', href: '/lead-sources-manager', icon: Shield, badge: 'New' },
      { key: 'nav-ml-prospect-scoring', label: 'ML Prospect Scoring', href: '/ml-prospect-scoring', icon: Brain, badge: null },
      { key: 'nav-screening', label: 'Property Screening', href: '/property-screening', icon: Shield, badge: null },
      { key: 'nav-property-report', label: 'Property Report', href: '/property-report', icon: FileText, badge: null },
      { key: 'nav-questionnaires', label: 'Questionnaires', href: '/questionnaires', icon: ClipboardList, badge: null },
      { key: 'nav-dedup', label: 'Duplicate Detection', href: '/duplicate-detection', icon: Copy, badge: null },
      { key: 'nav-duplicate-audit', label: 'Duplicate Audit', href: '/duplicate-audit', icon: GitBranch, badge: null },
      { key: 'nav-dedup-monitor', label: 'Dedup Monitor', href: '/dedup-monitor', icon: Shield, badge: 'New' },
      { key: 'nav-renewal-alerts', label: 'Renewal Alerts', href: '/renewal-alerts', icon: CalendarCheck, badge: null },
      { key: 'nav-signing', label: 'Agreement Signing', href: '/lead-management', icon: FileText, badge: null },
    ],
  },
  {
    key: 'data',
    label: 'Data & Sync',
    icon: RefreshCw,
    items: [
      { key: 'nav-data-sync', label: 'Data Sync', href: '/data-sync', icon: Play, badge: null },
      { key: 'nav-sync-health', label: 'Sync Health', href: '/sync-health', icon: HeartPulse, badge: null },
      { key: 'nav-trulia-source-health', label: 'Trulia Source Integrity', href: '/trulia-source-health', icon: Radio, badge: 'New' },
      { key: 'nav-data-freshness', label: 'Data Freshness Monitor', href: '/data-freshness', icon: Activity, badge: null },
      { key: 'nav-sync-ops', label: 'Sync Ops Dashboard', href: '/sync-ops-dashboard', icon: Activity, badge: null },
      { key: 'nav-sync-regression-monitor', label: 'Sync Regression Monitor', href: '/sync-regression-monitor', icon: AlertOctagon, badge: 'New' },
      { key: 'nav-sync-diagnostics', label: 'Sync Diagnostics', href: '/sync-diagnostics', icon: MonitorDot, badge: 'New' },
      { key: 'nav-enrichment-rules-engine', label: 'Enrichment Rules Engine', href: '/enrichment-rules-engine', icon: Shield, badge: 'New' },
      { key: 'nav-enrichment-validation-analytics', label: 'Validation Analytics', href: '/enrichment-validation-analytics', icon: BarChart2, badge: 'New' },
      { key: 'nav-contact-enrichment', label: 'Contact Enrichment', href: '/contact-enrichment', icon: DatabaseZap, badge: 'New' },
      { key: 'nav-enrichment-review-queue', label: 'Enrichment Review Queue', href: '/enrichment-review-queue', icon: AlertCircle, badge: 'New' },
      { key: 'nav-source-intelligence', label: 'Source Intelligence', href: '/source-intelligence', icon: Radar, badge: null },
      { key: 'nav-enrichment-costs', label: 'Enrichment Costs', href: '/enrichment-costs', icon: Search, badge: null },
      { key: 'nav-integration-health', label: 'Integration Health', href: '/integration-health', icon: HeartPulse, badge: null },
      { key: 'nav-csv-preflight', label: 'CSV Pre-Flight', href: '/csv-preflight', icon: CheckSquare, badge: null },
      { key: 'nav-rescore-events', label: 'Re-Score Events', href: '/rescore-events', icon: TrendingDown, badge: null },
      { key: 'nav-cleaner-jobs', label: 'Cleaner Jobs', href: '/cleaner/jobs', icon: CheckCircle, badge: null },
      { key: 'nav-lead-data-quality', label: 'Lead Data Quality', href: '/lead-data-quality', icon: DatabaseZap, badge: null },
      { key: 'nav-data-quality-monitor', label: 'Data Quality Monitor', href: '/data-quality-monitor', icon: ShieldCheck, badge: 'New' },
      { key: 'nav-property-verification-debug', label: 'Verification Debug', href: '/property-verification-debug', icon: Shield, badge: 'New' },
    ],
  },
  {
    key: 'outreach',
    label: 'Outreach',
    icon: Send,
    items: [
      { key: 'nav-email-templates', label: 'Email Templates', href: '/email-templates', icon: Mail, badge: null },
      { key: 'nav-supabase-email-templates', label: 'Auth Email Templates', href: '/supabase-email-templates', icon: Mail, badge: null },
      { key: 'nav-templates', label: 'Message Templates', href: '/templates', icon: MessageSquare, badge: null },
      { key: 'nav-template-editor', label: 'Template Editor', href: '/template-editor', icon: Edit2, badge: null },
      { key: 'nav-template-ratings', label: 'Template Ratings', href: '/template-ratings', icon: Star, badge: null },
      { key: 'nav-template-ai-suggestions', label: 'Template AI Suggestions', href: '/template-ai-suggestions', icon: Sparkles, badge: null },
      { key: 'nav-cadence', label: 'Cadence Engine', href: '/cadence-engine', icon: Zap, badge: null },
      { key: 'nav-cadence-performance', label: 'Cadence Performance', href: '/cadence-performance', icon: BarChart2, badge: null },
      { key: 'nav-cadence-ai-insights', label: 'Cadence AI Insights', href: '/cadence-ai-insights', icon: Brain, badge: null },
      { key: 'nav-escalated-leads', label: 'Escalated Leads', href: '/escalated-leads', icon: Flame, badge: null },
      { key: 'nav-followup-sequences', label: 'Follow-Up Sequences', href: '/follow-up-sequences', icon: GitBranch, badge: null },
      { key: 'nav-sms-delivery', label: 'SMS Delivery', href: '/sms-delivery', icon: Send, badge: null },
      { key: 'nav-sms-campaign-analytics', label: 'SMS Campaign Analytics', href: '/sms-campaign-analytics', icon: BarChart2, badge: 'New' },
      { key: 'nav-sms-inbound-threads', label: 'Inbound Threads', href: '/sms-inbound-threads', icon: MessageCircle, badge: 'New' },
      { key: 'nav-bulk-outreach', label: 'Bulk Outreach Composer', href: '/bulk-outreach', icon: Megaphone, badge: null },
{ key: 'nav-bulk-email-outreach', label: 'Bulk Email Outreach', href: '/bulk-email-outreach', icon: Mail, badge: null },
      { key: 'nav-email-campaigns', label: 'Email Campaigns', href: '/email-campaigns', icon: Send, badge: 'New' },
      { key: 'nav-sms-cadence-templates', label: 'SMS Cadence Templates', href: '/sms-cadence-templates', icon: MessageSquare, badge: null },
      { key: 'nav-delivery-kpis', label: 'Delivery KPIs', href: '/delivery-kpis', icon: Signal, badge: null },
      { key: 'nav-outreach-history', label: 'Outreach History', href: '/outreach-history', icon: Mail, badge: null },
      { key: 'nav-outreach-tracking', label: 'Outreach Tracking', href: '/outreach-tracking', icon: Phone, badge: null },
      { key: 'nav-retry-queue', label: 'Retry Queue', href: '/retry-queue', icon: RotateCcw, badge: null },
      { key: 'nav-alert-hub', label: 'Alert Hub', href: '/alert-hub', icon: AlertOctagon, badge: null },
      { key: 'nav-alerts-inbox', label: 'Alerts Inbox', href: '/alerts-inbox', icon: Inbox, badge: null },
      { key: 'nav-info-request-dashboard', label: 'Info-Request Links', href: '/info-request-dashboard', icon: Link2, badge: null },
    ],
  },
  {
    key: 'calls',
    label: 'Calls',
    icon: Phone,
    items: [
      { key: 'nav-teleprompter', label: 'Live Teleprompter', href: '/teleprompter', icon: Phone, badge: null },
      { key: 'nav-interview-teleprompter', label: 'Interview Mode', href: '/teleprompter/interview', icon: Briefcase, badge: 'New' },
      { key: 'nav-admin-lead-queue', label: 'Live Lead Queue', href: '/admin-lead-queue', icon: Zap, badge: 'New' },
      { key: 'nav-interview-calendar', label: 'Interview Calendar', href: '/interview-calendar', icon: CalendarClock, badge: null },
      { key: 'nav-interview-recordings', label: 'Interview Recordings', href: '/interview-recordings', icon: Mic, badge: null },
      { key: 'nav-candidate-profiles', label: 'Candidate Profiles', href: '/candidate-profiles', icon: Users, badge: null },
      { key: 'nav-candidate-kanban', label: 'Candidate Kanban', href: '/candidate-kanban', icon: Kanban, badge: 'New' },
      { key: 'nav-candidate-pipeline', label: 'Candidate Pipeline', href: '/candidate-pipeline', icon: Kanban, badge: 'New' },
      { key: 'nav-consistency-report', label: 'Resume vs. Interview', href: '/consistency-report', icon: FileText, badge: 'New' },
      { key: 'nav-interview-mode-qa', label: 'Interview QA', href: '/interview-mode-qa', icon: CheckSquare, badge: 'New' },
      { key: 'nav-candidate-tracker', label: 'Candidate Tracker', href: '/candidate-tracker', icon: CheckSquare, badge: 'New' },
      { key: 'nav-offer-letters', label: 'Offer Letters', href: '/offer-letters', icon: FileText, badge: 'New' },
      { key: 'nav-candidate-sequences', label: 'Candidate Sequences', href: '/candidate-sequences', icon: Send, badge: 'New' },
      { key: 'nav-hiring-analytics', label: 'Hiring Analytics', href: '/hiring-analytics', icon: BarChart2, badge: 'New' },
      { key: 'nav-headset-setup', label: 'Headset Setup', href: '/headset-setup', icon: Headphones, badge: null },
      { key: 'nav-call-analytics', label: 'Call Analytics', href: '/call-analytics', icon: BarChart2, badge: null },
      { key: 'nav-cron-monitor', label: 'Cron Job Monitor', href: '/cron-monitor', icon: Activity, badge: null },
      { key: 'nav-agent-coaching', label: 'Agent Coaching', href: '/agent-coaching', icon: Award, badge: null },
      { key: 'nav-call-quality-review', label: 'Call Quality Review', href: '/call-quality-review', icon: Star, badge: null },
      { key: 'nav-lead-auto-assign', label: 'Lead Auto-Assign', href: '/lead-auto-assign', icon: Brain, badge: null },
      { key: 'nav-score-retraining', label: 'AI Score Retraining', href: '/score-retraining', icon: Brain, badge: null },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics & Reports',
    icon: LineChart,
    items: [
      { key: 'nav-analytics', label: 'Analytics', href: '/analytics', icon: LineChart, badge: null },
      { key: 'nav-advanced-reports', label: 'Advanced Reports', href: '/advanced-reports', icon: BarChart2, badge: null },
      { key: 'nav-campaign-analytics', label: 'Campaign Analytics', href: '/campaign-analytics', icon: Megaphone, badge: null },
      { key: 'nav-template-perf', label: 'Template Performance', href: '/template-performance', icon: BarChart2, badge: null },
      { key: 'nav-outreach-performance', label: 'Outreach Performance', href: '/outreach-performance', icon: BarChart2, badge: null },
      { key: 'nav-activity', label: 'Activity Timeline', href: '/activity-timeline', icon: Activity, badge: null },
      { key: 'nav-audit-trail', label: 'Audit Trail', href: '/audit-trail', icon: History, badge: null },
      { key: 'nav-admin-audit-log', label: 'Admin Audit Log', href: '/admin-audit-log', icon: ShieldCheck, badge: null },
      { key: 'nav-compliance-audit', label: 'Compliance Audit', href: '/compliance-audit', icon: ShieldCheck, badge: null },
      { key: 'nav-compliance-change-log', label: 'Compliance Change Log', href: '/compliance-change-log', icon: Shield, badge: null },
      { key: 'nav-city-regulations', label: 'City Regulations / STR', href: '/city-regulations', icon: Shield, badge: 'New' },
      { key: 'nav-regulation-trace', label: 'Trace Regulation', href: '/regulation-trace', icon: Database, badge: null },
      { key: 'nav-pre-launch-checklist', label: 'Pre-Launch Checklist', href: '/pre-launch-checklist', icon: CheckSquare, badge: null },
      { key: 'nav-onboarding-doc-review', label: 'Onboarding Doc Review', href: '/onboarding-doc-review', icon: FileText, badge: null },
{ key: 'nav-checklist-auto-advance', label: 'Checklist Automation', href: '/checklist-auto-advance-settings', icon: Settings, badge: null },
      { key: 'nav-crm-export', label: 'CRM Export (HubSpot)', href: '/crm-export', icon: Database, badge: null },
      { key: 'nav-exports', label: 'Scheduled Exports', href: '/exports', icon: CalendarClock, badge: null },
      { key: 'nav-csv-export', label: 'CSV Export', href: '/csv-export', icon: Download, badge: null },
      { key: 'nav-score-breakdown', label: 'AI Score Breakdown', href: '/score-breakdown', icon: Brain, badge: null },
      { key: 'nav-roi-calculator', label: 'ROI Calculator', href: '/roi-calculator', icon: Globe2, badge: null },
      { key: 'nav-lead-lifecycle', label: 'Lead Lifecycle Funnel', href: '/lead-lifecycle', icon: TrendingUp, badge: null },
    ],
  },
  {
    key: 'agents',
    label: 'Agents & Team',
    icon: Users,
    items: [
      { key: 'nav-agent-management', label: 'Agent Management', href: '/agent-management', icon: UserPlus, badge: 'New' },
      { key: 'nav-workspace-management', label: 'Workspace Management', href: '/workspace-management', icon: Building2, badge: null },
      { key: 'nav-user-management', label: 'User Management', href: '/user-management', icon: UserCog, badge: null },
      { key: 'nav-agents', label: 'Agents (Legacy)', href: '/agents', icon: Users, badge: null },
      { key: 'nav-agent-leaderboard', label: 'Agent Leaderboard', href: '/agent-leaderboard', icon: Trophy, badge: null },
      { key: 'nav-agent-performance', label: 'Agent Performance', href: '/agent-performance', icon: Users, badge: null },
      { key: 'nav-agent-conversion-analytics', label: 'Conversion Analytics', href: '/agent-conversion-analytics', icon: Rocket, badge: null },
      { key: 'nav-conversion-analytics', label: 'Close Rate Analytics', href: '/conversion-analytics', icon: BarChart2, badge: null },
      { key: 'nav-agent-routing', label: 'Agent Routing (Band)', href: '/agent-routing', icon: Target, badge: null },
      { key: 'nav-agent-productivity', label: 'Agent Productivity', href: '/agent-productivity', icon: BarChart2, badge: null },
      { key: 'nav-team-performance', label: 'Team Performance', href: '/team-performance', icon: TrendingUp, badge: null },
      { key: 'nav-team-agents', label: 'Team Agent Performance', href: '/team-agents', icon: Phone, badge: null },
      { key: 'nav-team-lead-board', label: 'Team Lead Board', href: '/team-lead-board', icon: Users, badge: null },
      { key: 'nav-agent-workload-board', label: 'Agent Workload Board', href: '/agent-workload-board', icon: BarChart2, badge: null },
      { key: 'nav-manager-team-metrics', label: 'Manager Team Metrics', href: '/manager-team-metrics', icon: BarChart2, badge: null },
      { key: 'nav-agent-onboarding', label: 'Agent Onboarding', href: '/agent-onboarding', icon: UserPlus, badge: null },
      { key: 'nav-bulk-invite', label: 'Bulk Agent Invite', href: '/bulk-invite', icon: UserPlus, badge: null },
      { key: 'nav-commission-rules', label: 'Commission Rules', href: '/commission-rules', icon: DollarSign, badge: null },
    ],
  },
  {
    key: 'tools',
    label: 'Tools & Admin',
    icon: Wrench,
    items: [
      { key: 'nav-ai-features', label: 'AI Features', href: '/ai-features', icon: Brain, badge: null },
      { key: 'nav-workflows', label: 'Workflows', href: '/workflows', icon: GitBranch, badge: null },
      { key: 'nav-operations', label: 'Operations', href: '/operations', icon: Wrench, badge: null },
      { key: 'nav-integration-hub', label: 'Integration Hub', href: '/integration-hub', icon: Plug, badge: null },
      { key: 'nav-billing', label: 'Subscription & Billing', href: '/billing', icon: CreditCard, badge: null },
      { key: 'nav-admin-management', label: 'Admin Management', href: '/admin-management', icon: Settings, badge: null },
      { key: 'nav-admin-config', label: 'Admin Config', href: '/admin-config', icon: Server, badge: null },
      { key: 'nav-webhook-inspector', label: 'Webhook Inspector', href: '/webhook-inspector', icon: Webhook, badge: null },
      { key: 'nav-base44-submissions', label: 'Base44 Submissions', href: '/base44-submissions', icon: Flame, badge: null },
      { key: 'nav-ops-monitoring', label: 'Ops Monitoring', href: '/ops-monitoring', icon: MonitorDot, badge: null },
      { key: 'nav-performance-dashboard', label: 'Performance Dashboard', href: '/performance-dashboard', icon: Activity, badge: null },
      { key: 'nav-performance-diagnostics', label: 'Performance Diagnostics', href: '/performance-diagnostics', icon: Zap, badge: 'New' },
      { key: 'nav-score-simulator', label: 'Score Simulator', href: '/score-simulator', icon: SlidersHorizontal, badge: null },
      { key: 'nav-scoring-rules', label: 'Scoring Rules', href: '/scoring-rules', icon: Star, badge: null },
      { key: 'nav-score-weight-editor', label: 'Score Weight Editor', href: '/score-weight-editor', icon: SlidersHorizontal, badge: null },
      { key: 'nav-bulk-actions', label: 'Bulk Actions', href: '/bulk-actions', icon: CheckSquare, badge: null },
      { key: 'nav-admin-roles', label: 'Roles & Permissions', href: '/admin-roles', icon: ShieldCheck, badge: null },
      { key: 'nav-admin-events', label: 'Event Dashboard', href: '/admin-events', icon: Activity, badge: null },
      { key: 'nav-nurture-cadence', label: 'Nurture Cadence', href: '/nurture-cadence', icon: Zap, badge: null },
      { key: 'nav-notifications', label: 'Notification Prefs', href: '/notifications', icon: Bell, badge: null },
      { key: 'nav-homeowner-notifications', label: 'Homeowner Notifications', href: '/homeowner-notifications', icon: Home, badge: null },
      { key: 'nav-session-management', label: 'Session Management', href: '/session-management', icon: Lock, badge: null },
      { key: 'nav-team-onboarding', label: 'Team Onboarding', href: '/team-onboarding', icon: Rocket, badge: null },
      { key: 'nav-agent-profile-tools', label: 'Agent Profile', href: '/agent-profile', icon: UserCheck, badge: null },
      { key: 'nav-help-center', label: 'Help Center', href: '/help-center', icon: BookOpen, badge: null },
      { key: 'nav-owner-dashboard', label: 'Owner Dashboard', href: '/owner-dashboard', icon: Building2, badge: null },
    ],
  },
];

// ─── Agent Nav Groups ─────────────────────────────────────────────────────────

const agentNavGroups: NavGroup[] = [
  {
    key: 'core',
    label: 'Core',
    icon: LayoutDashboard,
    items: [
      { key: 'nav-agent-workspace', label: 'My Dashboard', href: '/agent-workspace', icon: LayoutDashboard, badge: null },
      { key: 'nav-agent-my-leads', label: 'My Leads', href: '/agent-my-leads', icon: List, badge: null },
      { key: 'nav-agent-followups', label: 'Follow-Ups', href: '/agent-my-leads?filter=followup', icon: Calendar, badge: null },
    ],
  },
  {
    key: 'calls',
    label: 'Calls',
    icon: Phone,
    items: [
      { key: 'nav-teleprompter', label: 'Call Workspace', href: '/teleprompter', icon: Phone, badge: null },
      { key: 'nav-headset-setup', label: 'Headset Setup', href: '/headset-setup', icon: Headphones, badge: null },
      { key: 'nav-outreach-history', label: 'Call History', href: '/outreach-history', icon: History, badge: null },
    ],
  },
  {
    key: 'performance',
    label: 'My Performance',
    icon: TrendingUp,
    items: [
      { key: 'nav-agent-self-performance', label: 'My Performance', href: '/agent-self-performance', icon: TrendingUp, badge: null },
      { key: 'nav-activity', label: 'My Activity', href: '/activity-timeline', icon: Activity, badge: null },
      { key: 'nav-commissions', label: 'My Commissions', href: '/agent/commissions', icon: DollarSign, badge: null },
    ],
  },
  {
    key: 'help',
    label: 'Help',
    icon: HelpCircle,
    items: [
      { key: 'nav-help-center', label: 'Help Center', href: '/help-center', icon: BookOpen, badge: null },
      { key: 'nav-agent-profile', label: 'My Profile', href: '/agent-profile', icon: UserCheck, badge: null },
      { key: 'nav-settings', label: 'Account Settings', href: '/settings', icon: Settings, badge: null },
    ],
  },
];

const bottomItems = [
  { key: 'nav-refresh', label: 'Refresh All', href: '/data-sync', icon: RefreshCw },
  { key: 'nav-settings', label: 'Settings', href: '/settings', icon: Settings },
  { key: 'nav-help', label: 'Help', href: '/support', icon: HelpCircle },
];

interface SidebarProps {
  onClose?: () => void;
}

// ─── NavGroup Component ───────────────────────────────────────────────────────

function NavGroupSection({
  group,
  collapsed,
  pathname,
  onNavClick,
  defaultOpen,
}: {
  group: NavGroup;
  collapsed: boolean;
  pathname: string;
  onNavClick: () => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const GroupIcon = group.icon;
  const hasActive = group.items.some((item) => pathname === item.href);

  if (collapsed) {
    // In collapsed mode show only icons, highlight if group has active item
    return (
      <div className="mb-0.5">
        {group.items.map((item) => {
          const ItemIcon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              title={item.label}
              onClick={onNavClick}
              className={`relative flex items-center justify-center p-2 rounded-md transition-all duration-150 min-h-[36px] ${
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <ItemIcon size={15} className="shrink-0" />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 group ${
          hasActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
        aria-expanded={open}
      >
        <GroupIcon size={13} className="shrink-0" />
        <span className="flex-1 text-left uppercase tracking-wider text-[10px]">{group.label}</span>
        <ChevronDown
          size={11}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="mt-0.5 ml-2 pl-2 border-l border-border/60 space-y-0.5">
          {group.items.map((item) => {
            const ItemIcon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavClick}
                className={`flex items-center gap-2.5 px-2 rounded-md text-xs font-medium transition-all duration-150 touch-manipulation ${
                  isActive
                    ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                style={{ minHeight: '40px' }}
              >
                <ItemIcon size={13} className="shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto text-[9px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { user, signOut, role } = useAuth();
  const { unreadCount, setDrawerOpen } = useNotifications();
  const { selectedPortfolio, setSelectedPortfolio, visiblePortfolios } = usePortfolio();

  const navGroups = role === 'agent' ? agentNavGroups : adminNavGroups;

  // Determine which group should be open by default (the one containing the active path)
  function isGroupDefaultOpen(group: NavGroup): boolean {
    return group.items.some((item) => pathname === item.href);
  }

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'OP';

  const roleBadgeColor = role === 'agent' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  const roleLabel = role === 'agent' ? 'Agent' : 'Admin';

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Operator';
  const displayEmail = user?.email || '';

  async function handleSignOut() {
    try { await signOut(); } catch {}
  }

  function handleNavClick() {
    if (onClose) onClose();
  }

  return (
    <aside
      className="relative flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out shrink-0 h-full"
      style={{ width: collapsed ? 64 : 240 }}
    >
      {/* Logo + mobile close */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border h-[60px] overflow-hidden">
        <AppLogo src="/assets/images/EFB407B4-CD49-4BC9-9A8E-9894DB058712-1786579880495.PNG" size={28} />
        {!collapsed && (
          <div className="flex flex-col leading-none min-w-0 flex-1">
            <span className="text-sm font-semibold text-foreground truncate">TRAVLR</span>
            <span className="text-xs text-muted-foreground truncate">Prospect Finder</span>
          </div>
        )}
        {onClose && !collapsed && (
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Portfolio Switcher */}
      {!collapsed && (
        <div className="mx-3 mt-3 mb-1 relative">
          <button
            onClick={() => setPortfolioOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/60 border border-border hover:bg-muted transition-all"
            aria-haspopup="listbox"
            aria-expanded={portfolioOpen}
            aria-label="Switch portfolio"
          >
            <Building2 size={13} className={`${selectedPortfolio?.color} shrink-0`} />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium text-foreground truncate">{selectedPortfolio?.label}</p>
              <p className="text-[10px] text-muted-foreground truncate">{selectedPortfolio?.abbr} · {selectedPortfolio?.cities?.split('/')?.[0]?.trim()}...</p>
            </div>
            <ChevronDown size={11} className={`text-muted-foreground shrink-0 transition-transform ${portfolioOpen ? 'rotate-180' : ''}`} />
          </button>
          {portfolioOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden max-h-72 overflow-y-auto" role="listbox">
              {visiblePortfolios?.map((p) => (
                <button
                  key={p?.key}
                  role="option"
                  aria-selected={selectedPortfolio?.key === p?.key}
                  onClick={() => { setSelectedPortfolio(p); setPortfolioOpen(false); }}
                  className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted transition-all ${selectedPortfolio?.key === p?.key ? 'bg-primary/5' : ''}`}
                >
                  <Building2 size={12} className={`${p?.color} mt-0.5 shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{p?.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p?.cities}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsed portfolio indicator */}
      {collapsed && (
        <div className="mx-2 mt-3 mb-1">
          <button
            onClick={() => setCollapsed(false)}
            title={selectedPortfolio?.label}
            className="w-full flex items-center justify-center p-1.5 rounded-md bg-muted/60 border border-border"
          >
            <Building2 size={13} className={selectedPortfolio?.color} />
          </button>
        </div>
      )}

      {/* Main nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto scrollbar-thin">
        {navGroups.map((group) => (
          <NavGroupSection
            key={group.key}
            group={group}
            collapsed={collapsed}
            pathname={pathname}
            onNavClick={handleNavClick}
            defaultOpen={isGroupDefaultOpen(group) || group.key === 'core'}
          />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-2 py-3 border-t border-border space-y-0.5">
        {/* Help Chat Panel — inline above bottom items */}
        {helpOpen && !collapsed && (
          <div className="mb-2 rounded-xl border border-border overflow-hidden bg-card" style={{ height: '380px' }}>
            <HelpChatPanel embedded onClose={() => setHelpOpen(false)} />
          </div>
        )}

        {/* Help Tab Button */}
        <button
          onClick={() => { if (collapsed) setCollapsed(false); setHelpOpen(v => !v); }}
          title="AI Help Assistant"
          className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-xs font-medium transition-all duration-150 min-h-[40px] ${
            helpOpen ? 'bg-emerald-500/10 text-emerald-700' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <MessageCircle size={15} className={`shrink-0 ${helpOpen ? 'text-emerald-600' : ''}`} />
          {!collapsed && (
            <>
              <span className="truncate flex-1 text-left">Help (AI)</span>
              {helpOpen && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-semibold">Live</span>}
            </>
          )}
        </button>

        {/* Theme Toggle */}
        <ThemeToggle collapsed={collapsed} variant="sidebar" />

        {/* Bell */}
        <div
          className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted transition-all cursor-pointer min-h-[40px]"
          onClick={() => setDrawerOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setDrawerOpen(true)}
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        >
          <div className="relative shrink-0">
            <Bell size={15} className="text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-danger text-[8px] font-bold text-white flex items-center justify-center leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          {!collapsed && (
            <>
              <span className="text-xs font-medium text-muted-foreground truncate flex-1">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-semibold bg-danger/10 text-danger px-1.5 py-0.5 rounded-full ml-auto">
                  {unreadCount}
                </span>
              )}
            </>
          )}
        </div>

        {bottomItems?.map((item) => {
          const ItemIcon = item?.icon;
          const isActive = pathname === item?.href;
          return (
            <Link
              key={item?.key}
              href={item?.href}
              title={collapsed ? item?.label : undefined}
              onClick={handleNavClick}
              className={`relative group flex items-center gap-2.5 px-2 py-2 rounded-md text-xs font-medium transition-all duration-150 min-h-[40px] ${
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <ItemIcon size={15} className="shrink-0" />
              {!collapsed && <span className="truncate">{item?.label}</span>}
            </Link>
          );
        })}

        {/* User avatar */}
        <div className="flex items-center gap-2 px-2 py-2 mt-1 rounded-md hover:bg-muted cursor-pointer transition-all min-h-[40px]">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-semibold shrink-0" aria-hidden="true">
            {userInitials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${roleBadgeColor}`}>{roleLabel}</span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{displayEmail}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="p-1 rounded text-muted-foreground hover:text-danger hover:bg-danger/10 transition-all shrink-0"
            >
              <LogOut size={13} />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={handleSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="w-full flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/10 transition-all min-h-[40px]"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>

      {/* Collapse toggle — desktop only */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden md:flex absolute -right-3 top-[70px] w-6 h-6 rounded-full bg-card border border-border items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150 z-10"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}