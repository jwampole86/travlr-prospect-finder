'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, Zap, Target, Users, Award, AlertTriangle, TrendingUp, MessageSquare, Phone, Save, X, Wifi, WifiOff, CheckCircle, Clock } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerType = 'lead_score' | 'workload_threshold' | 'coaching_feedback' | 'call_quality';
type NotifyChannel = 'in_app' | 'email' | 'sms';

interface NotificationRule {
  id: string;
  name: string;
  triggerType: TriggerType;
  enabled: boolean;
  conditions: RuleCondition;
  channels: NotifyChannel[];
  messageTemplate: string;
  createdAt: string;
  lastTriggered: string | null;
  triggerCount: number;
}

interface RuleCondition {
  scoreThreshold?: number;
  scoreOperator?: 'gte' | 'lte';
  workloadLimit?: number;
  workloadStage?: string;
  feedbackRating?: number;
  callQualityDimension?: string;
  callQualityThreshold?: number;
}

interface LiveAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  triggerType: TriggerType;
  message: string;
  timestamp: string;
  read: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRIGGER_TYPES: { key: TriggerType; label: string; icon: React.ElementType; color: string; bg: string; description: string }[] = [
  {
    key: 'lead_score',
    label: 'High-Conversion Lead Score',
    icon: Target,
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    description: 'Trigger when a lead score crosses a threshold — ideal for hot-lead alerts',
  },
  {
    key: 'workload_threshold',
    label: 'Workload Threshold',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-500/10',
    description: 'Trigger when active lead count exceeds a limit — prevents agent overload',
  },
  {
    key: 'coaching_feedback',
    label: 'Coaching Feedback Assignment',
    icon: Award,
    color: 'text-purple-600',
    bg: 'bg-purple-500/10',
    description: 'Trigger when a manager assigns coaching feedback tied to call quality',
  },
  {
    key: 'call_quality',
    label: 'Call Quality Alert',
    icon: Phone,
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    description: 'Trigger when a coaching radar dimension drops below a set score',
  },
];

const CHANNELS: { key: NotifyChannel; label: string; icon: React.ElementType }[] = [
  { key: 'in_app', label: 'In-App', icon: Bell },
  { key: 'email', label: 'Email', icon: MessageSquare },
  { key: 'sms', label: 'SMS', icon: Phone },
];

const QUALITY_DIMENSIONS = ['Pace & Delivery', 'Objection Handling', 'Close Triggers', 'Rapport Building'];
const WORKLOAD_STAGES = ['New Lead', 'Contacted', 'Interested', 'All Active'];

function defaultCondition(type: TriggerType): RuleCondition {
  switch (type) {
    case 'lead_score': return { scoreThreshold: 80, scoreOperator: 'gte' };
    case 'workload_threshold': return { workloadLimit: 20, workloadStage: 'All Active' };
    case 'coaching_feedback': return { feedbackRating: 3 };
    case 'call_quality': return { callQualityDimension: 'Objection Handling', callQualityThreshold: 50 };
  }
}

function defaultTemplate(type: TriggerType): string {
  switch (type) {
    case 'lead_score': return 'High-conversion lead detected: {{lead_name}} scored {{score}} — review and prioritize outreach.';
    case 'workload_threshold': return 'Workload alert: You have {{count}} active leads in {{stage}}. Consider reassigning or prioritizing.';
    case 'coaching_feedback': return 'New coaching feedback from your manager on call {{call_date}}. Rating: {{rating}}/5. Review in your performance dashboard.';
    case 'call_quality': return 'Call quality alert: Your {{dimension}} score dropped to {{score}}. Review coaching notes for improvement tips.';
  }
}

function triggerLabel(rule: NotificationRule): string {
  const c = rule.conditions;
  switch (rule.triggerType) {
    case 'lead_score': return `Score ${c.scoreOperator === 'gte' ? '≥' : '≤'} ${c.scoreThreshold}`;
    case 'workload_threshold': return `${c.workloadStage} > ${c.workloadLimit} leads`;
    case 'coaching_feedback': return `Manager rating ≤ ${c.feedbackRating}/5`;
    case 'call_quality': return `${c.callQualityDimension} < ${c.callQualityThreshold}`;
  }
}

function resolveMessage(template: string, record: Record<string, unknown>): string {
  return template
    .replace('{{lead_name}}', String(record.address ?? record.owner_name ?? 'Lead'))
    .replace('{{score}}', String(record.prospect_score ?? record.score ?? '—'))
    .replace('{{count}}', String(record.count ?? '—'))
    .replace('{{stage}}', String(record.stage ?? '—'))
    .replace('{{call_date}}', new Date().toLocaleDateString())
    .replace('{{rating}}', String(record.manager_rating ?? '—'))
    .replace('{{dimension}}', String(record.dimension ?? '—'));
}

// ─── Rule Form ────────────────────────────────────────────────────────────────

function RuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<NotificationRule>;
  onSave: (rule: Omit<NotificationRule, 'id' | 'createdAt' | 'lastTriggered' | 'triggerCount'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [triggerType, setTriggerType] = useState<TriggerType>(initial?.triggerType ?? 'lead_score');
  const [conditions, setConditions] = useState<RuleCondition>(initial?.conditions ?? defaultCondition('lead_score'));
  const [channels, setChannels] = useState<NotifyChannel[]>(initial?.channels ?? ['in_app']);
  const [messageTemplate, setMessageTemplate] = useState(initial?.messageTemplate ?? defaultTemplate('lead_score'));
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const handleTypeChange = (type: TriggerType) => {
    setTriggerType(type);
    setConditions(defaultCondition(type));
    setMessageTemplate(defaultTemplate(type));
  };

  const toggleChannel = (ch: NotifyChannel) => {
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name, triggerType, enabled, conditions, channels, messageTemplate });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{initial?.id ? 'Edit Rule' : 'New Notification Rule'}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Rule Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Hot Lead Alert, Overload Warning..."
          className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Trigger Type</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TRIGGER_TYPES.map(({ key, label, icon: TIcon, color, bg, description }) => {
            const TriggerIcon = TIcon;
            return (
            <button
              key={key}
              onClick={() => handleTypeChange(key)}
              className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                triggerType === key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
              }`}
            >
              <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                <TriggerIcon size={13} className={color} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
              </div>
            </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Trigger Conditions</label>
        <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
          {triggerType === 'lead_score' && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Trigger when lead score is</span>
              <select
                value={conditions.scoreOperator}
                onChange={e => setConditions(p => ({ ...p, scoreOperator: e.target.value as 'gte' | 'lte' }))}
                className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none"
              >
                <option value="gte">≥ (at least)</option>
                <option value="lte">≤ (at most)</option>
              </select>
              <input
                type="number" min={0} max={100}
                value={conditions.scoreThreshold}
                onChange={e => setConditions(p => ({ ...p, scoreThreshold: Number(e.target.value) }))}
                className="w-20 text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">points</span>
            </div>
          )}
          {triggerType === 'workload_threshold' && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Trigger when</span>
              <select
                value={conditions.workloadStage}
                onChange={e => setConditions(p => ({ ...p, workloadStage: e.target.value }))}
                className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none"
              >
                {WORKLOAD_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">leads exceed</span>
              <input
                type="number" min={1}
                value={conditions.workloadLimit}
                onChange={e => setConditions(p => ({ ...p, workloadLimit: Number(e.target.value) }))}
                className="w-20 text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none"
              />
            </div>
          )}
          {triggerType === 'coaching_feedback' && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Trigger when manager rating is ≤</span>
              <input
                type="number" min={1} max={5}
                value={conditions.feedbackRating}
                onChange={e => setConditions(p => ({ ...p, feedbackRating: Number(e.target.value) }))}
                className="w-16 text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">/ 5 stars</span>
            </div>
          )}
          {triggerType === 'call_quality' && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Trigger when</span>
              <select
                value={conditions.callQualityDimension}
                onChange={e => setConditions(p => ({ ...p, callQualityDimension: e.target.value }))}
                className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none"
              >
                {QUALITY_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">score drops below</span>
              <input
                type="number" min={0} max={100}
                value={conditions.callQualityThreshold}
                onChange={e => setConditions(p => ({ ...p, callQualityThreshold: Number(e.target.value) }))}
                className="w-20 text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Notify Via</label>
        <div className="flex items-center gap-2">
          {CHANNELS.map(({ key, label, icon: ChIcon }) => (
            <button
              key={key}
              onClick={() => toggleChannel(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                channels.includes(key) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/30'
              }`}
            >
              <ChIcon size={11} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
          Notification Message <span className="normal-case font-normal">(use {'{{variable}}'} placeholders)</span>
        </label>
        <textarea
          value={messageTemplate}
          onChange={e => setMessageTemplate(e.target.value)}
          rows={3}
          className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <label className="flex items-center gap-2 cursor-pointer">
          <button onClick={() => setEnabled(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
            {enabled ? <ToggleRight size={20} className="text-primary" /> : <ToggleLeft size={20} />}
          </button>
          <span className="text-xs text-muted-foreground">{enabled ? 'Rule enabled' : 'Rule disabled'}</span>
        </label>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-all">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || channels.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save size={11} />
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rule Card ────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule: NotificationRule;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const typeInfo = TRIGGER_TYPES.find(t => t.key === rule.triggerType)!;
  const TypeIcon = typeInfo.icon;

  return (
    <div className={`bg-card border rounded-xl p-4 transition-all ${rule.enabled ? 'border-border' : 'border-border/50 opacity-60'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg ${typeInfo.bg} flex items-center justify-center shrink-0`}>
          <TypeIcon size={16} className={typeInfo.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">{rule.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{typeInfo.label}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onToggle(rule.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                {rule.enabled ? <ToggleRight size={18} className="text-primary" /> : <ToggleLeft size={18} />}
              </button>
              <button onClick={() => onDelete(rule.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {triggerLabel(rule)}
            </span>
            <div className="flex items-center gap-1">
              {rule.channels.map(ch => {
                const chInfo = CHANNELS.find(c => c.key === ch)!;
                const ChIcon = chInfo.icon;
                return (
                  <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-0.5">
                    <ChIcon size={9} />
                    {chInfo.label}
                  </span>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground mt-2 line-clamp-1 italic">&ldquo;{rule.messageTemplate}&rdquo;</p>

          <div className="flex items-center gap-4 mt-2">
            <span className="text-[10px] text-muted-foreground">Triggered {rule.triggerCount}× total</span>
            {rule.lastTriggered && (
              <span className="text-[10px] text-muted-foreground">
                Last: {new Date(rule.lastTriggered).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Live Alert Toast ─────────────────────────────────────────────────────────

function LiveAlertToast({ alert, onDismiss }: { alert: LiveAlert; onDismiss: (id: string) => void }) {
  const typeInfo = TRIGGER_TYPES.find(t => t.key === alert.triggerType)!;
  const TypeIcon = typeInfo.icon;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(alert.id), 8000);
    return () => clearTimeout(timer);
  }, [alert.id, onDismiss]);

  return (
    <div className="flex items-start gap-3 bg-card border border-primary/30 rounded-xl p-3 shadow-lg animate-in slide-in-from-right-4 duration-300">
      <div className={`w-8 h-8 rounded-lg ${typeInfo.bg} flex items-center justify-center shrink-0`}>
        <TypeIcon size={14} className={typeInfo.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Live Alert</span>
          <span className="text-[10px] text-muted-foreground">{alert.ruleName}</span>
        </div>
        <p className="text-xs text-foreground mt-0.5 line-clamp-2">{alert.message}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{new Date(alert.timestamp).toLocaleTimeString()}</p>
      </div>
      <button onClick={() => onDismiss(alert.id)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Seed Rules ───────────────────────────────────────────────────────────────

const SEED_RULES: NotificationRule[] = [
  {
    id: 'rule-1',
    name: 'Hot Lead Alert',
    triggerType: 'lead_score',
    enabled: true,
    conditions: { scoreThreshold: 85, scoreOperator: 'gte' },
    channels: ['in_app', 'email'],
    messageTemplate: 'High-conversion lead detected: {{lead_name}} scored {{score}} — review and prioritize outreach.',
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    lastTriggered: new Date(Date.now() - 86400000).toISOString(),
    triggerCount: 12,
  },
  {
    id: 'rule-2',
    name: 'Workload Overload Warning',
    triggerType: 'workload_threshold',
    enabled: true,
    conditions: { workloadLimit: 25, workloadStage: 'All Active' },
    channels: ['in_app'],
    messageTemplate: 'Workload alert: You have {{count}} active leads. Consider reassigning or prioritizing.',
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    lastTriggered: null,
    triggerCount: 3,
  },
  {
    id: 'rule-3',
    name: 'Coaching Feedback Received',
    triggerType: 'coaching_feedback',
    enabled: true,
    conditions: { feedbackRating: 3 },
    channels: ['in_app', 'email'],
    messageTemplate: 'New coaching feedback from your manager on call {{call_date}}. Rating: {{rating}}/5. Review in your performance dashboard.',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    lastTriggered: new Date(Date.now() - 2 * 86400000).toISOString(),
    triggerCount: 5,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentNotificationRulesPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState<NotificationRule[]>(SEED_RULES);
  const [showForm, setShowForm] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [recentFires, setRecentFires] = useState<{ ruleId: string; ts: string }[]>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const rulesRef = useRef<NotificationRule[]>(rules);

  // Keep rulesRef in sync so realtime handler always sees latest rules
  useEffect(() => { rulesRef.current = rules; }, [rules]);

  // ── Evaluate a DB record against enabled rules ──────────────────────────────
  const evaluateRules = useCallback((
    eventType: 'lead_insert' | 'lead_update' | 'call_quality_insert' | 'notification_insert',
    record: Record<string, unknown>,
    oldRecord?: Record<string, unknown>
  ) => {
    const enabledRules = rulesRef.current.filter(r => r.enabled);

    enabledRules.forEach(rule => {
      let fired = false;

      if (rule.triggerType === 'lead_score' && (eventType === 'lead_insert' || eventType === 'lead_update')) {
        const score = Number(record.prospect_score ?? 0);
        const threshold = rule.conditions.scoreThreshold ?? 80;
        const op = rule.conditions.scoreOperator ?? 'gte';
        // Only fire on update if score just crossed the threshold
        if (eventType === 'lead_update' && oldRecord) {
          const oldScore = Number(oldRecord.prospect_score ?? 0);
          fired = op === 'gte'
            ? score >= threshold && oldScore < threshold
            : score <= threshold && oldScore > threshold;
        } else if (eventType === 'lead_insert') {
          fired = op === 'gte' ? score >= threshold : score <= threshold;
        }
      }

      if (rule.triggerType === 'coaching_feedback' && eventType === 'notification_insert') {
        const category = String(record.category ?? '');
        fired = category === 'coaching' || category === 'call_quality';
      }

      if (rule.triggerType === 'call_quality' && eventType === 'call_quality_insert') {
        const dim = rule.conditions.callQualityDimension ?? '';
        const threshold = rule.conditions.callQualityThreshold ?? 50;
        const dimMap: Record<string, string> = {
          'Pace & Delivery': 'pace_score',
          'Objection Handling': 'objection_score',
          'Close Triggers': 'close_trigger_score',
          'Rapport Building': 'rapport_score',
        };
        const col = dimMap[dim];
        if (col) {
          const val = Number(record[col] ?? 100);
          fired = val < threshold;
        }
      }

      if (fired) {
        const alertId = `alert-${Date.now()}-${rule.id}`;
        const message = resolveMessage(rule.messageTemplate, record);
        const newAlert: LiveAlert = {
          id: alertId,
          ruleId: rule.id,
          ruleName: rule.name,
          triggerType: rule.triggerType,
          message,
          timestamp: new Date().toISOString(),
          read: false,
        };
        setLiveAlerts(prev => [newAlert, ...prev].slice(0, 10));
        setRecentFires(prev => [{ ruleId: rule.id, ts: new Date().toISOString() }, ...prev].slice(0, 50));
        setRules(prev => prev.map(r =>
          r.id === rule.id
            ? { ...r, triggerCount: r.triggerCount + 1, lastTriggered: new Date().toISOString() }
            : r
        ));
      }
    });
  }, []);

  // ── Supabase real-time subscription ────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`agent-notification-rules-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, payload => {
        evaluateRules('lead_insert', payload.new as Record<string, unknown>);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, payload => {
        evaluateRules('lead_update', payload.new as Record<string, unknown>, payload.old as Record<string, unknown>);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_quality_scores' }, payload => {
        evaluateRules('call_quality_insert', payload.new as Record<string, unknown>);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'app_notifications',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        evaluateRules('notification_insert', payload.new as Record<string, unknown>);
      })
      .subscribe(status => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setRealtimeConnected(false);
    };
  }, [user?.id, evaluateRules]);

  const handleSave = (ruleData: Omit<NotificationRule, 'id' | 'createdAt' | 'lastTriggered' | 'triggerCount'>) => {
    const newRule: NotificationRule = {
      ...ruleData,
      id: `rule-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastTriggered: null,
      triggerCount: 0,
    };
    setRules(prev => [newRule, ...prev]);
    setShowForm(false);
  };

  const handleToggle = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const handleDelete = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const dismissAlert = useCallback((id: string) => {
    setLiveAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const activeCount = rules.filter(r => r.enabled).length;
  const totalTriggers = rules.reduce((a, r) => a + r.triggerCount, 0);

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Notification Rules</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Auto-trigger alerts for high-conversion leads, workload limits, and coaching feedback — fires instantly via real-time subscriptions
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Real-time status badge */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
              realtimeConnected
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' :'border-border bg-muted text-muted-foreground'
            }`}>
              {realtimeConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
              {realtimeConnected ? 'Live' : 'Connecting...'}
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={14} />
              New Rule
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Active Rules', value: activeCount.toString(), icon: Zap, iconBg: 'bg-primary/10', iconColor: 'text-primary' },
            { label: 'Total Rules', value: rules.length.toString(), icon: Bell, iconBg: 'bg-muted', iconColor: 'text-muted-foreground' },
            { label: 'Total Triggers', value: totalTriggers.toString(), icon: TrendingUp, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600' },
          ].map(({ label, value, icon: StatIcon, iconBg, iconColor }) => {
            const StatsIcon = StatIcon;
            return (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
                  <StatsIcon size={13} className={iconColor} />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
            );
          })}
        </div>

        {/* Live Alert Toasts */}
        {liveAlerts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Live Alerts ({liveAlerts.length})</span>
            </div>
            {liveAlerts.map(alert => (
              <LiveAlertToast key={alert.id} alert={alert} onDismiss={dismissAlert} />
            ))}
          </div>
        )}

        {/* New Rule Form */}
        {showForm && (
          <RuleForm onSave={handleSave} onCancel={() => setShowForm(false)} />
        )}

        {/* Rules List */}
        {rules.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Bell size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm font-semibold text-foreground mb-1">No rules yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create your first notification rule to auto-trigger alerts based on lead activity, workload, or coaching feedback.</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={14} />
              Create First Rule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{rules.length} Rules</p>
            </div>
            {rules.map(rule => (
              <RuleCard key={rule.id} rule={rule} onToggle={handleToggle} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* Recent Trigger History */}
        {recentFires.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock size={13} className="text-primary" />
              Recent Real-Time Fires (this session)
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {recentFires.map((f, i) => {
                const rule = rules.find(r => r.id === f.ruleId);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                    <span className="text-xs text-foreground">{rule?.name ?? f.ruleId}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{new Date(f.ts).toLocaleTimeString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info Panel */}
        <div className="bg-muted/30 border border-border rounded-xl p-5">
          <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-500" />
            How Real-Time Notification Rules Work
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: Target, label: 'Lead Score Rules', desc: 'Fire the instant a lead\'s AI prospect score crosses your threshold via Supabase real-time — no page refresh needed.' },
              { icon: Users, label: 'Workload Rules', desc: 'Alert when your active lead count exceeds a limit, preventing burnout and missed follow-ups.' },
              { icon: Award, label: 'Coaching Feedback', desc: 'Notified instantly when a manager assigns feedback tied to a call quality review.' },
              { icon: Phone, label: 'Call Quality Alerts', desc: 'Triggered in real-time when a coaching radar dimension (pace, rapport, etc.) drops below your set threshold.' },
            ].map(({ icon: InfoIcon, label, desc }) => {
              const InfoPanelIcon = InfoIcon;
              return (
              <div key={label} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <InfoPanelIcon size={11} className="text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
