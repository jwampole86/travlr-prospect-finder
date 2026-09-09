'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Settings, Key, CheckCircle, XCircle, AlertTriangle, Clock, Shield, RefreshCw, Eye, EyeOff, Save, ChevronDown, ChevronUp, Zap, Globe, MessageSquare, Mail, FileText, Database, Server, ToggleLeft, ToggleRight, Activity } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type VerificationStatus = 'verified' | 'unverified' | 'pending' | 'error';
type EnvMode = 'production' | 'staging' | 'development';

interface ApiKeyConfig {
  id: string;
  label: string;
  envKey: string;
  masked: string;
  hasValue: boolean;
  lastVerified?: string;
  verificationStatus: VerificationStatus;
  service: 'twilio' | 'resend' | 'docusign' | 'openai' | 'supabase' | 'stripe' | 'other';
}

interface RateLimit {
  id: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  description: string;
}

interface SyncInterval {
  id: string;
  label: string;
  value: number;
  unit: 'minutes' | 'hours';
  description: string;
}

// ─── Mock Config State ────────────────────────────────────────────────────────

const initialApiKeys: ApiKeyConfig[] = [
  { id: 'twilio-sid', label: 'Twilio Account SID', envKey: 'TWILIO_ACCOUNT_SID', masked: 'AC••••••••••••••••••••••••••••••••', hasValue: false, verificationStatus: 'unverified', service: 'twilio' },
  { id: 'twilio-token', label: 'Twilio Auth Token', envKey: 'TWILIO_AUTH_TOKEN', masked: '••••••••••••••••••••••••••••••••', hasValue: false, verificationStatus: 'unverified', service: 'twilio' },
  { id: 'twilio-from', label: 'Twilio From Number', envKey: 'TWILIO_FROM_NUMBER', masked: '+1512•••••••', hasValue: false, verificationStatus: 'unverified', service: 'twilio' },
  { id: 'twilio-twiml', label: 'Twilio TwiML App SID', envKey: 'TWILIO_TWIML_APP_SID', masked: 'AP••••••••••••••••••••••••••••••••', hasValue: false, verificationStatus: 'unverified', service: 'twilio' },
  { id: 'resend-key', label: 'Resend API Key', envKey: 'RESEND_API_KEY', masked: 're_••••••••••••••••••••••••••••••••', hasValue: true, verificationStatus: 'verified', lastVerified: new Date(Date.now() - 3600000).toISOString(), service: 'resend' },
  { id: 'docusign-key', label: 'DocuSign Integration Key', envKey: 'DOCUSIGN_INTEGRATION_KEY', masked: '••••••••-••••-••••-••••-••••••••••••', hasValue: false, verificationStatus: 'unverified', service: 'docusign' },
  { id: 'docusign-account', label: 'DocuSign Account ID', envKey: 'DOCUSIGN_ACCOUNT_ID', masked: '••••••••-••••-••••-••••-••••••••••••', hasValue: false, verificationStatus: 'unverified', service: 'docusign' },
  { id: 'docusign-user', label: 'DocuSign User ID', envKey: 'DOCUSIGN_USER_ID', masked: '••••••••-••••-••••-••••-••••••••••••', hasValue: false, verificationStatus: 'unverified', service: 'docusign' },
  { id: 'openai-key', label: 'OpenAI API Key', envKey: 'OPENAI_API_KEY', masked: 'sk-••••••••••••••••••••••••••••••••', hasValue: true, verificationStatus: 'verified', lastVerified: new Date(Date.now() - 7200000).toISOString(), service: 'openai' },
  { id: 'supabase-url', label: 'Supabase URL', envKey: 'NEXT_PUBLIC_SUPABASE_URL', masked: 'https://••••••••.supabase.co', hasValue: true, verificationStatus: 'verified', lastVerified: new Date(Date.now() - 1800000).toISOString(), service: 'supabase' },
];

const initialRateLimits: RateLimit[] = [
  { id: 'sms-per-min', label: 'SMS per Minute', value: 30, unit: 'msgs/min', min: 1, max: 100, step: 1, description: 'Max outbound SMS sent per minute via Twilio' },
  { id: 'email-per-hour', label: 'Emails per Hour', value: 500, unit: 'emails/hr', min: 10, max: 2000, step: 10, description: 'Max emails dispatched per hour via Resend' },
  { id: 'api-calls-per-sec', label: 'API Calls per Second', value: 10, unit: 'req/s', min: 1, max: 50, step: 1, description: 'Global API rate limit for outbound service calls' },
  { id: 'enrichment-per-day', label: 'Enrichment Calls per Day', value: 200, unit: 'calls/day', min: 10, max: 1000, step: 10, description: 'Daily cap for SalesGenie enrichment API calls' },
  { id: 'cadence-batch', label: 'Cadence Batch Size', value: 50, unit: 'leads/batch', min: 5, max: 200, step: 5, description: 'Max leads processed per cadence run cycle' },
];

const initialSyncIntervals: SyncInterval[] = [
  { id: 'lead-sync', label: 'Lead Sync Interval', value: 15, unit: 'minutes', description: 'How often to pull new leads from all sources' },
  { id: 'enrichment-sync', label: 'Enrichment Sync', value: 60, unit: 'minutes', description: 'Frequency of background enrichment jobs' },
  { id: 'cadence-cron', label: 'Cadence Cron Interval', value: 5, unit: 'minutes', description: 'How often the cadence engine checks for due touchpoints' },
  { id: 'score-recalc', label: 'Score Recalculation', value: 4, unit: 'hours', description: 'Interval for bulk prospect score recalculation' },
  { id: 'export-schedule', label: 'Scheduled Export Check', value: 30, unit: 'minutes', description: 'How often to check for pending scheduled exports' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SERVICE_ICONS: Record<string, React.ElementType> = {
  twilio: MessageSquare,
  resend: Mail,
  docusign: FileText,
  openai: Zap,
  supabase: Database,
  stripe: Shield,
  other: Key,
};

const SERVICE_COLORS: Record<string, string> = {
  twilio: 'text-red-600 bg-red-50',
  resend: 'text-blue-600 bg-blue-50',
  docusign: 'text-amber-600 bg-amber-50',
  openai: 'text-emerald-600 bg-emerald-50',
  supabase: 'text-teal-600 bg-teal-50',
  stripe: 'text-violet-600 bg-violet-50',
  other: 'text-gray-600 bg-gray-50',
};

function VerificationBadge({ status, lastVerified }: { status: VerificationStatus; lastVerified?: string }) {
  const map = {
    verified: { icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', label: 'Verified' },
    unverified: { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', label: 'Not configured' },
    pending: { icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', label: 'Pending' },
    error: { icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50 border-red-200', label: 'Error' },
  };
  const cfg = map[status];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon size={11} />
      <span>{cfg.label}</span>
      {lastVerified && status === 'verified' && (
        <span className="text-gray-400 font-normal">
          · {new Date(lastVerified).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}

// ─── Section Components ───────────────────────────────────────────────────────

function CollapsibleSection({ title, icon: Icon, iconColor, children, defaultOpen = true }: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>
            <Icon size={16} />
          </div>
          <span className="font-semibold text-gray-900 text-sm">{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && <div className="border-t border-gray-100 px-5 py-4">{children}</div>}
    </div>
  );
}

function ApiKeyRow({ config }: { config: ApiKeyConfig }) {
  const [revealed, setRevealed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const ServiceIcon = SERVICE_ICONS[config.service] || Key;

  const handleVerify = () => {
    setVerifying(true);
    setTimeout(() => setVerifying(false), 1500);
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${SERVICE_COLORS[config.service]}`}>
        <ServiceIcon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">{config.label}</span>
          <code className="text-xs text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">{config.envKey}</code>
        </div>
        <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">
          {revealed && config.hasValue ? config.masked : config.masked}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <VerificationBadge status={config.verificationStatus} lastVerified={config.lastVerified} />
        {config.hasValue && (
          <button
            onClick={() => setRevealed(!revealed)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        <button
          onClick={handleVerify}
          disabled={verifying || !config.hasValue}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={10} className={verifying ? 'animate-spin' : ''} />
          Test
        </button>
      </div>
    </div>
  );
}

function RateLimitRow({ limit, onChange }: { limit: RateLimit; onChange: (id: string, value: number) => void }) {
  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <span className="text-sm font-medium text-gray-800">{limit.label}</span>
          <p className="text-xs text-gray-400 mt-0.5">{limit.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <span className="text-lg font-bold text-gray-900 w-12 text-right">{limit.value}</span>
          <span className="text-xs text-gray-400 w-20">{limit.unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={limit.min}
        max={limit.max}
        step={limit.step}
        value={limit.value}
        onChange={(e) => onChange(limit.id, Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-violet-600"
      />
      <div className="flex justify-between text-xs text-gray-300 mt-1">
        <span>{limit.min}</span>
        <span>{limit.max}</span>
      </div>
    </div>
  );
}

function SyncIntervalRow({ interval, onChange }: { interval: SyncInterval; onChange: (id: string, value: number) => void }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-800">{interval.label}</span>
        <p className="text-xs text-gray-400 mt-0.5">{interval.description}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="number"
          min={1}
          max={interval.unit === 'minutes' ? 1440 : 24}
          value={interval.value}
          onChange={(e) => onChange(interval.id, Number(e.target.value))}
          className="w-16 px-2 py-1.5 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
        />
        <span className="text-xs text-gray-500 w-14">{interval.unit}</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminConfigPage() {
  const [rateLimits, setRateLimits] = useState<RateLimit[]>(initialRateLimits);
  const [syncIntervals, setSyncIntervals] = useState<SyncInterval[]>(initialSyncIntervals);
  const [envMode, setEnvMode] = useState<EnvMode>('production');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleRateLimitChange = (id: string, value: number) => {
    setRateLimits((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
  };

  const handleSyncIntervalChange = (id: string, value: number) => {
    setSyncIntervals((prev) => prev.map((s) => (s.id === id ? { ...s, value } : s)));
  };

  const twilio10dlcStatus: VerificationStatus = 'unverified';
  const resendDomainStatus: VerificationStatus = 'verified';
  const docusignStatus: VerificationStatus = 'unverified';

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center">
                <Settings size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Admin Config</h1>
                <p className="text-xs text-gray-500">API keys · verification status · rate limits · sync intervals · environment</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${saved ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
            >
              {saved ? <CheckCircle size={14} /> : <Save size={14} />}
              {saved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="px-6 py-5 max-w-4xl mx-auto space-y-4">

          {/* Environment Mode Banner */}
          <div className={`rounded-2xl border px-5 py-4 flex items-center justify-between flex-wrap gap-3 ${envMode === 'production' ? 'bg-emerald-50 border-emerald-200' : envMode === 'staging' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex items-center gap-3">
              <Server size={18} className={envMode === 'production' ? 'text-emerald-600' : envMode === 'staging' ? 'text-amber-600' : 'text-blue-600'} />
              <div>
                <p className="text-sm font-semibold text-gray-900">Environment Mode</p>
                <p className="text-xs text-gray-500">Controls which API endpoints and credentials are active</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(['development', 'staging', 'production'] as EnvMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setEnvMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${envMode === mode ? (mode === 'production' ? 'bg-emerald-600 text-white' : mode === 'staging' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white') : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Verification Status Summary */}
          <CollapsibleSection title="Service Verification Status" icon={Shield} iconColor="bg-violet-100 text-violet-600">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'Twilio 10DLC', sublabel: 'Campaign registration & brand', status: twilio10dlcStatus, icon: MessageSquare, color: 'text-red-600' },
                { label: 'Resend Domain', sublabel: 'DNS records & DKIM verified', status: resendDomainStatus, icon: Mail, color: 'text-blue-600' },
                { label: 'DocuSign OAuth', sublabel: 'JWT grant & account access', status: docusignStatus, icon: FileText, color: 'text-amber-600' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="p-4 rounded-xl border border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={14} className={item.color} />
                      <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">{item.sublabel}</p>
                    <VerificationBadge status={item.status} />
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          {/* API Keys */}
          <CollapsibleSection title="API Keys & Credentials" icon={Key} iconColor="bg-gray-100 text-gray-600">
            <div className="divide-y divide-gray-50">
              {initialApiKeys.map((key) => (
                <ApiKeyRow key={key.id} config={key} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
              <AlertTriangle size={11} />
              To update API keys, edit your <code className="font-mono bg-gray-100 px-1 rounded">.env</code> file directly. Keys marked "Not configured" require values to be set.
            </p>
          </CollapsibleSection>

          {/* Rate Limits */}
          <CollapsibleSection title="Rate Limit Thresholds" icon={Activity} iconColor="bg-orange-100 text-orange-600">
            <div className="divide-y divide-gray-50">
              {rateLimits.map((limit) => (
                <RateLimitRow key={limit.id} limit={limit} onChange={handleRateLimitChange} />
              ))}
            </div>
          </CollapsibleSection>

          {/* Sync Intervals */}
          <CollapsibleSection title="Sync Intervals & Cron Jobs" icon={RefreshCw} iconColor="bg-teal-100 text-teal-600">
            <div className="divide-y divide-gray-50">
              {syncIntervals.map((interval) => (
                <SyncIntervalRow key={interval.id} interval={interval} onChange={handleSyncIntervalChange} />
              ))}
            </div>
          </CollapsibleSection>

          {/* Timezone & Alerts */}
          <CollapsibleSection title="Timezone & Notifications" icon={Globe} iconColor="bg-blue-100 text-blue-600">
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">System Timezone</p>
                  <p className="text-xs text-gray-400 mt-0.5">Used for cron scheduling, export timestamps, and cadence send times</p>
                </div>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 w-52"
                >
                  <option value="America/Chicago">America/Chicago (CT)</option>
                  <option value="America/New_York">America/New_York (ET)</option>
                  <option value="America/Denver">America/Denver (MT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">Ops Failure Alerts</p>
                  <p className="text-xs text-gray-400 mt-0.5">Send alerts when API errors, sync failures, or webhook failures are detected</p>
                </div>
                <button
                  onClick={() => setAlertsEnabled(!alertsEnabled)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${alertsEnabled ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}
                >
                  {alertsEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  {alertsEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </CollapsibleSection>

        </div>
      </div>
    </AppLayout>
  );
}
