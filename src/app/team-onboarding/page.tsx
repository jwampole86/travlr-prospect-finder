'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { CheckCircle, Database, Zap, GitBranch, MessageSquare, Mail, Phone, ChevronRight, Plus, Trash2, RefreshCw, AlertTriangle, Check, ArrowRight, Send, Shield } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'complete' | 'active' | 'pending';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  status: StepStatus;
}

interface DataSource {
  id: string;
  name: string;
  type: 'zillow' | 'apartments' | 'craigslist' | 'salesgenie' | 'custom';
  enabled: boolean;
  syncInterval: string;
  apiKey: string;
}

interface CadenceTemplate {
  id: string;
  name: string;
  type: 'sms' | 'email' | 'call';
  steps: number;
  selected: boolean;
}

interface AssignmentRule {
  id: string;
  condition: string;
  conditionValue: string;
  assignTo: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const defaultDataSources: DataSource[] = [
  { id: 'ds-1', name: 'Zillow', type: 'zillow', enabled: true, syncInterval: '1h', apiKey: '' },
  { id: 'ds-2', name: 'Apartments.com', type: 'apartments', enabled: false, syncInterval: '2h', apiKey: '' },
  { id: 'ds-3', name: 'Craigslist', type: 'craigslist', enabled: false, syncInterval: '4h', apiKey: '' },
  { id: 'ds-4', name: 'Salesgenie', type: 'salesgenie', enabled: false, syncInterval: '6h', apiKey: '' },
];

const defaultTemplates: CadenceTemplate[] = [
  { id: 'tpl-1', name: 'Cold Outreach — SMS First', type: 'sms', steps: 5, selected: true },
  { id: 'tpl-2', name: 'Email Nurture Sequence', type: 'email', steps: 7, selected: true },
  { id: 'tpl-3', name: 'High-Value Lead Fast Track', type: 'sms', steps: 3, selected: false },
  { id: 'tpl-4', name: 'Re-engagement Drip', type: 'email', steps: 4, selected: true },
  { id: 'tpl-5', name: 'Call + SMS Combo', type: 'call', steps: 6, selected: false },
  { id: 'tpl-6', name: 'Regulation-Pending Hold', type: 'email', steps: 2, selected: false },
];

const conditionOptions = ['Agent Capacity', 'Property Type', 'Geography', 'Regulation Status', 'Custom Tag', 'Lead Score'];
const agentOptions = ['Auto-assign (round robin)', 'Agent A — Sarah Chen', 'Agent B — Marcus Webb', 'Agent C — Priya Nair', 'Unassigned Queue'];

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ steps, current }: { steps: OnboardingStep[]; current: number }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <React.Fragment key={step.id}>
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all
              ${i < current ? 'bg-green-500 text-white' : i === current ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
              {i < current ? <Check size={14} /> : i + 1}
            </div>
            <span className={`text-xs mt-1 font-medium whitespace-nowrap ${i === current ? 'text-blue-600' : i < current ? 'text-green-600' : 'text-slate-400'}`}>
              {step.title}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 mb-4 transition-all ${i < current ? 'bg-green-400' : 'bg-slate-200'}`} style={{ minWidth: 32 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Step 1: Data Sources ─────────────────────────────────────────────────────

function DataSourcesStep({ sources, setSources }: { sources: DataSource[]; setSources: React.Dispatch<React.SetStateAction<DataSource[]>> }) {
  const toggle = (id: string) => setSources(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  const setKey = (id: string, val: string) => setSources(prev => prev.map(s => s.id === id ? { ...s, apiKey: val } : s));
  const setInterval = (id: string, val: string) => setSources(prev => prev.map(s => s.id === id ? { ...s, syncInterval: val } : s));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Configure Data Sources</h2>
        <p className="text-sm text-slate-500 mt-1">Enable the lead sources your team will pull from. Add API keys where required.</p>
      </div>
      <div className="space-y-3">
        {sources.map(src => (
          <div key={src.id} className={`rounded-xl border p-4 transition-all ${src.enabled ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${src.enabled ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {src.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{src.name}</p>
                  <p className="text-xs text-slate-400">Sync every {src.syncInterval}</p>
                </div>
              </div>
              <button
                onClick={() => toggle(src.id)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${src.enabled ? 'bg-blue-600' : 'bg-slate-200'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${src.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
            </div>
            {src.enabled && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">API Key (if required)</label>
                  <input
                    type="password"
                    placeholder="sk-••••••••"
                    value={src.apiKey}
                    onChange={e => setKey(src.id, e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Sync Interval</label>
                  <select
                    value={src.syncInterval}
                    onChange={e => setInterval(src.id, e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {['30m', '1h', '2h', '4h', '6h', '12h', '24h'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
        <AlertTriangle size={13} className="text-yellow-500 shrink-0" />
        API keys are stored encrypted. You can update them later in Admin Config.
      </div>
    </div>
  );
}

// ─── Step 2: Cadence Templates ────────────────────────────────────────────────

function CadenceTemplatesStep({ templates, setTemplates }: { templates: CadenceTemplate[]; setTemplates: React.Dispatch<React.SetStateAction<CadenceTemplate[]>> }) {
  const toggle = (id: string) => setTemplates(prev => prev.map(t => t.id === id ? { ...t, selected: !t.selected } : t));

  const typeConfig = {
    sms: { label: 'SMS', color: 'text-green-700', bg: 'bg-green-50', icon: MessageSquare },
    email: { label: 'Email', color: 'text-blue-700', bg: 'bg-blue-50', icon: Mail },
    call: { label: 'Call', color: 'text-purple-700', bg: 'bg-purple-50', icon: Phone },
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Seed Default Cadence Templates</h2>
        <p className="text-sm text-slate-500 mt-1">Select the cadence templates to pre-load for your team. You can customize them after setup.</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {templates.map(tpl => {
          const tc = typeConfig[tpl.type];
          return (
            <div
              key={tpl.id}
              onClick={() => toggle(tpl.id)}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${tpl.selected ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tc.bg}`}>
                <tc.icon size={15} className={tc.color} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{tpl.name}</p>
                <p className="text-xs text-slate-400">{tpl.steps} steps · {tc.label} sequence</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${tpl.selected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                {tpl.selected && <Check size={11} className="text-white" />}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">{templates.filter(t => t.selected).length} of {templates.length} templates selected</p>
    </div>
  );
}

// ─── Step 3: Assignment Rules ─────────────────────────────────────────────────

function AssignmentRulesStep({ rules, setRules }: { rules: AssignmentRule[]; setRules: React.Dispatch<React.SetStateAction<AssignmentRule[]>> }) {
  const addRule = () => {
    setRules(prev => [...prev, { id: `rule-${Date.now()}`, condition: 'Agent Capacity', conditionValue: '', assignTo: 'Auto-assign (round robin)' }]);
  };
  const removeRule = (id: string) => setRules(prev => prev.filter(r => r.id !== id));
  const updateRule = (id: string, field: keyof AssignmentRule, val: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Define Assignment Rules</h2>
        <p className="text-sm text-slate-500 mt-1">Set conditions that auto-route incoming leads to the right agent or queue.</p>
      </div>
      <div className="space-y-3">
        {rules.map((rule, i) => (
          <div key={rule.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rule {i + 1}</span>
              <button onClick={() => removeRule(rule.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">If condition</label>
                <select
                  value={rule.condition}
                  onChange={e => updateRule(rule.id, 'condition', e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {conditionOptions.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Value / threshold</label>
                <input
                  type="text"
                  placeholder="e.g. > 80, NYC, Allowed"
                  value={rule.conditionValue}
                  onChange={e => updateRule(rule.id, 'conditionValue', e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Assign to</label>
                <select
                  value={rule.assignTo}
                  onChange={e => updateRule(rule.id, 'assignTo', e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {agentOptions.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={addRule}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          <Plus size={15} />
          Add Assignment Rule
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Connect Services ─────────────────────────────────────────────────

function ConnectServicesStep() {
  const [smsConnected, setSmsConnected] = useState(false);
  const [emailConnected, setEmailConnected] = useState(false);
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioFrom, setTwilioFrom] = useState('');
  const [resendKey, setResendKey] = useState('');
  const [testingSms, setTestingSms] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  const testSms = () => {
    setTestingSms(true);
    setTimeout(() => { setTestingSms(false); setSmsConnected(true); }, 1500);
  };
  const testEmail = () => {
    setTestingEmail(true);
    setTimeout(() => { setTestingEmail(false); setEmailConnected(true); }, 1500);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Connect SMS & Email Services</h2>
        <p className="text-sm text-slate-500 mt-1">Link Twilio for SMS and Resend for email. Test connections before going live.</p>
      </div>

      {/* SMS — Twilio */}
      <div className={`rounded-xl border p-5 transition-all ${smsConnected ? 'border-green-200 bg-green-50/30' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <Phone size={15} className="text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Twilio SMS</p>
              <p className="text-xs text-slate-400">Outbound SMS, inbound webhooks, 10DLC</p>
            </div>
          </div>
          {smsConnected && (
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle size={11} /> Connected
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Account SID</label>
              <input type="password" placeholder="AC••••••••" value={twilioSid} onChange={e => setTwilioSid(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Auth Token</label>
              <input type="password" placeholder="••••••••" value={twilioToken} onChange={e => setTwilioToken(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">From Number</label>
            <input type="text" placeholder="+1 (555) 000-0000" value={twilioFrom} onChange={e => setTwilioFrom(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button
            onClick={testSms}
            disabled={testingSms}
            className="flex items-center justify-center gap-2 py-2 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {testingSms ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
            {testingSms ? 'Testing connection…' : 'Test SMS Connection'}
          </button>
        </div>
      </div>

      {/* Email — Resend */}
      <div className={`rounded-xl border p-5 transition-all ${emailConnected ? 'border-green-200 bg-green-50/30' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Mail size={15} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Resend Email</p>
              <p className="text-xs text-slate-400">Transactional email, homeowner notifications, cadence emails</p>
            </div>
          </div>
          {emailConnected && (
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle size={11} /> Connected
            </span>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Resend API Key</label>
            <input type="password" placeholder="re_••••••••" value={resendKey} onChange={e => setResendKey(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button
            onClick={testEmail}
            disabled={testingEmail}
            className="flex items-center justify-center gap-2 py-2 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors w-full"
          >
            {testingEmail ? <RefreshCw size={12} className="animate-spin" /> : <Mail size={12} />}
            {testingEmail ? 'Testing connection…' : 'Test Email Connection'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
        <Shield size={13} className="text-blue-500 shrink-0" />
        Credentials are stored in your environment config and never logged. Update them anytime in Admin Config.
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TeamOnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  const [dataSources, setDataSources] = useState<DataSource[]>(defaultDataSources);
  const [templates, setTemplates] = useState<CadenceTemplate[]>(defaultTemplates);
  const [assignmentRules, setAssignmentRules] = useState<AssignmentRule[]>([
    { id: 'rule-default-1', condition: 'Agent Capacity', conditionValue: '< 50 leads', assignTo: 'Auto-assign (round robin)' },
    { id: 'rule-default-2', condition: 'Regulation Status', conditionValue: 'Banned', assignTo: 'Unassigned Queue' },
  ]);

  const steps: OnboardingStep[] = [
    { id: 'data-sources', title: 'Data Sources', description: 'Configure lead data sources', icon: Database, status: currentStep > 0 ? 'complete' : currentStep === 0 ? 'active' : 'pending' },
    { id: 'templates', title: 'Templates', description: 'Seed cadence templates', icon: Zap, status: currentStep > 1 ? 'complete' : currentStep === 1 ? 'active' : 'pending' },
    { id: 'assignment', title: 'Assignment', description: 'Define routing rules', icon: GitBranch, status: currentStep > 2 ? 'complete' : currentStep === 2 ? 'active' : 'pending' },
    { id: 'services', title: 'Services', description: 'Connect SMS & email', icon: Send, status: currentStep > 3 ? 'complete' : currentStep === 3 ? 'active' : 'pending' },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) setCurrentStep(s => s + 1);
    else setCompleted(true);
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  };

  if (completed) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Team Setup Complete!</h2>
            <p className="text-sm text-slate-500 mb-6">
              Your data sources, cadence templates, assignment rules, and service connections are configured. Your team is ready to start working leads.
            </p>
            <div className="grid grid-cols-2 gap-3 text-left mb-6">
              {[
                { label: 'Data Sources', value: `${dataSources.filter(s => s.enabled).length} enabled` },
                { label: 'Templates Seeded', value: `${templates.filter(t => t.selected).length} templates` },
                { label: 'Assignment Rules', value: `${assignmentRules.length} rules` },
                { label: 'Services', value: 'SMS + Email' },
              ].map(item => (
                <div key={item.label} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400">{item.label}</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setCurrentStep(0); setCompleted(false); }}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
              >
                Review Setup
              </button>
              <a href="/lead-management" className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-1.5">
                Go to Leads <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Team Onboarding</h1>
              <p className="text-sm text-slate-500 mt-0.5">Bootstrap your new account — configure sources, templates, rules, and services</p>
            </div>
            <span className="text-xs text-slate-400">Step {currentStep + 1} of {steps.length}</span>
          </div>
        </div>

        <div className="p-6 max-w-2xl mx-auto space-y-6">
          {/* Step Indicator */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-x-auto">
            <StepIndicator steps={steps} current={currentStep} />
          </div>

          {/* Step Content */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            {currentStep === 0 && <DataSourcesStep sources={dataSources} setSources={setDataSources} />}
            {currentStep === 1 && <CadenceTemplatesStep templates={templates} setTemplates={setTemplates} />}
            {currentStep === 2 && <AssignmentRulesStep rules={assignmentRules} setRules={setAssignmentRules} />}
            {currentStep === 3 && <ConnectServicesStep />}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Back
            </button>
            <div className="flex items-center gap-2">
              {steps.map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === currentStep ? 'bg-blue-600 w-4' : i < currentStep ? 'bg-green-400' : 'bg-slate-200'}`} />
              ))}
            </div>
            <button
              onClick={handleNext}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-1.5"
            >
              {currentStep === steps.length - 1 ? 'Complete Setup' : 'Continue'}
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
