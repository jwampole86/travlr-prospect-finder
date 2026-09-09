'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Bell, DollarSign, Home, BarChart2, Send, CheckCircle, Clock, AlertTriangle, Mail, RefreshCw, Eye, XCircle, RotateCcw, Zap, ChevronDown, ChevronRight, AlertOctagon, Activity, Filter } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifType = 'payout_alert' | 'lease_milestone' | 'weekly_summary';
type NotifStatus = 'sent' | 'scheduled' | 'failed' | 'draft';
type RetryStatus = 'pending' | 'retrying' | 'exhausted' | 'recovered';
type BounceType = 'hard' | 'soft' | 'spam' | 'unsubscribe';

interface NotificationRule {
  id: string;
  type: NotifType;
  label: string;
  description: string;
  enabled: boolean;
  trigger: string;
  recipients: number;
  lastSent?: string;
  nextSend?: string;
}

interface NotificationLog {
  id: string;
  type: NotifType;
  subject: string;
  recipient: string;
  property: string;
  status: NotifStatus;
  sentAt: string;
  openedAt?: string;
}

interface RetryQueueItem {
  id: string;
  type: NotifType;
  subject: string;
  recipient: string;
  property: string;
  status: RetryStatus;
  attempts: number;
  maxAttempts: number;
  lastAttempt: string;
  nextRetry?: string;
  errorCode: string;
  errorMessage: string;
  createdAt: string;
}

interface DeadLetterItem {
  id: string;
  type: NotifType;
  subject: string;
  recipient: string;
  property: string;
  attempts: number;
  firstFailed: string;
  lastFailed: string;
  errorCode: string;
  errorMessage: string;
  bounceType?: BounceType;
  canRecover: boolean;
}

interface BounceRecord {
  id: string;
  recipient: string;
  property: string;
  bounceType: BounceType;
  bounceCode: string;
  bounceMessage: string;
  occurredAt: string;
  recoveryStatus: 'unresolved' | 'email_updated' | 'suppressed' | 'recovered';
  alternateEmail?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const notifRules: NotificationRule[] = [
  { id: 'rule-1', type: 'payout_alert', label: 'Payout Ready Alert', description: 'Notify homeowner when payout is processed and funds are on the way', enabled: true, trigger: 'On payout status = processed', recipients: 47, lastSent: '2 hours ago' },
  { id: 'rule-2', type: 'payout_alert', label: 'Payout Delayed Warning', description: 'Alert homeowner if payout is delayed beyond expected date by 48h', enabled: true, trigger: 'Payout overdue > 48h', recipients: 8, lastSent: '1 day ago' },
  { id: 'rule-3', type: 'lease_milestone', label: 'Lease Signed Confirmation', description: 'Congratulate homeowner when a new lease is signed on their property', enabled: true, trigger: 'DocuSign envelope completed', recipients: 12, lastSent: '3 hours ago' },
  { id: 'rule-4', type: 'lease_milestone', label: 'Lease Expiry Reminder', description: 'Remind homeowner 60, 30, and 7 days before lease expiration', enabled: true, trigger: '60d / 30d / 7d before lease end', recipients: 31, lastSent: 'Yesterday', nextSend: 'In 6 days' },
  { id: 'rule-5', type: 'lease_milestone', label: 'Unit Vacant Alert', description: 'Notify homeowner when a unit becomes vacant and is listed for re-leasing', enabled: false, trigger: 'Lease stage = Vacant', recipients: 0 },
  { id: 'rule-6', type: 'weekly_summary', label: 'Weekly Property Activity Summary', description: 'Every Monday: inquiries, showings, applications, and revenue snapshot for each property', enabled: true, trigger: 'Every Monday 8:00 AM (owner timezone)', recipients: 89, lastSent: '5 days ago', nextSend: 'In 2 days' },
];

const notifLogs: NotificationLog[] = [
  { id: 'log-1', type: 'payout_alert', subject: 'Your payout of $3,240 is on the way', recipient: 'james.porter@email.com', property: '142 Maple St', status: 'sent', sentAt: '2h ago', openedAt: '1h ago' },
  { id: 'log-2', type: 'lease_milestone', subject: 'Lease signed — 88 Oak Ave, Unit 3B', recipient: 'sarah.chen@email.com', property: '88 Oak Ave', status: 'sent', sentAt: '3h ago', openedAt: '2h ago' },
  { id: 'log-3', type: 'weekly_summary', subject: 'Your weekly property summary — Aug 11', recipient: 'mike.torres@email.com', property: 'Portfolio (4 properties)', status: 'sent', sentAt: '5d ago', openedAt: '4d ago' },
  { id: 'log-4', type: 'payout_alert', subject: 'Payout delayed — expected by Aug 20', recipient: 'linda.wu@email.com', property: '310 Pine Rd', status: 'sent', sentAt: '1d ago' },
  { id: 'log-5', type: 'lease_milestone', subject: 'Lease expiring in 30 days — 55 Birch Ln', recipient: 'carlos.reyes@email.com', property: '55 Birch Ln', status: 'sent', sentAt: 'Yesterday', openedAt: 'Yesterday' },
  { id: 'log-6', type: 'weekly_summary', subject: 'Your weekly property summary — Aug 18', recipient: 'james.porter@email.com', property: 'Portfolio (2 properties)', status: 'scheduled', sentAt: 'In 2 days' },
  { id: 'log-7', type: 'payout_alert', subject: 'Your payout of $1,850 is on the way', recipient: 'anna.kim@email.com', property: '201 Cedar Blvd', status: 'failed', sentAt: '6h ago' },
];

const retryQueueItems: RetryQueueItem[] = [
  { id: 'rq-1', type: 'payout_alert', subject: 'Your payout of $1,850 is on the way', recipient: 'anna.kim@email.com', property: '201 Cedar Blvd', status: 'retrying', attempts: 2, maxAttempts: 5, lastAttempt: '30 min ago', nextRetry: 'In 15 min', errorCode: '550', errorMessage: 'Mailbox temporarily unavailable', createdAt: '6h ago' },
  { id: 'rq-2', type: 'lease_milestone', subject: 'Lease expiring in 7 days — 99 Elm Dr', recipient: 'bob.nguyen@email.com', property: '99 Elm Dr', status: 'pending', attempts: 1, maxAttempts: 5, lastAttempt: '2h ago', nextRetry: 'In 45 min', errorCode: '421', errorMessage: 'Service temporarily unavailable', createdAt: '2h ago' },
  { id: 'rq-3', type: 'weekly_summary', subject: 'Your weekly property summary — Aug 18', recipient: 'grace.park@email.com', property: 'Portfolio (3 properties)', status: 'retrying', attempts: 3, maxAttempts: 5, lastAttempt: '1h ago', nextRetry: 'In 2h', errorCode: '452', errorMessage: 'Insufficient system storage', createdAt: '8h ago' },
  { id: 'rq-4', type: 'payout_alert', subject: 'Payout delayed — expected by Aug 22', recipient: 'tom.walsh@email.com', property: '77 Spruce Ave', status: 'recovered', attempts: 3, maxAttempts: 5, lastAttempt: '4h ago', errorCode: '250', errorMessage: 'Message accepted for delivery', createdAt: '12h ago' },
];

const deadLetterItems: DeadLetterItem[] = [
  { id: 'dl-1', type: 'payout_alert', subject: 'Your payout of $2,100 is on the way', recipient: 'invalid.user@badomain.xyz', property: '15 Walnut Ct', attempts: 5, firstFailed: '3 days ago', lastFailed: '1 day ago', errorCode: '550', errorMessage: 'User unknown — address does not exist', bounceType: 'hard', canRecover: true },
  { id: 'dl-2', type: 'lease_milestone', subject: 'Lease signed — 44 Poplar Blvd', recipient: 'old.address@defunct.net', property: '44 Poplar Blvd', attempts: 5, firstFailed: '5 days ago', lastFailed: '2 days ago', errorCode: '521', errorMessage: 'Domain does not accept mail', bounceType: 'hard', canRecover: true },
  { id: 'dl-3', type: 'weekly_summary', subject: 'Your weekly property summary — Aug 11', recipient: 'spam.trap@example.com', property: 'Portfolio (1 property)', attempts: 5, firstFailed: '7 days ago', lastFailed: '5 days ago', errorCode: '554', errorMessage: 'Message rejected as spam', bounceType: 'spam', canRecover: false },
  { id: 'dl-4', type: 'payout_alert', subject: 'Payout delayed — expected by Aug 15', recipient: 'full.mailbox@provider.com', property: '302 Hickory Ln', attempts: 5, firstFailed: '4 days ago', lastFailed: '2 days ago', errorCode: '452', errorMessage: 'Mailbox full — quota exceeded', bounceType: 'soft', canRecover: true },
];

const bounceRecords: BounceRecord[] = [
  { id: 'br-1', recipient: 'invalid.user@badomain.xyz', property: '15 Walnut Ct', bounceType: 'hard', bounceCode: '550', bounceMessage: 'User unknown', occurredAt: '3 days ago', recoveryStatus: 'unresolved' },
  { id: 'br-2', recipient: 'old.address@defunct.net', property: '44 Poplar Blvd', bounceType: 'hard', bounceCode: '521', bounceMessage: 'Domain does not accept mail', occurredAt: '5 days ago', recoveryStatus: 'email_updated', alternateEmail: 'new.address@gmail.com' },
  { id: 'br-3', recipient: 'spam.trap@example.com', property: 'Portfolio (1 property)', bounceType: 'spam', bounceCode: '554', bounceMessage: 'Message rejected as spam', occurredAt: '7 days ago', recoveryStatus: 'suppressed' },
  { id: 'br-4', recipient: 'full.mailbox@provider.com', property: '302 Hickory Ln', bounceType: 'soft', bounceCode: '452', bounceMessage: 'Mailbox full', occurredAt: '4 days ago', recoveryStatus: 'unresolved' },
  { id: 'br-5', recipient: 'temp.issue@isp.com', property: '88 Oak Ave', bounceType: 'soft', bounceCode: '421', bounceMessage: 'Service temporarily unavailable', occurredAt: '1 day ago', recoveryStatus: 'recovered' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const typeConfig: Record<NotifType, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  payout_alert: { label: 'Payout Alert', color: 'text-green-700', bg: 'bg-green-50', icon: DollarSign },
  lease_milestone: { label: 'Lease Milestone', color: 'text-blue-700', bg: 'bg-blue-50', icon: Home },
  weekly_summary: { label: 'Weekly Summary', color: 'text-purple-700', bg: 'bg-purple-50', icon: BarChart2 },
};

const statusConfig: Record<NotifStatus, { label: string; color: string; bg: string }> = {
  sent: { label: 'Sent', color: 'text-green-700', bg: 'bg-green-50' },
  scheduled: { label: 'Scheduled', color: 'text-blue-700', bg: 'bg-blue-50' },
  failed: { label: 'Failed', color: 'text-red-700', bg: 'bg-red-50' },
  draft: { label: 'Draft', color: 'text-slate-600', bg: 'bg-slate-100' },
};

const retryStatusConfig: Record<RetryStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-50', icon: Clock },
  retrying: { label: 'Retrying', color: 'text-blue-700', bg: 'bg-blue-50', icon: RotateCcw },
  exhausted: { label: 'Exhausted', color: 'text-red-700', bg: 'bg-red-50', icon: XCircle },
  recovered: { label: 'Recovered', color: 'text-green-700', bg: 'bg-green-50', icon: CheckCircle },
};

const bounceTypeConfig: Record<BounceType, { label: string; color: string; bg: string }> = {
  hard: { label: 'Hard Bounce', color: 'text-red-700', bg: 'bg-red-50' },
  soft: { label: 'Soft Bounce', color: 'text-amber-700', bg: 'bg-amber-50' },
  spam: { label: 'Spam Report', color: 'text-orange-700', bg: 'bg-orange-50' },
  unsubscribe: { label: 'Unsubscribe', color: 'text-slate-600', bg: 'bg-slate-100' },
};

const recoveryStatusConfig: Record<BounceRecord['recoveryStatus'], { label: string; color: string; bg: string }> = {
  unresolved: { label: 'Unresolved', color: 'text-red-700', bg: 'bg-red-50' },
  email_updated: { label: 'Email Updated', color: 'text-blue-700', bg: 'bg-blue-50' },
  suppressed: { label: 'Suppressed', color: 'text-slate-600', bg: 'bg-slate-100' },
  recovered: { label: 'Recovered', color: 'text-green-700', bg: 'bg-green-50' },
};

// ─── Send Test Modal ──────────────────────────────────────────────────────────

function SendTestModal({ rule, onClose }: { rule: NotificationRule; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!email) return;
    setSending(true);
    try {
      await fetch('/api/homeowner-notifications/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId: rule.id, type: rule.type, email }),
      });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-1">Send Test Email</h3>
        <p className="text-sm text-slate-500 mb-4">Send a preview of <span className="font-medium text-slate-700">{rule.label}</span> to a test address</p>
        {sent ? (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-lg p-3">
            <CheckCircle size={16} />
            <span className="text-sm font-medium">Test email sent successfully via Resend</span>
          </div>
        ) : (
          <>
            <input type="email" placeholder="test@example.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4" />
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200">Cancel</button>
              <button onClick={handleSend} disabled={!email || sending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                {sending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                {sending ? 'Sending…' : 'Send Test'}
              </button>
            </div>
          </>
        )}
        {sent && <button onClick={onClose} className="mt-3 w-full text-sm text-slate-500 hover:text-slate-700">Close</button>}
      </div>
    </div>
  );
}

// ─── Bounce Recovery Modal ────────────────────────────────────────────────────

function BounceRecoveryModal({ item, onClose }: { item: DeadLetterItem | BounceRecord; onClose: () => void }) {
  const [newEmail, setNewEmail] = useState('');
  const [action, setAction] = useState<'update_email' | 'suppress' | 'retry'>('update_email');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaved(true);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Bounce Recovery Workflow</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XCircle size={18} /></button>
        </div>
        {saved ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle size={24} className="text-green-600" />
            </div>
            <p className="text-sm font-medium text-slate-800">Recovery action applied successfully</p>
            <p className="text-xs text-slate-500">The notification will be re-queued with the updated settings.</p>
            <button onClick={onClose} className="mt-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Done</button>
          </div>
        ) : (
          <>
            <div className="bg-slate-50 rounded-lg p-3 mb-4 text-xs text-slate-600">
              <p className="font-medium text-slate-800 mb-1">Undeliverable: {item.recipient}</p>
              <p>Property: {item.property}</p>
              {'bounceType' in item && item.bounceType && (
                <p className="mt-1">Bounce type: <span className={`font-medium ${bounceTypeConfig[item.bounceType].color}`}>{bounceTypeConfig[item.bounceType].label}</span></p>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Recovery Action</p>
            <div className="space-y-2 mb-4">
              {[
                { value: 'update_email', label: 'Update email address and re-send', icon: Mail },
                { value: 'retry', label: 'Force retry with current address', icon: RotateCcw },
                { value: 'suppress', label: 'Suppress this recipient permanently', icon: XCircle },
              ].map(opt => (
                <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${action === opt.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="recovery-action" value={opt.value} checked={action === opt.value} onChange={() => setAction(opt.value as typeof action)} className="accent-blue-600" />
                  <opt.icon size={14} className={action === opt.value ? 'text-blue-600' : 'text-slate-400'} />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
            {action === 'update_email' && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">New Email Address</label>
                <input type="email" placeholder="new@email.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200">Cancel</button>
              <button onClick={handleSave} disabled={saving || (action === 'update_email' && !newEmail)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                {saving ? 'Applying…' : 'Apply Recovery'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Retry Queue Tab ──────────────────────────────────────────────────────────

function RetryQueueTab() {
  const [items, setItems] = useState(retryQueueItems);
  const [forceRetrying, setForceRetrying] = useState<string | null>(null);

  const handleForceRetry = async (id: string) => {
    setForceRetrying(id);
    await new Promise(r => setTimeout(r, 1200));
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'retrying' as RetryStatus, attempts: i.attempts + 1, lastAttempt: 'Just now', nextRetry: 'In 5 min' } : i));
    setForceRetrying(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'In Queue', value: items.filter(i => i.status === 'retrying' || i.status === 'pending').length, color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock },
          { label: 'Retrying Now', value: items.filter(i => i.status === 'retrying').length, color: 'text-blue-600', bg: 'bg-blue-50', icon: RotateCcw },
          { label: 'Recovered', value: items.filter(i => i.status === 'recovered').length, color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle },
          { label: 'Exhausted', value: items.filter(i => i.status === 'exhausted').length, color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.bg}`}><s.icon size={16} className={s.color} /></div>
            <div><p className="text-xs text-slate-500">{s.label}</p><p className="text-xl font-bold text-slate-900">{s.value}</p></div>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Activity size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Retry Policy: Exponential Backoff</p>
          <p className="text-xs text-blue-600 mt-0.5">Attempts: 5 max · Delays: 5m → 15m → 1h → 4h → 24h · Soft bounces retry; hard bounces move to Dead-Letter Queue immediately</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Active Retry Queue</h3>
          <span className="text-xs text-slate-400">{items.length} items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-medium">Notification</th>
                <th className="text-left px-4 py-3 font-medium">Recipient</th>
                <th className="text-center px-4 py-3 font-medium">Attempts</th>
                <th className="text-left px-4 py-3 font-medium">Error</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Next Retry</th>
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => {
                const sc = retryStatusConfig[item.status];
                const tc = typeConfig[item.type];
                const StatusIcon = sc.icon;
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-xs font-medium text-slate-800 truncate max-w-[200px]">{item.subject}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.color}`}>{tc.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-700">{item.recipient}</p>
                      <p className="text-[10px] text-slate-400">{item.property}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-xs font-mono font-bold text-slate-700">{item.attempts}</span>
                        <span className="text-xs text-slate-400">/ {item.maxAttempts}</span>
                      </div>
                      <div className="w-16 h-1 bg-slate-200 rounded-full mx-auto mt-1">
                        <div className="h-1 bg-blue-500 rounded-full" style={{ width: `${(item.attempts / item.maxAttempts) * 100}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono text-red-600">{item.errorCode}</p>
                      <p className="text-[10px] text-slate-500 max-w-[160px] truncate">{item.errorMessage}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>
                        <StatusIcon size={10} className={item.status === 'retrying' ? 'animate-spin' : ''} />
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.nextRetry ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {(item.status === 'pending' || item.status === 'retrying') && (
                        <button onClick={() => handleForceRetry(item.id)} disabled={forceRetrying === item.id} className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-1 ml-auto disabled:opacity-50">
                          {forceRetrying === item.id ? <RefreshCw size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                          Force Retry
                        </button>
                      )}
                      {item.status === 'recovered' && <span className="text-xs text-green-600 font-medium">✓ Delivered</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Dead Letter Queue Tab ────────────────────────────────────────────────────

function DeadLetterQueueTab() {
  const [recoveryItem, setRecoveryItem] = useState<DeadLetterItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
        <AlertOctagon size={16} className="text-red-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-800">Dead-Letter Queue — {deadLetterItems.length} Undeliverable Messages</p>
          <p className="text-xs text-red-600 mt-0.5">These notifications exhausted all retry attempts. Review each item and apply a recovery workflow or suppress the recipient.</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Dead-Letter Queue</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{deadLetterItems.filter(i => i.canRecover).length} recoverable</span>
            <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full font-medium">{deadLetterItems.length} total</span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {deadLetterItems.map(item => {
            const tc = typeConfig[item.type];
            const bt = item.bounceType ? bounceTypeConfig[item.bounceType] : null;
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id}>
                <div className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.color}`}>{tc.label}</span>
                      {bt && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${bt.bg} ${bt.color}`}>{bt.label}</span>}
                      {item.canRecover && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">Recoverable</span>}
                    </div>
                    <p className="text-sm font-medium text-slate-800 mt-1 truncate">{item.subject}</p>
                    <p className="text-xs text-slate-500">{item.recipient} · {item.property}</p>
                    <div className="flex items-center gap-4 mt-1 text-[10px] text-slate-400">
                      <span>{item.attempts} attempts</span>
                      <span>First failed: {item.firstFailed}</span>
                      <span>Last failed: {item.lastFailed}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {item.canRecover ? (
                      <button onClick={() => setRecoveryItem(item)} className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1">
                        <Zap size={11} />
                        Recover
                      </button>
                    ) : (
                      <span className="text-xs px-2.5 py-1.5 bg-slate-100 text-slate-400 rounded-lg">Suppressed</span>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-5 pb-4 bg-slate-50 border-t border-slate-100">
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-slate-500 font-medium mb-1">Error Details</p>
                        <p className="font-mono text-red-600">{item.errorCode}</p>
                        <p className="text-slate-600">{item.errorMessage}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium mb-1">Delivery Timeline</p>
                        <p className="text-slate-600">First attempt: {item.firstFailed}</p>
                        <p className="text-slate-600">Final attempt: {item.lastFailed}</p>
                        <p className="text-slate-600">Total attempts: {item.attempts}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {recoveryItem && <BounceRecoveryModal item={recoveryItem} onClose={() => setRecoveryItem(null)} />}
    </div>
  );
}

// ─── Bounce Recovery Tab ──────────────────────────────────────────────────────

function BounceRecoveryTab() {
  const [records] = useState(bounceRecords);
  const [recoveryItem, setRecoveryItem] = useState<BounceRecord | null>(null);
  const [filterType, setFilterType] = useState<BounceType | 'all'>('all');

  const filtered = filterType === 'all' ? records : records.filter(r => r.bounceType === filterType);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Bounces', value: records.length, color: 'text-slate-700', bg: 'bg-slate-100', icon: AlertTriangle },
          { label: 'Unresolved', value: records.filter(r => r.recoveryStatus === 'unresolved').length, color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
          { label: 'Recovered', value: records.filter(r => r.recoveryStatus === 'recovered').length, color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle },
          { label: 'Suppressed', value: records.filter(r => r.recoveryStatus === 'suppressed').length, color: 'text-slate-500', bg: 'bg-slate-100', icon: XCircle },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.bg}`}><s.icon size={16} className={s.color} /></div>
            <div><p className="text-xs text-slate-500">{s.label}</p><p className="text-xl font-bold text-slate-900">{s.value}</p></div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} className="text-slate-400" />
        <span className="text-xs text-slate-500">Filter:</span>
        {(['all', 'hard', 'soft', 'spam'] as const).map(t => (
          <button key={t} onClick={() => setFilterType(t)} className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${filterType === t ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {t === 'all' ? 'All' : bounceTypeConfig[t].label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Bounce Records & Recovery Workflows</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-medium">Recipient</th>
                <th className="text-left px-4 py-3 font-medium">Bounce Type</th>
                <th className="text-left px-4 py-3 font-medium">Error Code</th>
                <th className="text-left px-4 py-3 font-medium">Occurred</th>
                <th className="text-center px-4 py-3 font-medium">Recovery Status</th>
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(record => {
                const bt = bounceTypeConfig[record.bounceType];
                const rs = recoveryStatusConfig[record.recoveryStatus];
                return (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-xs font-medium text-slate-800">{record.recipient}</p>
                      <p className="text-[10px] text-slate-400">{record.property}</p>
                      {record.alternateEmail && <p className="text-[10px] text-blue-600 mt-0.5">→ {record.alternateEmail}</p>}
                    </td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${bt.bg} ${bt.color}`}>{bt.label}</span></td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono text-red-600">{record.bounceCode}</p>
                      <p className="text-[10px] text-slate-500 max-w-[140px] truncate">{record.bounceMessage}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{record.occurredAt}</td>
                    <td className="px-4 py-3 text-center"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rs.bg} ${rs.color}`}>{rs.label}</span></td>
                    <td className="px-4 py-3 text-right">
                      {record.recoveryStatus === 'unresolved' ? (
                        <button onClick={() => setRecoveryItem(record)} className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1 ml-auto">
                          <Zap size={11} />
                          Recover
                        </button>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {recoveryItem && <BounceRecoveryModal item={recoveryItem} onClose={() => setRecoveryItem(null)} />}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeownerNotificationsPage() {
  const [rules, setRules] = useState(notifRules);
  const [activeTab, setActiveTab] = useState<'rules' | 'log' | 'retry' | 'dlq' | 'bounce'>('rules');
  const [testRule, setTestRule] = useState<NotificationRule | null>(null);
  const [typeFilter, setTypeFilter] = useState<NotifType | 'all'>('all');

  const sentCount = notifLogs.filter(l => l.status === 'sent').length;
  const openRate = Math.round((notifLogs.filter(l => l.openedAt).length / notifLogs.filter(l => l.status === 'sent').length) * 100);
  const enabledRules = rules.filter(r => r.enabled).length;

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const filteredLogs = typeFilter === 'all' ? notifLogs : notifLogs.filter(l => l.type === typeFilter);

  const tabs = [
    { key: 'rules' as const, label: 'Notification Rules', badge: 0 },
    { key: 'log' as const, label: 'Send Log', badge: 0 },
    { key: 'retry' as const, label: 'Retry Queue', badge: retryQueueItems.filter(i => i.status === 'retrying' || i.status === 'pending').length },
    { key: 'dlq' as const, label: 'Dead-Letter Queue', badge: deadLetterItems.length },
    { key: 'bounce' as const, label: 'Bounce Recovery', badge: bounceRecords.filter(r => r.recoveryStatus === 'unresolved').length },
  ];

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Homeowner Notifications</h1>
              <p className="text-sm text-slate-500 mt-0.5">Proactive payout alerts, lease milestones, and weekly summaries via Resend — with retry logic and bounce recovery</p>
            </div>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-lg flex items-center gap-1">
              <Mail size={12} />
              Powered by Resend
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Active Rules', value: `${enabledRules}/${rules.length}`, icon: Bell, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Sent This Week', value: sentCount.toString(), icon: Send, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Open Rate', value: `${openRate}%`, icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'In Retry Queue', value: retryQueueItems.filter(i => i.status !== 'recovered').length.toString(), icon: RotateCcw, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Dead Letters', value: deadLetterItems.length.toString(), icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{kpi.label}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${kpi.bg}`}><kpi.icon size={18} className={kpi.color} /></div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab.label}
                {tab.badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-red-100 text-red-600' : 'bg-red-500 text-white'}`}>{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Rules Tab */}
          {activeTab === 'rules' && (
            <div className="space-y-3">
              {(['payout_alert', 'lease_milestone', 'weekly_summary'] as NotifType[]).map(type => {
                const cfg = typeConfig[type];
                const typeRules = rules.filter(r => r.type === type);
                return (
                  <div key={type} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className={`flex items-center gap-2 px-5 py-3 border-b border-slate-100 ${cfg.bg}`}>
                      <cfg.icon size={15} className={cfg.color} />
                      <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-xs text-slate-500 ml-auto">{typeRules.filter(r => r.enabled).length}/{typeRules.length} enabled</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {typeRules.map(rule => (
                        <div key={rule.id} className="flex items-start gap-4 px-5 py-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-800">{rule.label}</span>
                              {!rule.enabled && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Disabled</span>}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{rule.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                              <span className="flex items-center gap-1"><Clock size={11} />{rule.trigger}</span>
                              {rule.recipients > 0 && <span>{rule.recipients} recipients</span>}
                              {rule.lastSent && <span>Last sent: {rule.lastSent}</span>}
                              {rule.nextSend && <span className="text-blue-500">Next: {rule.nextSend}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => setTestRule(rule)} className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                              <Send size={11} />
                              Test
                            </button>
                            <button onClick={() => toggleRule(rule.id)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.enabled ? 'bg-blue-600' : 'bg-slate-200'}`}>
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Log Tab */}
          {activeTab === 'log' && (
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">Send Log</h2>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as NotifType | 'all')} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none">
                  <option value="all">All Types</option>
                  <option value="payout_alert">Payout Alerts</option>
                  <option value="lease_milestone">Lease Milestones</option>
                  <option value="weekly_summary">Weekly Summaries</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                      <th className="text-left px-5 py-3 font-medium">Type</th>
                      <th className="text-left px-4 py-3 font-medium">Subject</th>
                      <th className="text-left px-4 py-3 font-medium">Recipient</th>
                      <th className="text-left px-4 py-3 font-medium">Property</th>
                      <th className="text-center px-4 py-3 font-medium">Status</th>
                      <th className="text-right px-4 py-3 font-medium">Sent</th>
                      <th className="text-right px-4 py-3 font-medium">Opened</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLogs.map(log => {
                      const tc = typeConfig[log.type];
                      const sc = statusConfig[log.status];
                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tc.bg} ${tc.color}`}>{tc.label}</span></td>
                          <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{log.subject}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{log.recipient}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{log.property}</td>
                          <td className="px-4 py-3 text-center"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>{sc.label}</span></td>
                          <td className="px-4 py-3 text-right text-xs text-slate-500">{log.sentAt}</td>
                          <td className="px-4 py-3 text-right text-xs text-slate-500">{log.openedAt ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'retry' && <RetryQueueTab />}
          {activeTab === 'dlq' && <DeadLetterQueueTab />}
          {activeTab === 'bounce' && <BounceRecoveryTab />}
        </div>
      </div>

      {testRule && <SendTestModal rule={testRule} onClose={() => setTestRule(null)} />}
    </AppLayout>
  );
}
