import {
  BarChart2, BookOpen, Briefcase, CalendarClock, CreditCard, Download, FileText, GitBranch, Globe, History,
  Kanban, LayoutDashboard, LineChart, List, Map, Megaphone, MessageCircle, MessageSquare, PieChart, Phone,
  Plug, Send, Shield, ShieldCheck, Trophy, UserCheck, UserPlus, Users, Zap, Brain,
} from 'lucide-react';
import type { ElementType } from 'react';
import type { PlanId } from '@/lib/pricing/prospectFinderPlans';

export interface PreviewStats {
  totalLeads: number;
  regulationFriendly: number;
  strEligible: number;
  avgScore: number;
  activeLeads: number;
  actionNeededLeads: number;
  estimatedMonthlyRevenue: number;
  highPriority: number;
  fullyVerified: number;
  unassignedPriority: number;
  assignedLeads: number;
  verifiedOwner: number;
  verifiedNumber: number;
  phoneAvailable: number;
  newLeads: number;
  luxury: { prospects: number; verified: number; phone: number; priority: number; unassigned: number } | null;
  portfolio: string;
  scaleLabel: string;
  scopeBadge?: string;
}

// Illustrative, tier-scaled numbers. Luxury is null on plans without Luxury Lead Access.
export const PLAN_PREVIEW_STATS: Record<PlanId, PreviewStats> = {
  starter: {
    totalLeads: 150, regulationFriendly: 50, strEligible: 82, avgScore: 71, activeLeads: 40,
    actionNeededLeads: 11, estimatedMonthlyRevenue: 17600, highPriority: 10,
    fullyVerified: 52, unassignedPriority: 7, assignedLeads: 112, verifiedOwner: 96,
    verifiedNumber: 84, phoneAvailable: 104, newLeads: 50, luxury: null,
    portfolio: 'Mountain West', scaleLabel: 'Solo agent · 1 market · about 3 months of leads',
  },
  pro: {
    totalLeads: 450, regulationFriendly: 168, strEligible: 270, avgScore: 76, activeLeads: 118,
    actionNeededLeads: 32, estimatedMonthlyRevenue: 64000, highPriority: 36,
    fullyVerified: 160, unassignedPriority: 17, assignedLeads: 368, verifiedOwner: 330,
    verifiedNumber: 300, phoneAvailable: 355, newLeads: 150, luxury: null,
    portfolio: 'All portfolios', scaleLabel: 'Growing team · 3 markets · about 3 months of leads',
  },
  business: {
    totalLeads: 1200, regulationFriendly: 396, strEligible: 690, avgScore: 78, activeLeads: 320,
    actionNeededLeads: 88, estimatedMonthlyRevenue: 172000, highPriority: 90,
    fullyVerified: 430, unassignedPriority: 34, assignedLeads: 960, verifiedOwner: 900,
    verifiedNumber: 820, phoneAvailable: 960, newLeads: 400,
    luxury: { prospects: 96, verified: 41, phone: 68, priority: 22, unassigned: 7 },
    portfolio: 'All portfolios', scaleLabel: 'Multi-agent team · 6 markets · about 3 months of leads',
  },
  enterprise: {
    totalLeads: 4800, regulationFriendly: 1700, strEligible: 2900, avgScore: 84, activeLeads: 1350,
    actionNeededLeads: 310, estimatedMonthlyRevenue: 640000, highPriority: 300,
    fullyVerified: 1800, unassignedPriority: 41, assignedLeads: 4400, verifiedOwner: 4300,
    verifiedNumber: 3900, phoneAvailable: 4400, newLeads: 1600,
    luxury: { prospects: 410, verified: 176, phone: 290, priority: 88, unassigned: 9 },
    portfolio: 'All portfolios', scaleLabel: 'Enterprise rollup · 22 markets · 68 agents · custom allowances',
    scopeBadge: 'Multi-Org Rollup',
  },
};

const STAGE_SHARE: Array<[string, number]> = [
  ['New Lead', 0.4], ['Contacted', 0.24], ['Interested', 0.12], ['Proposal Sent', 0.06],
  ['Under Contract', 0.03], ['Live', 0.02], ['Not a Fit', 0.13],
];
const REG_SHARE: Array<[string, number]> = [
  ['Allowed', 0.33], ['Restricted', 0.27], ['Permit Required', 0.18], ['Primary Residence Required', 0.08],
  ['Review Required', 0.06], ['Prohibited', 0.04], ['Unknown', 0.04],
];

export const stageBreakdownFor = (total: number) => STAGE_SHARE.map(([stage, s]) => ({ stage, count: Math.round(total * s) }));
export const regulationBreakdownFor = (total: number) => REG_SHARE.map(([status, s]) => ({ status, count: Math.round(total * s) }));

export const ANCHOR_PILLS = ['Overview', 'State Regulations', 'Pipeline', 'Top Leads', 'City Regulations', 'Activity', 'Data Sync'];

export const ACTIVITY_SAMPLE: Array<{ text: string; detail: string; when: string; kind: 'reply' | 'assign' | 'stage' | 'luxury' | 'note' }> = [
  { text: 'Reply received from Marcus Delgado', detail: '"Yes, send me the details"', when: '4m ago', kind: 'reply' },
  { text: 'Lead assigned to Priya Shah', detail: '2847 Larimer St, Denver CO', when: '18m ago', kind: 'assign' },
  { text: 'Stage changed to Interested', detail: '118 Music Row, Nashville TN', when: '42m ago', kind: 'stage' },
  { text: 'Luxury lead added', detail: 'Score 92 · owner and phone verified', when: '1h ago', kind: 'luxury' },
  { text: 'Note added by Daniel Ortiz', detail: 'Owner prefers a call after 5pm', when: '2h ago', kind: 'note' },
];

export const ROLLUP_SAMPLE = [
  { org: 'Coastal Stays', markets: 6, agents: 18, leads: 1420, revenue: 188000 },
  { org: 'Mountain Homes Co', markets: 5, agents: 14, leads: 1180, revenue: 164000 },
  { org: 'Sunbelt Rentals', markets: 7, agents: 22, leads: 1510, revenue: 201000 },
  { org: 'Lakeside Hospitality', markets: 4, agents: 14, leads: 690, revenue: 87000 },
];

export interface PreviewNavItem { label: string; icon: ElementType; feature: string | null }
export interface PreviewNavGroup { key: string; label: string; icon: ElementType; items: PreviewNavItem[] }

// Mirrors the real sidebar's group and item names; `feature` ties an item to the plan comparison matrix.
export const PREVIEW_NAV: PreviewNavGroup[] = [
  { key: 'core', label: 'Core', icon: LayoutDashboard, items: [
    { label: 'Dashboard', icon: LayoutDashboard, feature: 'dashboard' },
    { label: 'Executive Overview', icon: PieChart, feature: 'executive_overview' },
    { label: 'Pipeline Board', icon: Kanban, feature: 'pipeline_board' },
    { label: 'Map View', icon: Map, feature: 'map_view' },
    { label: 'Team Chat', icon: MessageCircle, feature: 'team_chat' },
    { label: 'My Profile & Prefs', icon: UserCheck, feature: null },
    { label: 'System Health', icon: Globe, feature: 'system_status' },
  ] },
  { key: 'leads', label: 'Leads & Pipeline', icon: List, items: [
    { label: 'Lead Management', icon: List, feature: 'lead_management' },
    { label: 'Property Report', icon: FileText, feature: 'property_profiles' },
    { label: 'ML Prospect Scoring', icon: Brain, feature: 'property_enrichment' },
  ] },
  { key: 'outreach', label: 'Outreach', icon: Megaphone, items: [
    { label: 'Campaigns', icon: Megaphone, feature: 'text_campaigns' },
    { label: 'Co-Host Pipeline', icon: Briefcase, feature: 'cohost_program' },
    { label: 'Message Templates', icon: MessageSquare, feature: 'follow_up_tools' },
    { label: 'Follow-Up Sequences', icon: GitBranch, feature: 'follow_up_tools' },
    { label: 'SMS Delivery', icon: Send, feature: 'text_campaigns' },
    { label: 'Cadence Engine', icon: Zap, feature: 'automation_rules' },
  ] },
  { key: 'calls', label: 'Calls', icon: Phone, items: [
    { label: 'Live Teleprompter', icon: Phone, feature: 'ai_assisted_workflows' },
    { label: 'Interview Mode', icon: Briefcase, feature: 'ai_interview_assistant' },
    { label: 'Interview Calendar', icon: CalendarClock, feature: 'interview_calendar' },
    { label: 'Candidate Pipeline', icon: Kanban, feature: 'ai_interview_assistant' },
    { label: 'Call Analytics', icon: BarChart2, feature: 'advanced_analytics' },
  ] },
  { key: 'analytics', label: 'Analytics & Reports', icon: LineChart, items: [
    { label: 'Analytics', icon: LineChart, feature: 'advanced_analytics' },
    { label: 'Advanced Reports', icon: BarChart2, feature: 'advanced_analytics' },
    { label: 'City Regulations / STR', icon: Shield, feature: 'lead_management' },
    { label: 'CSV Export', icon: Download, feature: 'csv_imports' },
    { label: 'Audit Trail', icon: History, feature: 'audit_logs' },
  ] },
  { key: 'agents', label: 'Agents & Team', icon: Users, items: [
    { label: 'Agent Management', icon: UserPlus, feature: 'team_members' },
    { label: 'Agent Leaderboard', icon: Trophy, feature: 'team_members' },
    { label: 'Agent Workload Board', icon: BarChart2, feature: 'lead_assignment' },
    { label: 'Roles & Permissions', icon: ShieldCheck, feature: 'custom_roles' },
  ] },
  { key: 'tools', label: 'Tools & Admin', icon: Plug, items: [
    { label: 'AI Features', icon: Brain, feature: 'ai_assisted_workflows' },
    { label: 'Workflows', icon: GitBranch, feature: 'bulk_workflows' },
    { label: 'Integration Hub', icon: Plug, feature: 'api_access' },
    { label: 'Subscription & Billing', icon: CreditCard, feature: null },
    { label: 'Help Center', icon: BookOpen, feature: null },
  ] },
];
