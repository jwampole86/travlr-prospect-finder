'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MessageSquare, BookOpen, Key, Mic, Plus, Edit2, Trash2, Save, CheckCircle, Loader2, Shield, Phone, FileSignature, CreditCard, TestTube, Check, AlertTriangle,  } from 'lucide-react';
import toast from 'react-hot-toast';
import { OBJECTION_LIBRARY, type ObjectionEntry } from '@/lib/objectionLibrary';

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminTab = 'sms-templates' | 'objection-library' | 'api-credentials' | 'call-recording';

interface SMSTemplate {
  id: string;
  name: string;
  body: string;
  category: string;
  tag?: string;
  variables: string[];
}

interface ObjectionDraft {
  id: string;
  category: string;
  label: string;
  response: string;
  note?: string;
  isCustom?: boolean;
}

interface CallRecordingPrefs {
  enabled: boolean;
  dualChannel: boolean;
  retentionDays: number;
  autoTranscribe: boolean;
  notifyAgent: boolean;
  notifyManager: boolean;
  storageProvider: 'twilio' | 'supabase';
}

// ─── API Credential Status ────────────────────────────────────────────────────

const API_SERVICES = [
  {
    key: 'twilio',
    label: 'Twilio',
    icon: Phone,
    description: 'Voice calls, SMS, and call recording',
    envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_TWIML_APP_SID'],
    color: 'text-red-500 bg-red-500/10',
  },
  {
    key: 'docusign',
    label: 'DocuSign',
    icon: FileSignature,
    description: 'Agreement signing and envelope management',
    envVars: ['DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_ACCOUNT_ID', 'DOCUSIGN_USER_ID', 'DOCUSIGN_TEMPLATE_ID'],
    color: 'text-blue-500 bg-blue-500/10',
  },
  {
    key: 'stripe',
    label: 'Stripe',
    icon: CreditCard,
    description: 'Payout account verification and Connect',
    envVars: ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'],
    color: 'text-violet-500 bg-violet-500/10',
  },
];

function APICredentialCard({ service }: { service: typeof API_SERVICES[0] }) {
  const [status, setStatus] = useState<'checking' | 'ok' | 'missing'>('checking');

  useEffect(() => {
    // Check if env vars are configured by calling a lightweight status endpoint
    const timer = setTimeout(() => {
      // Heuristic: if the key is a placeholder, it's missing
      if (service.key === 'twilio') {
        fetch('/api/twilio/voice/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: 'status-check' }) })
          .then(r => setStatus(r.ok ? 'ok' : 'missing'))
          .catch(() => setStatus('missing'));
      } else if (service.key === 'docusign') {
        fetch('/api/docusign/sessions', { method: 'GET' })
          .then(r => setStatus(r.status !== 500 ? 'ok' : 'missing'))
          .catch(() => setStatus('missing'));
      } else {
        // Stripe — check if publishable key looks real
        const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
        setStatus(key && !key.includes('your-') ? 'ok' : 'missing');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [service.key]);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${service.color}`}>
          <service.icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{service.label}</h3>
            {status === 'checking' && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
            {status === 'ok' && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <CheckCircle size={9} />Connected
              </span>
            )}
            {status === 'missing' && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                <AlertTriangle size={9} />Needs Setup
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {service.envVars.map(v => (
              <span key={v} className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border">{v}</span>
            ))}
          </div>
          {status === 'missing' && (
            <p className="text-[11px] text-amber-600 mt-2">Add the required environment variables in your .env file to enable this integration.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SMS Templates Tab ────────────────────────────────────────────────────────

function SMSTemplatesTab() {
  const supabase = createClient();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: '', body: '', category: 'Initial Outreach', tag: '' });

  useEffect(() => {
    loadTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTemplates() {
    setLoading(true);
    const { data } = await supabase.from('message_templates').select('*').eq('type', 'sms').order('created_at', { ascending: false });
    setTemplates((data ?? []) as SMSTemplate[]);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.body.trim()) { toast.error('Name and body required'); return; }
    const vars = (form.body.match(/\{\{[^}]+\}\}/g) ?? []).filter((v, i, a) => a.indexOf(v) === i);
    if (editingId) {
      await supabase.from('message_templates').update({ name: form.name, body: form.body, category: form.category, tag: form.tag, variables: vars }).eq('id', editingId);
      toast.success('Template updated');
    } else {
      await supabase.from('message_templates').insert({ name: form.name, body: form.body, category: form.category, tag: form.tag, variables: vars, type: 'sms', owner_user_id: user?.id });
      toast.success('Template created');
    }
    setEditingId(null);
    setShowNew(false);
    setForm({ name: '', body: '', category: 'Initial Outreach', tag: '' });
    loadTemplates();
  }

  async function handleDelete(id: string) {
    await supabase.from('message_templates').delete().eq('id', id);
    toast.success('Template deleted');
    loadTemplates();
  }

  function handleTest(template: SMSTemplate) {
    const resolved = template.body
      .replace(/\{\{senderName\}\}/g, 'Alex')
      .replace(/\{\{contactName\}\}/g, 'Jordan')
      .replace(/\{\{address\}\}/g, '123 Mountain View Dr')
      .replace(/\{\{localBlurb\}\}/g, 'Colorado is one of the top short-term rental markets in the US')
      .replace(/\{\{proposedRent\}\}/g, '$3,200/mo')
      .replace(/\{\{leaseTerm\}\}/g, '12 months')
      .replace(/\{\{opt_out\}\}/g, 'Reply STOP to opt out');
    setTestResult(prev => ({ ...prev, [template.id]: resolved }));
  }

  function startEdit(t: SMSTemplate) {
    setEditingId(t.id);
    setForm({ name: t.name, body: t.body, category: t.category, tag: t.tag ?? '' });
    setShowNew(false);
  }

  const CATEGORIES = ['Initial Outreach', 'Follow-Up', 'Proposal', 'Closing', 'Nurture', 'Re-engagement', 'Other'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage SMS templates used for outreach. Variables are auto-resolved at send time.</p>
        <button
          onClick={() => { setShowNew(true); setEditingId(null); setForm({ name: '', body: '', category: 'Initial Outreach', tag: '' }); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />New Template
        </button>
      </div>

      {(showNew || editingId) && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">{editingId ? 'Edit Template' : 'New SMS Template'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Template name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Body *</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={4} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" placeholder="Hi {{contactName}}, I'm {{senderName}} with TRAVLR..." />
            <p className="text-[10px] text-muted-foreground">Variables: {'{{senderName}}'} {'{{contactName}}'} {'{{address}}'} {'{{localBlurb}}'} {'{{opt_out}}'}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Save size={13} />Save
            </button>
            <button onClick={() => { setEditingId(null); setShowNew(false); }} className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No SMS templates yet. Create one above.</div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{t.name}</span>
                    <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{t.category}</span>
                    {t.tag && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t.tag}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{t.body}</p>
                  {testResult[t.id] && (
                    <div className="mt-2 p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                      <p className="text-[10px] font-semibold text-emerald-600 mb-1">Preview (test variables)</p>
                      <p className="text-xs text-foreground">{testResult[t.id]}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => handleTest(t)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors" title="Test preview">
                    <TestTube size={13} />
                  </button>
                  <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Objection Library Tab ────────────────────────────────────────────────────

function ObjectionLibraryTab() {
  const [entries, setEntries] = useState<ObjectionDraft[]>(() =>
    OBJECTION_LIBRARY.map(e => ({ id: e.id, category: e.category, label: e.label, response: e.response, note: e.note, isCustom: false }))
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testMatch, setTestMatch] = useState<ObjectionDraft | null>(null);
  const [form, setForm] = useState({ category: '', label: '', response: '', note: '' });

  function handleTest() {
    const lower = testInput.toLowerCase();
    const match = OBJECTION_LIBRARY.find(e => e.patterns.some(p => p.test(lower)));
    if (match) {
      setTestMatch(entries.find(e => e.id === match.id) ?? null);
    } else {
      setTestMatch(null);
    }
  }

  function startEdit(e: ObjectionDraft) {
    setEditingId(e.id);
    setForm({ category: e.category, label: e.label, response: e.response, note: e.note ?? '' });
    setShowNew(false);
  }

  function handleSave() {
    if (!form.label.trim() || !form.response.trim()) { toast.error('Label and response required'); return; }
    if (editingId) {
      setEntries(prev => prev.map(e => e.id === editingId ? { ...e, ...form } : e));
      toast.success('Entry updated');
      setEditingId(null);
    } else {
      const newId = `custom-${Date.now()}`;
      setEntries(prev => [...prev, { id: newId, ...form, isCustom: true }]);
      toast.success('Entry added');
      setShowNew(false);
    }
    setForm({ category: '', label: '', response: '', note: '' });
  }

  const categories = [...new Set(entries.map(e => e.category))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Pre-built responses to common homeowner objections. Matched before LLM generation.</p>
        <button onClick={() => { setShowNew(true); setEditingId(null); setForm({ category: '', label: '', response: '', note: '' }); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus size={14} />Add Entry
        </button>
      </div>

      {/* Test Input */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5"><TestTube size={13} />Test Objection Matching</p>
        <div className="flex gap-2">
          <input
            value={testInput}
            onChange={e => setTestInput(e.target.value)}
            placeholder="Type a homeowner objection to test matching..."
            className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            onKeyDown={e => e.key === 'Enter' && handleTest()}
          />
          <button onClick={handleTest} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">Test</button>
        </div>
        {testInput && (
          <div className="mt-3">
            {testMatch ? (
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <p className="text-[10px] font-semibold text-emerald-600 mb-1">✓ Matched: {testMatch.label}</p>
                <p className="text-xs text-foreground">{testMatch.response}</p>
              </div>
            ) : (
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <p className="text-[10px] font-semibold text-amber-600">No library match — would fall back to LLM generation</p>
              </div>
            )}
          </div>
        )}
      </div>

      {(showNew || editingId) && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">{editingId ? 'Edit Entry' : 'New Objection Entry'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Category</label>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. Management Fee" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Label *</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Short description" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Response *</label>
            <textarea value={form.response} onChange={e => setForm(f => ({ ...f, response: e.target.value }))} rows={4} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" placeholder='Suggested next line: "..."' />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Coaching Note</label>
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Optional note for agents" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"><Save size={13} />Save</button>
            <button onClick={() => { setEditingId(null); setShowNew(false); }} className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map(cat => (
          <div key={cat}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</p>
            <div className="space-y-2">
              {entries.filter(e => e.category === cat).map(entry => (
                <div key={entry.id} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{entry.label}</span>
                        {entry.isCustom && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Custom</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{entry.response}</p>
                      {entry.note && <p className="text-[10px] text-amber-600 mt-1 italic">{entry.note}</p>}
                    </div>
                    <button onClick={() => startEdit(entry)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors shrink-0">
                      <Edit2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Call Recording Prefs Tab ─────────────────────────────────────────────────

function CallRecordingTab() {
  const [prefs, setPrefs] = useState<CallRecordingPrefs>({
    enabled: true,
    dualChannel: true,
    retentionDays: 90,
    autoTranscribe: true,
    notifyAgent: false,
    notifyManager: true,
    storageProvider: 'twilio',
  });
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    toast.success('Call recording preferences saved');
    setTimeout(() => setSaved(false), 2000);
  }

  function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <button
          onClick={() => onChange(!checked)}
          className={`relative w-10 h-5.5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted border border-border'}`}
          style={{ height: '22px', width: '40px' }}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Configure how call recordings are captured, stored, and retained.</p>

      <div className="bg-card border border-border rounded-xl p-4 space-y-1">
        <Toggle checked={prefs.enabled} onChange={v => setPrefs(p => ({ ...p, enabled: v }))} label="Enable Call Recording" description="Record all outbound calls via Twilio" />
        <Toggle checked={prefs.dualChannel} onChange={v => setPrefs(p => ({ ...p, dualChannel: v }))} label="Dual-Channel Recording" description="Separate audio tracks for agent and homeowner" />
        <Toggle checked={prefs.autoTranscribe} onChange={v => setPrefs(p => ({ ...p, autoTranscribe: v }))} label="Auto-Transcribe Recordings" description="Generate transcript immediately after call ends" />
        <Toggle checked={prefs.notifyAgent} onChange={v => setPrefs(p => ({ ...p, notifyAgent: v }))} label="Notify Agent When Recording Starts" description="Show on-screen indicator during live call" />
        <Toggle checked={prefs.notifyManager} onChange={v => setPrefs(p => ({ ...p, notifyManager: v }))} label="Notify Manager of Flagged Calls" description="Alert when a call is flagged for escalation" />
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Recording Retention (days)</label>
          <div className="flex items-center gap-3">
            <input
              type="range" min={30} max={365} step={30}
              value={prefs.retentionDays}
              onChange={e => setPrefs(p => ({ ...p, retentionDays: parseInt(e.target.value) }))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-semibold text-foreground w-16 text-right">{prefs.retentionDays} days</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Recordings older than this will be automatically deleted. Minimum 30 days recommended for dispute resolution.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Storage Provider</label>
          <div className="flex gap-2">
            {(['twilio', 'supabase'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPrefs(prev => ({ ...prev, storageProvider: p }))}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all capitalize ${prefs.storageProvider === p ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:bg-muted'}`}
              >
                {p === 'twilio' ? 'Twilio (default)' : 'Supabase Storage'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700">Compliance Notice</p>
            <p className="text-xs text-amber-600 mt-0.5">All-party consent laws vary by state. Ensure your call recording disclosure is active before enabling recording. TRAVLR's consent acknowledgment screen covers this for calls initiated through the teleprompter.</p>
          </div>
        </div>
      </div>

      <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
        {saved ? <Check size={14} /> : <Save size={14} />}
        {saved ? 'Saved!' : 'Save Preferences'}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminManagementPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('sms-templates');

  const tabs = [
    { key: 'sms-templates' as AdminTab, label: 'SMS Templates', icon: MessageSquare },
    { key: 'objection-library' as AdminTab, label: 'Objection Library', icon: BookOpen },
    { key: 'api-credentials' as AdminTab, label: 'API Credentials', icon: Key },
    { key: 'call-recording' as AdminTab, label: 'Call Recording', icon: Mic },
  ];

  return (
    <AppLayout>
      <div className="px-4 sm:px-6 py-5 max-w-screen-xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Admin Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage SMS templates, objection library, API integrations, and call recording settings.</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-[400px]">
          {activeTab === 'sms-templates' && <SMSTemplatesTab />}
          {activeTab === 'objection-library' && <ObjectionLibraryTab />}
          {activeTab === 'api-credentials' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Live status of third-party API integrations. Configure credentials in your .env file.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {API_SERVICES.map(s => <APICredentialCard key={s.key} service={s} />)}
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5"><Shield size={13} />Security Note</p>
                <p className="text-xs text-muted-foreground">API credentials are stored as server-side environment variables and never exposed to the browser. To update credentials, edit your .env file and redeploy.</p>
              </div>
            </div>
          )}
          {activeTab === 'call-recording' && <CallRecordingTab />}
        </div>
      </div>
    </AppLayout>
  );
}
