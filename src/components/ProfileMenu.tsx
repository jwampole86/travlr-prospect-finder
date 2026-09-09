'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { Mail, Key, Bell, Lock, LogOut, ChevronDown, X, Eye, EyeOff, Check, Loader2, Copy, CheckCheck, RefreshCw, Monitor, Smartphone, AlertCircle } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface NotifPrefs {
  in_app: boolean;
  email: boolean;
  sms: boolean;
  lead_assigned: boolean;
  escalation: boolean;
  delivery_failure: boolean;
  weekly_digest: boolean;
}

const DEFAULT_NOTIF: NotifPrefs = {
  in_app: true,
  email: true,
  sms: false,
  lead_assigned: true,
  escalation: true,
  delivery_failure: true,
  weekly_digest: true,
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

export default function ProfileMenu() {
  const { user, role, signOut } = useAuth();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'main' | 'password' | 'notifications' | 'apikey'>('main');
  const menuRef = useRef<HTMLDivElement>(null);

  // Password state
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, newPw: false, confirm: false });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  // Notification prefs
  const [notif, setNotif] = useState<NotifPrefs>(DEFAULT_NOTIF);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  // API key
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);

  // Profile data
  const [profileName, setProfileName] = useState('');
  const [profileRole, setProfileRole] = useState('');

  useEffect(() => {
    if (user) {
      setProfileName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Agent');
      setProfileRole(role || 'agent');
    }
  }, [user, role]);

  // Load notification prefs from DB
  const loadNotifPrefs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('notification_preferences')
      .eq('id', user.id)
      .single();
    if (data?.notification_preferences) {
      setNotif({ ...DEFAULT_NOTIF, ...data.notification_preferences });
    }
  }, [user, supabase]);

  useEffect(() => {
    if (open && activePanel === 'notifications') {
      loadNotifPrefs();
    }
  }, [open, activePanel, loadNotifPrefs]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActivePanel('main');
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const initials = profileName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'AG';

  async function handlePasswordUpdate() {
    if (!pwForm.newPw || pwForm.newPw !== pwForm.confirm) {
      setPwError('New passwords do not match.');
      return;
    }
    if (pwForm.newPw.length < 8) {
      setPwError('Password must be at least 8 characters.');
      return;
    }
    setPwLoading(true);
    setPwError('');
    try {
      const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
      if (error) throw error;
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      setPwError(err?.message || 'Failed to update password.');
    } finally {
      setPwLoading(false);
    }
  }

  async function handleSaveNotif() {
    if (!user) return;
    setNotifLoading(true);
    try {
      await supabase
        .from('user_profiles')
        .update({ notification_preferences: notif })
        .eq('id', user.id);
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2500);
    } finally {
      setNotifLoading(false);
    }
  }

  async function loadApiKey() {
    if (!user) return;
    setApiKeyLoading(true);
    try {
      const { data } = await supabase
        .from('agent_api_keys')
        .select('api_key')
        .eq('user_id', user.id)
        .single();
      if (data?.api_key) {
        setApiKey(data.api_key);
      } else {
        // Generate a new key
        const newKey = `trvlr_${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
        await supabase.from('agent_api_keys').upsert({ user_id: user.id, api_key: newKey });
        setApiKey(newKey);
      }
    } finally {
      setApiKeyLoading(false);
    }
  }

  async function regenerateApiKey() {
    if (!user || !confirm('Regenerate your API key? The old key will stop working immediately.')) return;
    setApiKeyLoading(true);
    try {
      const newKey = `trvlr_${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      await supabase.from('agent_api_keys').upsert({ user_id: user.id, api_key: newKey });
      setApiKey(newKey);
    } finally {
      setApiKeyLoading(false);
    }
  }

  async function copyApiKey() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setApiKeyCopied(true);
    setTimeout(() => setApiKeyCopied(false), 2500);
  }

  useEffect(() => {
    if (open && activePanel === 'apikey' && !apiKey) {
      loadApiKey();
    }
  }, [open, activePanel]);

  const ROLE_LABEL: Record<string, string> = {
    admin: 'Admin',
    agent: 'Agent',
    manager: 'Manager',
    viewer: 'Viewer',
    homeowner: 'Homeowner',
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger */}
      <button
        onClick={() => { setOpen((v) => !v); setActivePanel('main'); }}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-muted transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
          <span className="text-[11px] font-bold text-primary">{initials}</span>
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-xs font-semibold text-foreground leading-tight max-w-[120px] truncate">{profileName}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{ROLE_LABEL[profileRole] || profileRole}</p>
        </div>
        <ChevronDown size={12} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-[9999] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">{initials}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{profileName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary capitalize">
              {ROLE_LABEL[profileRole] || profileRole}
            </span>
          </div>

          {/* Main panel */}
          {activePanel === 'main' && (
            <div className="py-1">
              <button
                onClick={() => setActivePanel('password')}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
              >
                <Lock size={14} className="text-muted-foreground" />
                Update Password
              </button>
              <button
                onClick={() => setActivePanel('notifications')}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
              >
                <Bell size={14} className="text-muted-foreground" />
                Notification Preferences
              </button>
              <button
                onClick={() => setActivePanel('apikey')}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
              >
                <Key size={14} className="text-muted-foreground" />
                API Key for Integrations
              </button>
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={() => signOut()}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {/* Password panel */}
          {activePanel === 'password' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => setActivePanel('main')} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
                <p className="text-sm font-semibold text-foreground">Update Password</p>
              </div>
              {(['newPw', 'confirm'] as const).map((field) => (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {field === 'newPw' ? 'New Password' : 'Confirm Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPw[field] ? 'text' : 'password'}
                      value={pwForm[field]}
                      onChange={(e) => setPwForm((f) => ({ ...f, [field]: e.target.value }))}
                      placeholder={field === 'newPw' ? 'Min. 8 characters' : 'Repeat new password'}
                      className="w-full pr-9 pl-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => ({ ...s, [field]: !s[field] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw[field] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
              ))}
              {pwError && (
                <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                  <AlertCircle size={12} />{pwError}
                </div>
              )}
              {pwSuccess && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-500 bg-emerald-500/10 px-3 py-2 rounded-lg">
                  <Check size={12} />Password updated successfully!
                </div>
              )}
              <button
                onClick={handlePasswordUpdate}
                disabled={pwLoading}
                className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all"
              >
                {pwLoading ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                Update Password
              </button>
            </div>
          )}

          {/* Notifications panel */}
          {activePanel === 'notifications' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => setActivePanel('main')} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
                <p className="text-sm font-semibold text-foreground">Notification Preferences</p>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Channels</p>
                {[
                  { key: 'in_app' as const, label: 'In-App', icon: Monitor },
                  { key: 'email' as const, label: 'Email', icon: Mail },
                  { key: 'sms' as const, label: 'SMS', icon: Smartphone },
                ].map(({ key, label, icon: Icon }) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <Icon size={13} className="text-muted-foreground" />
                      <span className="text-sm text-foreground">{label}</span>
                    </div>
                    <Toggle checked={notif[key]} onChange={(v) => setNotif((n) => ({ ...n, [key]: v }))} />
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Event Types</p>
                {[
                  { key: 'lead_assigned' as const, label: 'Lead Assigned' },
                  { key: 'escalation' as const, label: 'Escalation Alerts' },
                  { key: 'delivery_failure' as const, label: 'Delivery Failures' },
                  { key: 'weekly_digest' as const, label: 'Weekly Digest' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="text-sm text-foreground">{label}</span>
                    <Toggle checked={notif[key]} onChange={(v) => setNotif((n) => ({ ...n, [key]: v }))} />
                  </div>
                ))}
              </div>
              <button
                onClick={handleSaveNotif}
                disabled={notifLoading}
                className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all"
              >
                {notifLoading ? <Loader2 size={13} className="animate-spin" /> : notifSaved ? <Check size={13} /> : <Bell size={13} />}
                {notifSaved ? 'Saved!' : 'Save Preferences'}
              </button>
            </div>
          )}

          {/* API Key panel */}
          {activePanel === 'apikey' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => setActivePanel('main')} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
                <p className="text-sm font-semibold text-foreground">API Key</p>
              </div>
              <p className="text-xs text-muted-foreground">Use this key to authenticate API requests for integrations. Keep it secret.</p>
              {apiKeyLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              ) : apiKey ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5 border border-border">
                    <Key size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-xs font-mono text-foreground flex-1 truncate">{apiKey}</span>
                    <button
                      onClick={copyApiKey}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy API key"
                    >
                      {apiKeyCopied ? <CheckCheck size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                  <button
                    onClick={regenerateApiKey}
                    disabled={apiKeyLoading}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground border border-border rounded-xl hover:bg-muted transition-all"
                  >
                    <RefreshCw size={13} />
                    Regenerate Key
                  </button>
                </div>
              ) : (
                <button
                  onClick={loadApiKey}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all"
                >
                  <Key size={13} />
                  Generate API Key
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
