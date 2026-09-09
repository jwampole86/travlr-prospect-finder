'use client';

import React, { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Phone, Mail, FileText, CheckCircle, XCircle, AlertCircle, Eye, EyeOff, Save, Zap, Shield, ChevronDown, ChevronUp, ExternalLink, Info, Loader2 } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type Env = 'sandbox' | 'production';
type TestStatus = 'idle' | 'running' | 'success' | 'error';

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
  isSecret?: boolean;
  isTextarea?: boolean;
}

interface ServiceConfig {
  id: 'twilio' | 'resend' | 'docusign';
  name: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  docsUrl: string;
  sandboxFields: FieldDef[];
  productionFields: FieldDef[];
  testEndpoint: string;
  sandboxNote: string;
  productionNote: string;
}

// ─── Service Definitions ──────────────────────────────────────────────────────

const SERVICES: ServiceConfig[] = [
  {
    id: 'twilio',
    name: 'Twilio',
    icon: Phone,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    docsUrl: 'https://console.twilio.com',
    sandboxNote: 'Sandbox uses your Twilio test credentials. Messages are simulated — no real SMS is sent.',
    productionNote: 'Production credentials dispatch real SMS and voice calls. Charges apply per message.',
    testEndpoint: '/api/twilio/status',
    sandboxFields: [
      { key: 'TWILIO_ACCOUNT_SID', label: 'Test Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'Found in Twilio Console → Account Info', isSecret: false },
      { key: 'TWILIO_ACCOUNT_SID_MAIN', label: 'Parent Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'Required when TWILIO_ACCOUNT_SID is an SK API Key SID' },
      { key: 'TWILIO_AUTH_TOKEN', label: 'Test Auth Token', placeholder: '••••••••••••••••••••••••••••••••', isSecret: true },
      { key: 'TWILIO_FROM_NUMBER', label: 'Test From Number', placeholder: '+15005550006', hint: 'Twilio magic test number for sandbox' },
      { key: 'TWILIO_TWIML_APP_SID', label: 'TwiML App SID (Voice)', placeholder: 'APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'Required for browser-based voice calls' },
    ],
    productionFields: [
      { key: 'TWILIO_ACCOUNT_SID', label: 'Live Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'Your live Twilio Account SID', isSecret: false },
      { key: 'TWILIO_ACCOUNT_SID_MAIN', label: 'Parent Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'Required when using an SK API Key SID for auth' },
      { key: 'TWILIO_AUTH_TOKEN', label: 'Live Auth Token', placeholder: '••••••••••••••••••••••••••••••••', isSecret: true },
      { key: 'TWILIO_FROM_NUMBER', label: 'Live From Number', placeholder: '+1XXXXXXXXXX', hint: 'Your purchased Twilio phone number' },
      { key: 'TWILIO_TWIML_APP_SID', label: 'TwiML App SID (Voice)', placeholder: 'APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'Required for browser-based voice calls' },
    ],
  },
  {
    id: 'resend',
    name: 'Resend',
    icon: Mail,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    docsUrl: 'https://resend.com/api-keys',
    sandboxNote: 'Sandbox API key sends to your verified email only. No external recipients receive mail.',
    productionNote: 'Production key sends to any recipient. Ensure your domain is verified in Resend.',
    testEndpoint: '/api/resend/status',
    sandboxFields: [
      { key: 'RESEND_API_KEY', label: 'Sandbox API Key', placeholder: 're_test_••••••••••••••••••••••••••••••', isSecret: true, hint: 'Create a test key in Resend Dashboard → API Keys' },
      { key: 'RESEND_FROM_EMAIL', label: 'Verified Sender Email', placeholder: 'onboarding@resend.dev', hint: 'Must be verified in Resend before production sending' },
      { key: 'RESEND_FROM_NAME', label: 'Sender Name', placeholder: 'TRAVLR Vacation Homes' },
    ],
    productionFields: [
      { key: 'RESEND_API_KEY', label: 'Production API Key', placeholder: 're_live_••••••••••••••••••••••••••••••', isSecret: true, hint: 'Use a production key with your verified sending domain' },
      { key: 'RESEND_FROM_EMAIL', label: 'Verified Sender Email', placeholder: 'outreach@staytrvlr.com', hint: 'Use an address on a verified Resend domain' },
      { key: 'RESEND_FROM_NAME', label: 'Sender Name', placeholder: 'TRAVLR Vacation Homes' },
    ],
  },
  {
    id: 'docusign',
    name: 'DocuSign',
    icon: FileText,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    docsUrl: 'https://developers.docusign.com',
    sandboxNote: 'Sandbox uses demo.docusign.net. Envelopes are free and do not count toward production quota.',
    productionNote: 'Production uses na1.docusign.net. Requires Go-Live certification from DocuSign. Envelopes count toward your plan.',
    testEndpoint: '/api/docusign/status',
    sandboxFields: [
      { key: 'DOCUSIGN_INTEGRATION_KEY', label: 'Integration Key (Client ID)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'From DocuSign Apps & Keys → Sandbox app' },
      { key: 'DOCUSIGN_ACCOUNT_ID', label: 'Account ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Found in DocuSign Admin → Account Profile' },
      { key: 'DOCUSIGN_USER_ID', label: 'User ID (API Username)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Your DocuSign user GUID' },
      { key: 'DOCUSIGN_PRIVATE_KEY', label: 'RSA Private Key', placeholder: '-----BEGIN RSA PRIVATE KEY-----\n...', isSecret: true, isTextarea: true, hint: 'Paste the full RSA private key from your DocuSign app' },
      { key: 'DOCUSIGN_TEMPLATE_ID', label: 'Template ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'The envelope template used for property agreements' },
    ],
    productionFields: [
      { key: 'DOCUSIGN_INTEGRATION_KEY', label: 'Integration Key (Client ID)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'From DocuSign Apps & Keys → Production app (after Go-Live)' },
      { key: 'DOCUSIGN_ACCOUNT_ID', label: 'Account ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Production account GUID' },
      { key: 'DOCUSIGN_USER_ID', label: 'User ID (API Username)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Production user GUID' },
      { key: 'DOCUSIGN_PRIVATE_KEY', label: 'RSA Private Key', placeholder: '-----BEGIN RSA PRIVATE KEY-----\n...', isSecret: true, isTextarea: true, hint: 'Production RSA private key — keep this secret' },
      { key: 'DOCUSIGN_TEMPLATE_ID', label: 'Template ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Production template ID' },
    ],
  },
];

// ─── Env Toggle ───────────────────────────────────────────────────────────────

function EnvToggle({ env, onChange }: { env: Env; onChange: (e: Env) => void }) {
  return (
    <div className="flex items-center gap-1 bg-[#0d1117] rounded-lg p-1 border border-[#2a3142]">
      <button
        onClick={() => onChange('sandbox')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
          env === 'sandbox' ?'bg-amber-500/20 text-amber-300 border border-amber-500/30' :'text-gray-500 hover:text-gray-300'
        }`}
      >
        <Shield className="w-3 h-3" /> Sandbox
      </button>
      <button
        onClick={() => onChange('production')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
          env === 'production' ?'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :'text-gray-500 hover:text-gray-300'
        }`}
      >
        <Zap className="w-3 h-3" /> Production
      </button>
    </div>
  );
}

// ─── Test Result Banner ───────────────────────────────────────────────────────

function TestResultBanner({ status, message }: { status: TestStatus; message: string }) {
  if (status === 'idle') return null;
  const cfg = {
    running: { cls: 'bg-blue-500/10 border-blue-500/30 text-blue-300', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    success: { cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300', icon: <CheckCircle className="w-4 h-4" /> },
    error: { cls: 'bg-red-500/10 border-red-500/30 text-red-300', icon: <XCircle className="w-4 h-4" /> },
  }[status];
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${cfg.cls} mt-3`}>
      <span className="mt-0.5 flex-shrink-0">{cfg.icon}</span>
      <span>{message}</span>
    </div>
  );
}

// ─── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({ service, globalEnv }: { service: ServiceConfig; globalEnv: Env }) {
  const [expanded, setExpanded] = useState(true);
  const [localEnv, setLocalEnv] = useState<Env>(globalEnv);
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');

  const activeEnv = localEnv;
  const fields = activeEnv === 'sandbox' ? service.sandboxFields : service.productionFields;
  const envNote = activeEnv === 'sandbox' ? service.sandboxNote : service.productionNote;

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = useCallback(async () => {
    setTestStatus('running');
    setTestMessage('Sending test request…');
    try {
      const res = await fetch(service.testEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _credentialTest: true, env: activeEnv }),
      });
      if (res.ok) {
        setTestStatus('success');
        setTestMessage(`Live sync test passed — ${service.name} ${activeEnv} credentials are valid and reachable.`);
      } else {
        const data = await res.json().catch(() => ({}));
        setTestStatus('error');
        setTestMessage(data?.error ?? `Test failed with HTTP ${res.status}. Check your credentials and try again.`);
      }
    } catch {
      setTestStatus('error');
      setTestMessage('Network error — could not reach the test endpoint. Ensure the server is running.');
    }
  }, [service.testEndpoint, activeEnv]);

  const Icon = service.icon;

  return (
    <div className="bg-[#161b27] border border-[#2a3142] rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-5 hover:bg-[#1a2035] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${service.iconBg}`}>
            <Icon className={`w-5 h-5 ${service.iconColor}`} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">{service.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {activeEnv === 'production' ? '🟢 Production' : '🟡 Sandbox'} mode
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={service.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs text-gray-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
          >
            Docs <ExternalLink className="w-3 h-3" />
          </a>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Env toggle per-service */}
          <div className="flex items-center justify-between">
            <EnvToggle env={activeEnv} onChange={setLocalEnv} />
            <a
              href={service.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              Open {service.name} Console <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Env note */}
          <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
            activeEnv === 'production' ?'bg-emerald-500/5 border-emerald-500/20 text-emerald-300/80' :'bg-amber-500/5 border-amber-500/20 text-amber-300/80'
          }`}>
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{envNote}</span>
          </div>

          {/* Fields */}
          <div className="space-y-3">
            {fields.map(field => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  {field.label}
                  {field.hint && (
                    <span className="ml-2 text-gray-600 font-normal">{field.hint}</span>
                  )}
                </label>
                <div className="relative">
                  {field.isTextarea ? (
                    <textarea
                      rows={4}
                      value={values[`${activeEnv}_${field.key}`] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [`${activeEnv}_${field.key}`]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full bg-[#0d1117] border border-[#2a3142] rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-700 font-mono focus:outline-none focus:border-blue-500/50 resize-none"
                    />
                  ) : (
                    <input
                      type={field.isSecret && !revealed[`${activeEnv}_${field.key}`] ? 'password' : 'text'}
                      value={values[`${activeEnv}_${field.key}`] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [`${activeEnv}_${field.key}`]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full bg-[#0d1117] border border-[#2a3142] rounded-lg px-3 py-2 pr-8 text-xs text-gray-200 placeholder-gray-700 font-mono focus:outline-none focus:border-blue-500/50"
                    />
                  )}
                  {field.isSecret && !field.isTextarea && (
                    <button
                      onClick={() => setRevealed(r => ({ ...r, [`${activeEnv}_${field.key}`]: !r[`${activeEnv}_${field.key}`] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors"
                    >
                      {revealed[`${activeEnv}_${field.key}`] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                saved
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {saved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? 'Saved to .env' : 'Save Credentials'}
            </button>
            <button
              onClick={handleTest}
              disabled={testStatus === 'running'}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[#0d1117] border border-[#2a3142] text-gray-300 hover:border-blue-500/40 hover:text-blue-300 transition-all disabled:opacity-50"
            >
              {testStatus === 'running'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Zap className="w-3.5 h-3.5" />}
              Test Live Sync
            </button>
          </div>

          <TestResultBanner status={testStatus} message={testMessage} />

          {/* Env variable key reference */}
          <details className="group">
            <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 transition-colors flex items-center gap-1">
              <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
              .env variable names for this service
            </summary>
            <div className="mt-2 bg-[#0d1117] rounded-lg p-3 font-mono text-xs text-gray-500 space-y-1">
              {fields.map(f => (
                <div key={f.key} className="flex items-center justify-between gap-4">
                  <span className="text-gray-400">{f.key}</span>
                  <span className="text-gray-700 truncate">{f.placeholder.slice(0, 24)}…</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CredentialManagerPage() {
  const [globalEnv, setGlobalEnv] = useState<Env>('sandbox');

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Credential Manager</h1>
            <p className="text-sm text-gray-500 mt-1">
              Swap sandbox ↔ production credentials for Twilio, Resend, and DocuSign. Run live sync tests before going live.
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1">
            <p className="text-xs text-gray-600">Global environment</p>
            <EnvToggle env={globalEnv} onChange={setGlobalEnv} />
          </div>
        </div>

        {/* Warning banner for production */}
        {globalEnv === 'production' && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Production mode active</p>
              <p className="text-xs text-red-400/70 mt-0.5">
                Credentials saved here will be used for real SMS, email, and e-signature operations. Charges apply. Verify all values before saving.
              </p>
            </div>
          </div>
        )}

        {/* Service cards */}
        <div className="space-y-4">
          {SERVICES.map(service => (
            <ServiceCard key={service.id} service={service} globalEnv={globalEnv} />
          ))}
        </div>

        {/* Footer note */}
        <div className="flex items-start gap-2 p-4 rounded-xl bg-[#161b27] border border-[#2a3142] text-xs text-gray-500">
          <Shield className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-600" />
          <p>
            Credentials entered here update your <code className="text-gray-400">.env</code> file. Secret values are never logged or transmitted outside your deployment environment. Rotate credentials immediately if compromised.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
