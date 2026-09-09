'use client';

import React, { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Link2, Unlink, Eye, EyeOff, Copy, RotateCcw, Zap, Mail, FileText, Database, Phone, Globe, Key, BarChart2, Clock, Shield, ChevronDown, ChevronUp, X, Plus } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'pending';

interface UsageQuota {
  used: number;
  limit: number;
  unit: string;
  resetDate: string;
}

interface ApiKey {
  id: string;
  label: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
  active: boolean;
}

interface Integration {
  id: string;
  name: string;
  category: 'communication' | 'document' | 'data' | 'analytics';
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  status: IntegrationStatus;
  verifiedAt: string | null;
  oauthSupported: boolean;
  quota: UsageQuota | null;
  apiKeys: ApiKey[];
  webhookUrl: string | null;
  lastSync: string | null;
  errorMessage: string | null;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const initialIntegrations: Integration[] = [
  {
    id: 'twilio',
    name: 'Twilio',
    category: 'communication',
    description: 'SMS, voice calls, and phone number management for outreach campaigns.',
    icon: Phone,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    status: 'connected',
    verifiedAt: '2026-08-01T10:00:00Z',
    oauthSupported: false,
    quota: { used: 4820, limit: 10000, unit: 'SMS/mo', resetDate: '2026-09-01' },
    apiKeys: [
      { id: 'twilio-key-1', label: 'Production Account SID', key: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', createdAt: '2026-07-01', lastUsed: '2026-08-17', active: true },
      { id: 'twilio-key-2', label: 'Auth Token', key: '••••••••••••••••••••••••••••••••', createdAt: '2026-07-01', lastUsed: '2026-08-17', active: true },
    ],
    webhookUrl: 'https://travlrpro3047.builtwithrocket.new/api/sms/status',
    lastSync: '2026-08-17T22:00:00Z',
    errorMessage: null,
  },
  {
    id: 'resend',
    name: 'Resend',
    category: 'communication',
    description: 'Transactional email delivery for cadence sequences and homeowner notifications.',
    icon: Mail,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    status: 'connected',
    verifiedAt: '2026-08-05T14:30:00Z',
    oauthSupported: false,
    quota: { used: 12400, limit: 50000, unit: 'emails/mo', resetDate: '2026-09-01' },
    apiKeys: [
      { id: 'resend-key-1', label: 'API Key', key: 're_••••••••••••••••••••••••••••••••', createdAt: '2026-07-15', lastUsed: '2026-08-18', active: true },
    ],
    webhookUrl: null,
    lastSync: '2026-08-18T01:00:00Z',
    errorMessage: null,
  },
  {
    id: 'docusign',
    name: 'DocuSign',
    category: 'document',
    description: 'E-signature workflows for property agreements and lease documents.',
    icon: FileText,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    status: 'error',
    verifiedAt: null,
    oauthSupported: true,
    quota: { used: 38, limit: 100, unit: 'envelopes/mo', resetDate: '2026-09-01' },
    apiKeys: [
      { id: 'docusign-key-1', label: 'Integration Key', key: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', createdAt: '2026-07-10', lastUsed: '2026-08-10', active: true },
    ],
    webhookUrl: 'https://travlrpro3047.builtwithrocket.new/api/docusign/webhook',
    lastSync: '2026-08-10T09:00:00Z',
    errorMessage: 'OAuth token expired. Re-authenticate to restore access.',
  },
  {
    id: 'salesgenie',
    name: 'SalesGenie',
    category: 'data',
    description: 'Lead enrichment and property data sourcing via SalesGenie API.',
    icon: Database,
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/10',
    status: 'connected',
    verifiedAt: '2026-08-12T08:00:00Z',
    oauthSupported: false,
    quota: { used: 2100, limit: 5000, unit: 'lookups/mo', resetDate: '2026-09-01' },
    apiKeys: [
      { id: 'sg-key-1', label: 'API User', key: 'sg_user_••••••••', createdAt: '2026-07-20', lastUsed: '2026-08-17', active: true },
      { id: 'sg-key-2', label: 'API Secret', key: 'sg_secret_••••••••••••••••', createdAt: '2026-07-20', lastUsed: '2026-08-17', active: true },
    ],
    webhookUrl: null,
    lastSync: '2026-08-17T20:00:00Z',
    errorMessage: null,
  },
  {
    id: 'mixpanel',
    name: 'Mixpanel',
    category: 'analytics',
    description: 'Product analytics, event tracking, and user session monitoring.',
    icon: BarChart2,
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10',
    status: 'connected',
    verifiedAt: '2026-08-01T12:00:00Z',
    oauthSupported: false,
    quota: { used: 180000, limit: 1000000, unit: 'events/mo', resetDate: '2026-09-01' },
    apiKeys: [
      { id: 'mp-key-1', label: 'Project Token', key: 'mp_token_••••••••••••••••', createdAt: '2026-07-01', lastUsed: '2026-08-18', active: true },
    ],
    webhookUrl: null,
    lastSync: '2026-08-18T03:00:00Z',
    errorMessage: null,
  },
  {
    id: 'zillow',
    name: 'Zillow / Realtor.com',
    category: 'data',
    description: 'Property listing data sync from major real estate portals.',
    icon: Globe,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    status: 'disconnected',
    verifiedAt: null,
    oauthSupported: true,
    quota: null,
    apiKeys: [],
    webhookUrl: null,
    lastSync: null,
    errorMessage: null,
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  communication: 'Communication',
  document: 'Documents & Signing',
  data: 'Data Sources',
  analytics: 'Analytics',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: IntegrationStatus }) {
  const cfg = {
    connected: { label: 'Connected', cls: 'bg-emerald-500/15 text-emerald-400', icon: CheckCircle },
    disconnected: { label: 'Disconnected', cls: 'bg-gray-700/50 text-gray-400', icon: XCircle },
    error: { label: 'Error', cls: 'bg-red-500/15 text-red-400', icon: AlertCircle },
    pending: { label: 'Pending', cls: 'bg-amber-500/15 text-amber-400', icon: Clock },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.cls}`}>
      <cfg.icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function QuotaBar({ quota }: { quota: UsageQuota }) {
  const pct = Math.min((quota.used / quota.limit) * 100, 100);
  const color = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{quota.used.toLocaleString()} / {quota.limit.toLocaleString()} {quota.unit}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 bg-[#0d1117] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-600 mt-1">Resets {quota.resetDate}</p>
    </div>
  );
}

function ApiKeyRow({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: (id: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(apiKey.key).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#2a3142] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-300">{apiKey.label}</p>
        <p className="text-xs text-gray-600 font-mono mt-0.5 truncate">
          {revealed ? apiKey.key : apiKey.key.replace(/[^•]/g, '•').slice(0, 32) + '...'}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {apiKey.lastUsed && <span className="text-xs text-gray-600 hidden sm:block">Used {apiKey.lastUsed}</span>}
        <button onClick={() => setRevealed(r => !r)} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button onClick={copy} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
          {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => onRevoke(apiKey.id)} className="p-1 text-gray-500 hover:text-red-400 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IntegrationHubPage() {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations);
  const [expandedId, setExpandedId] = useState<string | null>('twilio');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [addKeyModal, setAddKeyModal] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const handleConnect = useCallback((id: string) => {
    setConnectingId(id);
    setTimeout(() => {
      setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'connected', verifiedAt: new Date().toISOString(), errorMessage: null } : i));
      setConnectingId(null);
    }, 1500);
  }, []);

  const handleDisconnect = useCallback((id: string) => {
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'disconnected', verifiedAt: null } : i));
  }, []);

  const handleReauth = useCallback((id: string) => {
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'pending', errorMessage: null } : i));
    setTimeout(() => {
      setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'connected', verifiedAt: new Date().toISOString() } : i));
    }, 2000);
  }, []);

  const revokeKey = useCallback((integrationId: string, keyId: string) => {
    setIntegrations(prev => prev.map(i => i.id === integrationId
      ? { ...i, apiKeys: i.apiKeys.filter(k => k.id !== keyId) }
      : i));
  }, []);

  const addKey = useCallback((integrationId: string) => {
    if (!newKeyLabel.trim() || !newKeyValue.trim()) return;
    const newKey: ApiKey = {
      id: `key-${Date.now()}`,
      label: newKeyLabel,
      key: newKeyValue,
      createdAt: new Date().toISOString().slice(0, 10),
      lastUsed: null,
      active: true,
    };
    setIntegrations(prev => prev.map(i => i.id === integrationId ? { ...i, apiKeys: [...i.apiKeys, newKey] } : i));
    setAddKeyModal(null);
    setNewKeyLabel('');
    setNewKeyValue('');
  }, [newKeyLabel, newKeyValue]);

  const categories = ['all', 'communication', 'document', 'data', 'analytics'];
  const filtered = filterCategory === 'all' ? integrations : integrations.filter(i => i.category === filterCategory);

  const statusCounts = {
    connected: integrations.filter(i => i.status === 'connected').length,
    error: integrations.filter(i => i.status === 'error').length,
    disconnected: integrations.filter(i => i.status === 'disconnected').length,
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0d1117] text-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Icon icon={Zap} className="w-6 h-6 text-amber-400" />
              Integration Hub
            </h1>
            <p className="text-gray-400 text-sm mt-1">Connect services, manage API keys, and monitor usage quotas</p>
          </div>
        </div>

        {/* Status Strip */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
            <div>
              <p className="text-2xl font-bold text-white">{statusCounts.connected}</p>
              <p className="text-xs text-gray-400">Connected</p>
            </div>
          </div>
          <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <div>
              <p className="text-2xl font-bold text-white">{statusCounts.error}</p>
              <p className="text-xs text-gray-400">Errors</p>
            </div>
          </div>
          <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-4 flex items-center gap-3">
            <XCircle className="w-8 h-8 text-gray-500" />
            <div>
              <p className="text-2xl font-bold text-white">{statusCounts.disconnected}</p>
              <p className="text-xs text-gray-400">Disconnected</p>
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${filterCategory === cat ? 'bg-amber-600 text-white' : 'bg-[#1a1f2e] border border-[#2a3142] text-gray-400 hover:text-white'}`}>
              {cat === 'all' ? 'All Integrations' : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Integration Cards */}
        <div className="space-y-3">
          {filtered.map(integration => {
            const isExpanded = expandedId === integration.id;
            return (
              <div key={integration.id} className={`bg-[#1a1f2e] border rounded-xl transition-colors ${integration.status === 'error' ? 'border-red-500/30' : 'border-[#2a3142] hover:border-[#3a4152]'}`}>
                {/* Card Header */}
                <div className="flex items-center gap-4 p-5 cursor-pointer" onClick={() => toggleExpand(integration.id)}>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${integration.iconBg}`}>
                    <Icon icon={integration.icon} className={`w-5 h-5 ${integration.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{integration.name}</p>
                      <StatusBadge status={integration.status} />
                      <span className="text-xs text-gray-600 capitalize">{CATEGORY_LABELS[integration.category]}</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5 truncate">{integration.description}</p>
                    {integration.errorMessage && (
                      <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {integration.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {integration.status === 'connected' && (
                      <button onClick={e => { e.stopPropagation(); handleDisconnect(integration.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/50 text-gray-400 rounded-lg text-xs hover:bg-red-500/20 hover:text-red-400 transition-colors">
                        <Unlink className="w-3 h-3" /> Disconnect
                      </button>
                    )}
                    {integration.status === 'disconnected' && (
                      <button onClick={e => { e.stopPropagation(); handleConnect(integration.id); }}
                        disabled={connectingId === integration.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-600/30 transition-colors disabled:opacity-60">
                        {connectingId === integration.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                        {integration.oauthSupported ? 'Connect via OAuth' : 'Connect'}
                      </button>
                    )}
                    {integration.status === 'error' && (
                      <button onClick={e => { e.stopPropagation(); handleReauth(integration.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 text-amber-400 rounded-lg text-xs hover:bg-amber-600/30 transition-colors">
                        <RotateCcw className="w-3 h-3" /> Re-authenticate
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-[#2a3142] p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Verification & Webhook */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Verification</p>
                        {integration.verifiedAt ? (
                          <div className="flex items-center gap-2 text-sm text-emerald-400">
                            <Shield className="w-4 h-4" />
                            <span>Verified {new Date(integration.verifiedAt).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Shield className="w-4 h-4" />
                            <span>Not verified</span>
                          </div>
                        )}
                        {integration.lastSync && (
                          <p className="text-xs text-gray-600 mt-1">Last sync: {new Date(integration.lastSync).toLocaleString()}</p>
                        )}
                      </div>
                      {integration.webhookUrl && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Webhook URL</p>
                          <div className="flex items-center gap-2 bg-[#0d1117] border border-[#2a3142] rounded-lg px-3 py-2">
                            <p className="text-xs text-gray-400 font-mono flex-1 truncate">{integration.webhookUrl}</p>
                            <button onClick={() => navigator.clipboard.writeText(integration.webhookUrl!).catch(() => {})}
                              className="text-gray-500 hover:text-gray-300 flex-shrink-0">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Usage Quota */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Usage Quota</p>
                      {integration.quota ? (
                        <QuotaBar quota={integration.quota} />
                      ) : (
                        <p className="text-sm text-gray-600">No quota configured</p>
                      )}
                    </div>

                    {/* API Keys */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">API Keys</p>
                        <button onClick={() => setAddKeyModal(integration.id)}
                          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                          <Plus className="w-3 h-3" /> Add Key
                        </button>
                      </div>
                      {integration.apiKeys.length === 0 ? (
                        <p className="text-sm text-gray-600">No keys configured</p>
                      ) : (
                        <div>
                          {integration.apiKeys.map(k => (
                            <ApiKeyRow key={k.id} apiKey={k} onRevoke={keyId => revokeKey(integration.id, keyId)} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Key Modal */}
        {addKeyModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-400" /> Add API Key
                </h3>
                <button onClick={() => setAddKeyModal(null)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Key Label *</label>
                  <input value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} placeholder="e.g. Production API Key"
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-white focus:outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Key Value *</label>
                  <input value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)} placeholder="Paste your API key here"
                    type="password"
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-white focus:outline-none focus:border-amber-500" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setAddKeyModal(null)} className="flex-1 px-4 py-2 border border-[#2a3142] rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                  <button onClick={() => addKey(addKeyModal)} disabled={!newKeyLabel.trim() || !newKeyValue.trim()}
                    className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    Add Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
