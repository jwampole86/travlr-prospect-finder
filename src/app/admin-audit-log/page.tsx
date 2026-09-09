'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { ShieldCheck, Search, Filter, Download, RefreshCw, ChevronDown, ChevronRight, User, Clock, Eye, EyeOff, X, Calendar, Layers, AlertTriangle, Settings, CreditCard, Users, Zap, Key, CheckSquare, Plug, Edit3, ArrowLeftRight, Building2, Globe, Lock, Unlock, FileText, CheckCircle, XCircle, AlertCircle, Shield, ClipboardList, Info } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type ActionCategory =
  | 'lead_change' | 'cadence_edit' | 'bulk_operation' | 'integration_change' |'billing_update'| 'permission_grant' | 'user_management' | 'settings_change' |'cross_tenant_access' | 'data_export';

type TabId = 'log' | 'cross_tenant' | 'compliance';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_email: string;
  user_name: string;
  user_role: string;
  org_id: string;
  org_name: string;
  action_type: string;
  category: ActionCategory;
  target_entity: string;
  target_id?: string;
  target_org_id?: string;
  target_org_name?: string;
  description: string;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  ip_address: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cross_tenant: boolean;
  authorized: boolean;
}

interface CrossTenantEvent {
  id: string;
  timestamp: string;
  actor_email: string;
  actor_role: string;
  source_org: string;
  target_org: string;
  action: string;
  resource: string;
  authorized: boolean;
  justification?: string;
  ip_address: string;
}

interface ComplianceControl {
  id: string;
  framework: 'GDPR' | 'SOC2';
  control: string;
  description: string;
  status: 'pass' | 'fail' | 'warning' | 'na';
  evidence: string;
  last_checked: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const ORGS = [
  { id: 'org-001', name: 'Travlr HQ' },
  { id: 'org-002', name: 'Austin Portfolio' },
  { id: 'org-003', name: 'Denver Properties' },
  { id: 'org-004', name: 'Miami Rentals' },
];

const MOCK_ENTRIES: AuditLogEntry[] = [
  {
    id: 'al-001', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    user_email: 'admin@travlr.com', user_name: 'Admin User', user_role: 'Owner',
    org_id: 'org-001', org_name: 'Travlr HQ',
    action_type: 'PERMISSION_GRANTED', category: 'permission_grant',
    target_entity: 'User: Sarah Mitchell', target_id: 'u1',
    description: 'Granted Bulk Actions permission to agent Sarah Mitchell',
    before_data: { perm_bulk_actions: false }, after_data: { perm_bulk_actions: true },
    ip_address: '192.168.1.10', severity: 'high', cross_tenant: false, authorized: true,
  },
  {
    id: 'al-002', timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    user_email: 'sarah@travlr.com', user_name: 'Sarah Mitchell', user_role: 'Agent',
    org_id: 'org-002', org_name: 'Austin Portfolio',
    action_type: 'LEAD_STAGE_CHANGED', category: 'lead_change',
    target_entity: 'Lead: 123 Oak Street, Austin TX', target_id: 'lead-abc',
    description: 'Stage changed from Prospect to Qualified',
    before_data: { stage: 'Prospect', score: 62 }, after_data: { stage: 'Qualified', score: 78 },
    ip_address: '192.168.1.22', severity: 'low', cross_tenant: false, authorized: true,
  },
  {
    id: 'al-003', timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    user_email: 'admin@travlr.com', user_name: 'Admin User', user_role: 'Owner',
    org_id: 'org-001', org_name: 'Travlr HQ',
    action_type: 'CROSS_TENANT_READ', category: 'cross_tenant_access',
    target_entity: 'Lead Records: Denver Properties', target_id: undefined,
    target_org_id: 'org-003', target_org_name: 'Denver Properties',
    description: 'Admin accessed lead records across org boundary (Denver Properties)',
    before_data: null, after_data: { records_accessed: 12, org: 'Denver Properties' },
    ip_address: '192.168.1.10', severity: 'critical', cross_tenant: true, authorized: true,
  },
  {
    id: 'al-004', timestamp: new Date(Date.now() - 1000 * 60 * 72).toISOString(),
    user_email: 'admin@travlr.com', user_name: 'Admin User', user_role: 'Owner',
    org_id: 'org-001', org_name: 'Travlr HQ',
    action_type: 'INTEGRATION_CONNECTED', category: 'integration_change',
    target_entity: 'Integration: Twilio', target_id: 'twilio',
    description: 'Connected Twilio integration with new account SID',
    before_data: { status: 'disconnected', account_sid: null },
    after_data: { status: 'connected', account_sid: 'AC***masked***' },
    ip_address: '192.168.1.10', severity: 'critical', cross_tenant: false, authorized: true,
  },
  {
    id: 'al-005', timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    user_email: 'james@travlr.com', user_name: 'James Torres', user_role: 'Team Lead',
    org_id: 'org-002', org_name: 'Austin Portfolio',
    action_type: 'CROSS_TENANT_WRITE', category: 'cross_tenant_access',
    target_entity: 'Lead Assignment: Miami Rentals', target_id: undefined,
    target_org_id: 'org-004', target_org_name: 'Miami Rentals',
    description: 'Attempted cross-org lead assignment — BLOCKED: insufficient permissions',
    before_data: null, after_data: { attempted_action: 'lead_assign', blocked: true },
    ip_address: '192.168.1.33', severity: 'critical', cross_tenant: true, authorized: false,
  },
  {
    id: 'al-006', timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    user_email: 'admin@travlr.com', user_name: 'Admin User', user_role: 'Owner',
    org_id: 'org-001', org_name: 'Travlr HQ',
    action_type: 'PLAN_UPGRADED', category: 'billing_update',
    target_entity: 'Subscription Plan', target_id: 'sub-001',
    description: 'Subscription upgraded from Starter to Growth plan',
    before_data: { plan: 'Starter', seats: 5, monthly_cost: 99 },
    after_data: { plan: 'Growth', seats: 15, monthly_cost: 299 },
    ip_address: '192.168.1.10', severity: 'critical', cross_tenant: false, authorized: true,
  },
  {
    id: 'al-007', timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    user_email: 'admin@travlr.com', user_name: 'Admin User', user_role: 'Owner',
    org_id: 'org-001', org_name: 'Travlr HQ',
    action_type: 'DATA_EXPORT', category: 'data_export',
    target_entity: 'Lead Export: Austin Portfolio (847 records)',
    description: 'Bulk data export of 847 lead records from Austin Portfolio',
    before_data: null, after_data: { records: 847, format: 'CSV', org: 'Austin Portfolio' },
    ip_address: '192.168.1.10', severity: 'high', cross_tenant: false, authorized: true,
  },
  {
    id: 'al-008', timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    user_email: 'james@travlr.com', user_name: 'James Torres', user_role: 'Team Lead',
    org_id: 'org-002', org_name: 'Austin Portfolio',
    action_type: 'CADENCE_EDITED', category: 'cadence_edit',
    target_entity: 'Cadence: Initial Outreach Sequence', target_id: 'cad-001',
    description: 'Modified step 3 delay from 3 days to 5 days',
    before_data: { step: 3, delay_days: 3 }, after_data: { step: 3, delay_days: 5 },
    ip_address: '192.168.1.33', severity: 'medium', cross_tenant: false, authorized: true,
  },
  {
    id: 'al-009', timestamp: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    user_email: 'admin@travlr.com', user_name: 'Admin User', user_role: 'Owner',
    org_id: 'org-001', org_name: 'Travlr HQ',
    action_type: 'USER_ROLE_CHANGED', category: 'user_management',
    target_entity: 'User: James Torres', target_id: 'u2',
    description: 'Role changed from Agent to Team Lead',
    before_data: { role: 'Agent' }, after_data: { role: 'Team Lead' },
    ip_address: '192.168.1.10', severity: 'high', cross_tenant: false, authorized: true,
  },
  {
    id: 'al-010', timestamp: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    user_email: 'priya@travlr.com', user_name: 'Priya Sharma', user_role: 'Analyst',
    org_id: 'org-003', org_name: 'Denver Properties',
    action_type: 'CROSS_TENANT_READ', category: 'cross_tenant_access',
    target_entity: 'Reports: Austin Portfolio', target_id: undefined,
    target_org_id: 'org-002', target_org_name: 'Austin Portfolio',
    description: 'Analyst accessed cross-org performance reports (Austin Portfolio)',
    before_data: null, after_data: { report_type: 'performance', org: 'Austin Portfolio' },
    ip_address: '192.168.1.55', severity: 'high', cross_tenant: true, authorized: true,
  },
  {
    id: 'al-011', timestamp: new Date(Date.now() - 1000 * 60 * 720).toISOString(),
    user_email: 'admin@travlr.com', user_name: 'Admin User', user_role: 'Owner',
    org_id: 'org-001', org_name: 'Travlr HQ',
    action_type: 'API_KEY_REVOKED', category: 'integration_change',
    target_entity: 'Integration: Resend', target_id: 'resend',
    description: 'Revoked and rotated Resend API key',
    before_data: { key_prefix: 're_old_***', status: 'active' },
    after_data: { key_prefix: 're_new_***', status: 'active' },
    ip_address: '192.168.1.10', severity: 'critical', cross_tenant: false, authorized: true,
  },
  {
    id: 'al-012', timestamp: new Date(Date.now() - 1000 * 60 * 1440).toISOString(),
    user_email: 'admin@travlr.com', user_name: 'Admin User', user_role: 'Owner',
    org_id: 'org-001', org_name: 'Travlr HQ',
    action_type: 'SETTINGS_UPDATED', category: 'settings_change',
    target_entity: 'Operator Settings', target_id: 'settings-001',
    description: 'Updated default lead assignment strategy to round-robin',
    before_data: { assignment_strategy: 'manual' }, after_data: { assignment_strategy: 'round_robin' },
    ip_address: '192.168.1.10', severity: 'medium', cross_tenant: false, authorized: true,
  },
];

const MOCK_CROSS_TENANT: CrossTenantEvent[] = [
  {
    id: 'ct-001', timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    actor_email: 'admin@travlr.com', actor_role: 'Owner',
    source_org: 'Travlr HQ', target_org: 'Denver Properties',
    action: 'READ', resource: 'Lead Records (12 records)',
    authorized: true, justification: 'Portfolio audit — admin override',
    ip_address: '192.168.1.10',
  },
  {
    id: 'ct-002', timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    actor_email: 'james@travlr.com', actor_role: 'Team Lead',
    source_org: 'Austin Portfolio', target_org: 'Miami Rentals',
    action: 'WRITE', resource: 'Lead Assignment',
    authorized: false, justification: undefined,
    ip_address: '192.168.1.33',
  },
  {
    id: 'ct-003', timestamp: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    actor_email: 'priya@travlr.com', actor_role: 'Analyst',
    source_org: 'Denver Properties', target_org: 'Austin Portfolio',
    action: 'READ', resource: 'Performance Reports',
    authorized: true, justification: 'Cross-portfolio analytics — analyst access granted',
    ip_address: '192.168.1.55',
  },
  {
    id: 'ct-004', timestamp: new Date(Date.now() - 1000 * 60 * 900).toISOString(),
    actor_email: 'admin@travlr.com', actor_role: 'Owner',
    source_org: 'Travlr HQ', target_org: 'Miami Rentals',
    action: 'READ', resource: 'Billing Records',
    authorized: true, justification: 'Billing reconciliation — owner access',
    ip_address: '192.168.1.10',
  },
];

const MOCK_COMPLIANCE: ComplianceControl[] = [
  // GDPR
  { id: 'gdpr-1', framework: 'GDPR', control: 'Art. 5(1)(f) — Data Integrity & Confidentiality', description: 'Personal data processed with appropriate security, preventing unauthorized access', status: 'pass', evidence: 'RLS policies enforced on all lead tables; org_id isolation verified in 100% of queries', last_checked: new Date(Date.now() - 3600000).toISOString() },
  { id: 'gdpr-2', framework: 'GDPR', control: 'Art. 25 — Data Protection by Design', description: 'Tenant isolation enforced at database level, not application layer', status: 'pass', evidence: 'Supabase RLS with org_id column on leads, profiles, and audit tables', last_checked: new Date(Date.now() - 3600000).toISOString() },
  { id: 'gdpr-3', framework: 'GDPR', control: 'Art. 30 — Records of Processing Activities', description: 'Audit log captures all data processing activities with actor, timestamp, and scope', status: 'pass', evidence: '12 audit events logged in last 24h; all include user, org, IP, and before/after state', last_checked: new Date(Date.now() - 1800000).toISOString() },
  { id: 'gdpr-4', framework: 'GDPR', control: 'Art. 32 — Security of Processing', description: 'Cross-tenant access attempts logged and blocked where unauthorized', status: 'warning', evidence: '1 unauthorized cross-tenant write attempt detected (james@travlr.com → Miami Rentals) — blocked but not yet reviewed', last_checked: new Date(Date.now() - 900000).toISOString() },
  { id: 'gdpr-5', framework: 'GDPR', control: 'Art. 33 — Breach Notification Readiness', description: 'Incident timeline and alert system in place for breach detection', status: 'pass', evidence: 'Ops monitoring dashboard active; critical alerts trigger within 60s', last_checked: new Date(Date.now() - 3600000).toISOString() },
  { id: 'gdpr-6', framework: 'GDPR', control: 'Art. 17 — Right to Erasure', description: 'Data deletion workflows documented and accessible', status: 'warning', evidence: 'Manual deletion process exists; automated erasure workflow not yet implemented', last_checked: new Date(Date.now() - 7200000).toISOString() },
  // SOC2
  { id: 'soc2-1', framework: 'SOC2', control: 'CC6.1 — Logical Access Controls', description: 'Access to data restricted by role and org boundary', status: 'pass', evidence: 'RBAC enforced: Owner/Team Lead/Agent/Analyst roles with feature-level permissions; org_id isolation active', last_checked: new Date(Date.now() - 3600000).toISOString() },
  { id: 'soc2-2', framework: 'SOC2', control: 'CC6.2 — Authentication', description: 'Multi-factor authentication and session management', status: 'pass', evidence: 'Supabase Auth with JWT sessions; login events logged in audit trail', last_checked: new Date(Date.now() - 3600000).toISOString() },
  { id: 'soc2-3', framework: 'SOC2', control: 'CC6.3 — Authorization', description: 'Users authorized only for resources within their org boundary', status: 'warning', evidence: '1 cross-tenant write attempt blocked; review required to confirm no data leakage occurred', last_checked: new Date(Date.now() - 900000).toISOString() },
  { id: 'soc2-4', framework: 'SOC2', control: 'CC7.2 — System Monitoring', description: 'Continuous monitoring of system operations and anomalies', status: 'pass', evidence: 'Ops monitoring dashboard with 15s refresh; 4 active alert rules; incident timeline maintained', last_checked: new Date(Date.now() - 1800000).toISOString() },
  { id: 'soc2-5', framework: 'SOC2', control: 'CC8.1 — Change Management', description: 'All configuration and integration changes logged with before/after state', status: 'pass', evidence: 'Integration changes, billing updates, and permission grants all captured with full diff', last_checked: new Date(Date.now() - 3600000).toISOString() },
  { id: 'soc2-6', framework: 'SOC2', control: 'CC9.2 — Vendor Risk Management', description: 'Third-party integrations (Twilio, Resend, DocuSign) monitored and access logged', status: 'pass', evidence: 'API key rotation logged; integration status tracked in ops dashboard; credential manager active', last_checked: new Date(Date.now() - 3600000).toISOString() },
  { id: 'soc2-7', framework: 'SOC2', control: 'A1.2 — Availability Monitoring', description: 'System availability tracked and incidents documented', status: 'pass', evidence: 'Supabase DB uptime 99.98%; API latency p50 142ms; cron job health monitored', last_checked: new Date(Date.now() - 1800000).toISOString() },
  { id: 'soc2-8', framework: 'SOC2', control: 'PI1.4 — Data Accuracy', description: 'Data processing integrity verified through audit trail', status: 'pass', evidence: 'Before/after diffs captured for all lead and config changes; no unexplained mutations detected', last_checked: new Date(Date.now() - 3600000).toISOString() },
];

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<ActionCategory, { label: string; icon: React.ElementType; color: string }> = {
  lead_change:        { label: 'Lead Change',       icon: Edit3,        color: 'bg-blue-500/10 text-blue-700 border-blue-200' },
  cadence_edit:       { label: 'Cadence Edit',      icon: Zap,          color: 'bg-violet-500/10 text-violet-700 border-violet-200' },
  bulk_operation:     { label: 'Bulk Operation',    icon: CheckSquare,  color: 'bg-amber-500/10 text-amber-700 border-amber-200' },
  integration_change: { label: 'Integration',       icon: Plug,         color: 'bg-cyan-500/10 text-cyan-700 border-cyan-200' },
  billing_update:     { label: 'Billing',           icon: CreditCard,   color: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  permission_grant:   { label: 'Permission',        icon: Key,          color: 'bg-rose-500/10 text-rose-700 border-rose-200' },
  user_management:    { label: 'User Mgmt',         icon: Users,        color: 'bg-indigo-500/10 text-indigo-700 border-indigo-200' },
  settings_change:    { label: 'Settings',          icon: Settings,     color: 'bg-slate-500/10 text-slate-700 border-slate-200' },
  cross_tenant_access:{ label: 'Cross-Tenant',      icon: Globe,        color: 'bg-orange-500/10 text-orange-700 border-orange-200' },
  data_export:        { label: 'Data Export',       icon: Download,     color: 'bg-teal-500/10 text-teal-700 border-teal-200' },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  low:      { label: 'Low',      color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
  medium:   { label: 'Medium',   color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
  high:     { label: 'High',     color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
};

const COMPLIANCE_STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pass:    { label: 'Pass',    color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle },
  fail:    { label: 'Fail',    color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         icon: XCircle },
  warning: { label: 'Review',  color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     icon: AlertCircle },
  na:      { label: 'N/A',     color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',       icon: Info },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── DiffPanel ────────────────────────────────────────────────────────────────

function DiffPanel({ before, after }: { before: Record<string, unknown> | null | undefined; after: Record<string, unknown> | null | undefined }) {
  const allKeys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  if (allKeys.length === 0) return <p className="text-[11px] text-muted-foreground italic">No structured diff available</p>;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Before
        </p>
        <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 space-y-1">
          {before ? allKeys.map(k => (
            <div key={k} className="flex items-start gap-2">
              <span className="text-[10px] font-mono text-red-500 shrink-0">{k}:</span>
              <span className="text-[10px] font-mono text-red-700 break-all">{String(before[k] ?? '—')}</span>
            </div>
          )) : <p className="text-[10px] text-muted-foreground italic">No prior state</p>}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />After
        </p>
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5 space-y-1">
          {after ? allKeys.map(k => (
            <div key={k} className="flex items-start gap-2">
              <span className="text-[10px] font-mono text-emerald-600 shrink-0">{k}:</span>
              <span className="text-[10px] font-mono text-emerald-800 break-all">{String(after[k] ?? '—')}</span>
            </div>
          )) : <p className="text-[10px] text-muted-foreground italic">No new state</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Cross-Tenant Tab ─────────────────────────────────────────────────────────

function CrossTenantTab({ entries }: { entries: AuditLogEntry[] }) {
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [authFilter, setAuthFilter] = useState<string>('all');

  const crossTenantEntries = entries.filter(e => e.cross_tenant);
  const filtered = MOCK_CROSS_TENANT.filter(e => {
    if (orgFilter !== 'all' && e.source_org !== orgFilter && e.target_org !== orgFilter) return false;
    if (authFilter === 'authorized' && !e.authorized) return false;
    if (authFilter === 'blocked' && e.authorized) return false;
    return true;
  });

  const blockedCount = MOCK_CROSS_TENANT.filter(e => !e.authorized).length;
  const authorizedCount = MOCK_CROSS_TENANT.filter(e => e.authorized).length;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="max-w-4xl space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Cross-Tenant Events', value: MOCK_CROSS_TENANT.length, color: 'text-foreground', bg: 'bg-card border-border' },
            { label: 'Authorized Access', value: authorizedCount, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
            { label: 'Blocked Attempts', value: blockedCount, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
            { label: 'Orgs Involved', value: 4, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
          ].map(s => (
            <div key={s.label} className={`border rounded-xl px-4 py-3 ${s.bg}`}>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 size={12} />
            <span>Filter by org:</span>
          </div>
          {['all', ...ORGS.map(o => o.name)].map(org => (
            <button
              key={org}
              onClick={() => setOrgFilter(org)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${orgFilter === org ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-foreground hover:bg-muted'}`}
            >
              {org === 'all' ? 'All Orgs' : org}
            </button>
          ))}
          <div className="ml-2 flex items-center gap-1.5">
            {['all', 'authorized', 'blocked'].map(f => (
              <button
                key={f}
                onClick={() => setAuthFilter(f)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${authFilter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-foreground hover:bg-muted'}`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Events Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Globe size={14} className="text-orange-500" />
            <span className="text-sm font-semibold text-foreground">Cross-Tenant Access Events</span>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} events</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map(event => (
              <div key={event.id} className={`px-4 py-3.5 ${!event.authorized ? 'bg-red-50/50' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${event.authorized ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {event.authorized ? <Lock size={13} /> : <Unlock size={13} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">{event.actor_email}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{event.actor_role}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${event.authorized ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {event.authorized ? '✓ Authorized' : '✗ Blocked'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{event.source_org}</span>
                      <ArrowLeftRight size={10} />
                      <span className="font-medium text-foreground">{event.target_org}</span>
                      <span className="text-border">·</span>
                      <span>{event.action}</span>
                      <span className="text-border">·</span>
                      <span>{event.resource}</span>
                    </div>
                    {event.justification && (
                      <p className="text-[11px] text-muted-foreground mt-1 italic">"{event.justification}"</p>
                    )}
                    {!event.authorized && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">⚠ Unauthorized access attempt — requires security review</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-muted-foreground">{timeAgo(event.timestamp)}</div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{event.ip_address}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Org Boundary Matrix */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Organization Boundary Matrix</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">From \ To</th>
                  {ORGS.map(o => <th key={o.id} className="text-center py-2 px-3 text-muted-foreground font-medium">{o.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {ORGS.map(fromOrg => (
                  <tr key={fromOrg.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 font-medium text-foreground">{fromOrg.name}</td>
                    {ORGS.map(toOrg => {
                      const isSelf = fromOrg.id === toOrg.id;
                      const events = MOCK_CROSS_TENANT.filter(e => e.source_org === fromOrg.name && e.target_org === toOrg.name);
                      const hasBlocked = events.some(e => !e.authorized);
                      return (
                        <td key={toOrg.id} className="text-center py-2 px-3">
                          {isSelf ? (
                            <span className="text-muted-foreground/40">—</span>
                          ) : events.length > 0 ? (
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${hasBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {events.length}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30 text-[10px]">0</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Numbers show cross-tenant access events. Red = blocked attempt detected.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Compliance Tab ───────────────────────────────────────────────────────────

function ComplianceTab() {
  const [framework, setFramework] = useState<'all' | 'GDPR' | 'SOC2'>('all');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);

  const filtered = MOCK_COMPLIANCE.filter(c => framework === 'all' || c.framework === framework);
  const passCount = filtered.filter(c => c.status === 'pass').length;
  const warnCount = filtered.filter(c => c.status === 'warning').length;
  const failCount = filtered.filter(c => c.status === 'fail').length;
  const score = Math.round((passCount / filtered.length) * 100);

  const gdprControls = MOCK_COMPLIANCE.filter(c => c.framework === 'GDPR');
  const soc2Controls = MOCK_COMPLIANCE.filter(c => c.framework === 'SOC2');
  const gdprPass = gdprControls.filter(c => c.status === 'pass').length;
  const soc2Pass = soc2Controls.filter(c => c.status === 'pass').length;

  function handleGenerateReport() {
    setGeneratingReport(true);
    setTimeout(() => { setGeneratingReport(false); setReportGenerated(true); }, 1800);
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="max-w-4xl space-y-4">
        {/* Score Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4 col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={14} className="text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overall Score</span>
            </div>
            <div className={`text-4xl font-bold ${score >= 90 ? 'text-emerald-600' : score >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{score}%</div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${score >= 90 ? 'bg-emerald-500' : score >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${score}%` }} />
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
              <span className="text-emerald-600 font-medium">{passCount} pass</span>
              <span className="text-amber-600 font-medium">{warnCount} review</span>
              <span className="text-red-600 font-medium">{failCount} fail</span>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">GDPR</span>
            </div>
            <div className="text-3xl font-bold text-foreground mt-1">{Math.round((gdprPass / gdprControls.length) * 100)}%</div>
            <div className="text-xs text-muted-foreground mt-1">{gdprPass}/{gdprControls.length} controls passing</div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((gdprPass / gdprControls.length) * 100)}%` }} />
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded">SOC2</span>
            </div>
            <div className="text-3xl font-bold text-foreground mt-1">{Math.round((soc2Pass / soc2Controls.length) * 100)}%</div>
            <div className="text-xs text-muted-foreground mt-1">{soc2Pass}/{soc2Controls.length} controls passing</div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.round((soc2Pass / soc2Controls.length) * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Generate Report Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 border border-border rounded-lg overflow-hidden">
            {(['all', 'GDPR', 'SOC2'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFramework(f)}
                className={`px-3 py-1.5 text-xs font-medium transition-all ${framework === f ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted'}`}
              >
                {f === 'all' ? 'All Frameworks' : f}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={generatingReport}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-60"
          >
            {generatingReport ? (
              <><RefreshCw size={12} className="animate-spin" />Generating…</>
            ) : reportGenerated ? (
              <><CheckCircle size={12} />Report Ready — Download</>
            ) : (
              <><FileText size={12} />Generate Compliance Report</>
            )}
          </button>
        </div>

        {reportGenerated && (
          <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
            <CheckCircle size={14} />
            <span className="font-medium">Compliance report generated</span>
            <span className="text-emerald-600">— GDPR/SOC2 Isolation Compliance Report · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {filtered.length} controls evaluated</span>
          </div>
        )}

        {/* Controls List */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <ClipboardList size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Compliance Controls</span>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} controls</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map(control => {
              const cfg = COMPLIANCE_STATUS[control.status];
              const Icon = cfg.icon;
              return (
                <div key={control.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${cfg.bg}`}>
                      <Icon size={13} className={cfg.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${control.framework === 'GDPR' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>
                          {control.framework}
                        </span>
                        <span className="text-xs font-semibold text-foreground">{control.control}</span>
                        <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{control.description}</p>
                      <div className="mt-1.5 p-2 bg-muted/50 rounded-lg">
                        <p className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">Evidence: </span>{control.evidence}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Last checked: {timeAgo(control.last_checked)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter Options ───────────────────────────────────────────────────────────

const CATEGORY_FILTER_OPTIONS: { value: ActionCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'lead_change', label: 'Lead Changes' },
  { value: 'cadence_edit', label: 'Cadence Edits' },
  { value: 'bulk_operation', label: 'Bulk Operations' },
  { value: 'integration_change', label: 'Integration Changes' },
  { value: 'billing_update', label: 'Billing Updates' },
  { value: 'permission_grant', label: 'Permission Grants' },
  { value: 'user_management', label: 'User Management' },
  { value: 'settings_change', label: 'Settings Changes' },
  { value: 'cross_tenant_access', label: 'Cross-Tenant Access' },
  { value: 'data_export', label: 'Data Exports' },
];

const SEVERITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAuditLogPage() {
  const [entries] = useState<AuditLogEntry[]>(MOCK_ENTRIES);
  const [activeTab, setActiveTab] = useState<TabId>('log');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ActionCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCatMenu, setShowCatMenu] = useState(false);
  const [showSevMenu, setShowSevMenu] = useState(false);
  const [showOrgMenu, setShowOrgMenu] = useState(false);
  const [showDiff, setShowDiff] = useState<Record<string, boolean>>({});

  const filtered = entries.filter(e => {
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
    if (orgFilter !== 'all' && e.org_id !== orgFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.user_name.toLowerCase().includes(q) ||
        e.user_email.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.action_type.toLowerCase().includes(q) ||
        e.target_entity.toLowerCase().includes(q) ||
        e.org_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const grouped = filtered.reduce<Record<string, AuditLogEntry[]>>((acc, e) => {
    const date = new Date(e.timestamp).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(e);
    return acc;
  }, {});

  const criticalCount = entries.filter(e => e.severity === 'critical').length;
  const crossTenantCount = entries.filter(e => e.cross_tenant).length;
  const blockedCount = entries.filter(e => e.cross_tenant && !e.authorized).length;

  const TABS: { id: TabId; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'log', label: 'Audit Log', icon: ShieldCheck },
    { id: 'cross_tenant', label: 'Cross-Tenant Access', icon: Globe, badge: crossTenantCount },
    { id: 'compliance', label: 'GDPR/SOC2 Report', icon: FileText },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <ShieldCheck size={16} className="text-rose-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Admin Audit Log</h1>
              <p className="text-xs text-muted-foreground">Cross-tenant verification · org-boundary filtering · GDPR/SOC2 compliance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {blockedCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
                <Lock size={11} />
                {blockedCount} blocked access
              </span>
            )}
            {criticalCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-medium">
                <AlertTriangle size={11} />
                {criticalCount} critical
              </span>
            )}
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted transition-all">
              <Download size={12} />Export CSV
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted transition-all">
              <RefreshCw size={12} />Refresh
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="flex items-center gap-4 px-6 py-2.5 border-b border-border bg-muted/30 shrink-0 flex-wrap">
          {[
            { label: 'Total Events', value: entries.length, color: 'text-foreground' },
            { label: 'Critical', value: criticalCount, color: 'text-red-600' },
            { label: 'Cross-Tenant', value: crossTenantCount, color: 'text-orange-600' },
            { label: 'Blocked', value: blockedCount, color: 'text-red-700' },
            { label: 'Filtered', value: filtered.length, color: 'text-primary' },
          ].map(stat => (
            <div key={stat.label} className="flex items-center gap-1.5">
              <span className={`text-sm font-bold ${stat.color}`}>{stat.value}</span>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <span className="text-border ml-2">|</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-border bg-card shrink-0">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-all ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <Icon size={12} />
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">{tab.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'log' && (
          <>
            {/* Filters */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card/50 shrink-0 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by user, action, entity, org…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Org Filter */}
              <div className="relative">
                <button
                  onClick={() => { setShowOrgMenu(v => !v); setShowCatMenu(false); setShowSevMenu(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted transition-all"
                >
                  <Building2 size={12} />
                  {orgFilter === 'all' ? 'All Orgs' : ORGS.find(o => o.id === orgFilter)?.name}
                  <ChevronDown size={11} className="text-muted-foreground" />
                </button>
                {showOrgMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-20 min-w-[180px] overflow-hidden">
                    <button onClick={() => { setOrgFilter('all'); setShowOrgMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-all ${orgFilter === 'all' ? 'text-primary font-semibold' : 'text-foreground'}`}>All Organizations</button>
                    {ORGS.map(org => (
                      <button key={org.id} onClick={() => { setOrgFilter(org.id); setShowOrgMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-all ${orgFilter === org.id ? 'text-primary font-semibold' : 'text-foreground'}`}>{org.name}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category Filter */}
              <div className="relative">
                <button
                  onClick={() => { setShowCatMenu(v => !v); setShowSevMenu(false); setShowOrgMenu(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted transition-all"
                >
                  <Layers size={12} />
                  {CATEGORY_FILTER_OPTIONS.find(o => o.value === categoryFilter)?.label}
                  <ChevronDown size={11} className="text-muted-foreground" />
                </button>
                {showCatMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-20 min-w-[200px] overflow-hidden">
                    {CATEGORY_FILTER_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => { setCategoryFilter(opt.value as ActionCategory | 'all'); setShowCatMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-all ${categoryFilter === opt.value ? 'text-primary font-semibold' : 'text-foreground'}`}>{opt.label}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Severity Filter */}
              <div className="relative">
                <button
                  onClick={() => { setShowSevMenu(v => !v); setShowCatMenu(false); setShowOrgMenu(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted transition-all"
                >
                  <AlertTriangle size={12} />
                  {SEVERITY_FILTER_OPTIONS.find(o => o.value === severityFilter)?.label}
                  <ChevronDown size={11} className="text-muted-foreground" />
                </button>
                {showSevMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-20 min-w-[150px] overflow-hidden">
                    {SEVERITY_FILTER_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => { setSeverityFilter(opt.value); setShowSevMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-all ${severityFilter === opt.value ? 'text-primary font-semibold' : 'text-foreground'}`}>{opt.label}</button>
                    ))}
                  </div>
                )}
              </div>

              {(categoryFilter !== 'all' || severityFilter !== 'all' || orgFilter !== 'all' || search) && (
                <button onClick={() => { setCategoryFilter('all'); setSeverityFilter('all'); setOrgFilter('all'); setSearch(''); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <X size={11} />Clear filters
                </button>
              )}
            </div>

            {/* Log Entries */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <ShieldCheck size={20} className="text-muted-foreground" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No audit events match your filters</p>
                  <p className="text-xs text-muted-foreground">Try adjusting your search or filter criteria.</p>
                </div>
              ) : (
                <div className="max-w-4xl space-y-6">
                  {Object.entries(grouped).map(([date, dayEntries]) => (
                    <div key={date}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar size={10} />{date}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <div className="space-y-2">
                        {dayEntries.map(entry => {
                          const catCfg = CATEGORY_CONFIG[entry.category];
                          const sevCfg = SEVERITY_CONFIG[entry.severity];
                          const CatIcon = catCfg.icon;
                          const isExpanded = expandedId === entry.id;
                          const hasDiff = !!(entry.before_data || entry.after_data);

                          return (
                            <div key={entry.id} className={`border rounded-xl overflow-hidden transition-all ${entry.cross_tenant && !entry.authorized ? 'border-red-300 bg-red-50/30' : isExpanded ? 'border-primary/30 shadow-sm' : 'border-border'}`}>
                              <div className="flex items-start gap-3 p-3.5 cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${catCfg.color}`}>
                                  <CatIcon size={13} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-xs font-semibold text-foreground leading-snug">{entry.description}</p>
                                        {entry.cross_tenant && (
                                          <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${entry.authorized ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                                            {entry.authorized ? <Globe size={9} /> : <Lock size={9} />}
                                            {entry.authorized ? 'Cross-Tenant' : 'BLOCKED'}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{entry.target_entity}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${catCfg.color}`}>{catCfg.label}</span>
                                      <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sevCfg.color}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${sevCfg.dot}`} />
                                        {sevCfg.label}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <User size={10} />
                                      <span className="font-medium text-foreground">{entry.user_name}</span>
                                      <span className="text-[10px] px-1 py-0.5 rounded bg-muted">{entry.user_role}</span>
                                    </span>
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Building2 size={10} />
                                      <span className="font-medium text-foreground">{entry.org_name}</span>
                                    </span>
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Clock size={10} />
                                      {timeAgo(entry.timestamp)} · {formatTimestamp(entry.timestamp)}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground font-mono">{entry.ip_address}</span>
                                  </div>
                                </div>
                                <ChevronRight size={14} className={`text-muted-foreground shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              </div>

                              {isExpanded && (
                                <div className="border-t border-border bg-muted/10 px-4 py-3 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Event Detail</p>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono text-muted-foreground">ID: {entry.id}</span>
                                      <span className="text-[10px] font-mono text-muted-foreground">Action: {entry.action_type}</span>
                                    </div>
                                  </div>
                                  {entry.target_org_name && (
                                    <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                                      <Globe size={11} className="text-orange-500" />
                                      <span className="text-[11px] text-orange-700">Cross-tenant: <span className="font-semibold">{entry.org_name}</span> → <span className="font-semibold">{entry.target_org_name}</span></span>
                                    </div>
                                  )}
                                  {hasDiff && (
                                    <div>
                                      <div className="flex items-center justify-between mb-2">
                                        <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                                          <ArrowLeftRight size={11} className="text-primary" />Before / After Diff
                                        </p>
                                        <button onClick={e => { e.stopPropagation(); setShowDiff(prev => ({ ...prev, [entry.id]: !prev[entry.id] })); }} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                                          {showDiff[entry.id] ? <EyeOff size={10} /> : <Eye size={10} />}
                                          {showDiff[entry.id] ? 'Hide' : 'Show'} diff
                                        </button>
                                      </div>
                                      {showDiff[entry.id] && <DiffPanel before={entry.before_data} after={entry.after_data} />}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1 border-t border-border flex-wrap">
                                    <span>User: <span className="text-foreground font-medium">{entry.user_email}</span></span>
                                    <span>Role: <span className="text-foreground font-medium">{entry.user_role}</span></span>
                                    <span>Org: <span className="text-foreground font-medium">{entry.org_name}</span></span>
                                    <span>IP: <span className="font-mono text-foreground">{entry.ip_address}</span></span>
                                    <span>Timestamp: <span className="font-mono text-foreground">{new Date(entry.timestamp).toISOString()}</span></span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'cross_tenant' && <CrossTenantTab entries={entries} />}
        {activeTab === 'compliance' && <ComplianceTab />}
      </div>
    </AppLayout>
  );
}
