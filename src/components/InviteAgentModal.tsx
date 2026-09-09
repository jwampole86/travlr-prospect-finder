'use client';

import React, { useState } from 'react';
import { X, Check, Loader2, AlertCircle, Copy, CheckCheck, Mail, Send } from 'lucide-react';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

interface InviteAgentModalProps {
  onClose: () => void;
  onInviteSent: () => void;
  invitedBy?: string;
}

export default function InviteAgentModal({ onClose, onInviteSent, invitedBy }: InviteAgentModalProps) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    assignedPortfolios: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ inviteLink: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleState = (s: string) =>
    setForm((f) => ({
      ...f,
      assignedPortfolios: f.assignedPortfolios.includes(s)
        ? f.assignedPortfolios.filter((x) => x !== s)
        : [...f.assignedPortfolios, s],
    }));

  async function handleSend() {
    setError('');
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('A valid email address is required.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/agent-invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          assignedPortfolios: form.assignedPortfolios,
          invitedBy,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Failed to send invite.');
        return;
      }

      setResult({ inviteLink: data.inviteLink, emailSent: data.emailSent });
      onInviteSent();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!result?.inviteLink) return;
    await navigator.clipboard.writeText(result.inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Invite Agent</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Generate a secure, single-use invite link</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {result ? (
          /* ── Success state ── */
          <div className="p-6 space-y-5">
            <div className="flex items-start gap-3 p-4 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <Check size={15} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Invite created!</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.emailSent
                    ? `An invite email was sent to ${form.email}. The link expires in 7 days.`
                    : `Email delivery failed — copy the link below and send it manually.`}
                </p>
              </div>
            </div>

            {!result.emailSent && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/8 border border-amber-500/20 rounded-xl text-xs text-amber-600">
                <AlertCircle size={12} />
                Email could not be sent automatically. Use the link below.
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Invite Link</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 text-xs font-mono bg-muted border border-border rounded-lg text-muted-foreground truncate">
                  {result.inviteLink}
                </div>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-all shrink-0"
                >
                  {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">Single-use · Expires in 7 days · Secure token only (no sensitive data in URL)</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── Form state ── */
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">First Name *</label>
                <input
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="Jane"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Last Name *</label>
                <input
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Smith"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Mail size={11} className="text-muted-foreground" />
                Email Address *
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jane@example.com"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-[11px] text-muted-foreground">This becomes their login email.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Assigned Portfolio/Zone (optional)</label>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-background border border-border rounded-lg">
                {US_STATES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleState(s)}
                    className={`px-2 py-0.5 text-xs rounded-md font-medium transition-all ${
                      form.assignedPortfolios.includes(s)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {form.assignedPortfolios.length > 0 && (
                <p className="text-[11px] text-muted-foreground">{form.assignedPortfolios.length} state{form.assignedPortfolios.length !== 1 ? 's' : ''} selected</p>
              )}
            </div>

            {/* Role badge */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">Agent</span>
              <p className="text-xs text-muted-foreground">Role is fixed to Agent for invite-based onboarding.</p>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <AlertCircle size={13} />
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {saving ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
