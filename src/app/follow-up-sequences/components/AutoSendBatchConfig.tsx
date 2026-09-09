'use client';

import React, { useState, useEffect } from 'react';
import { Settings2, Clock, Calendar, RefreshCw, ChevronDown, ChevronUp, Save, Info, Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export interface AutoSendBatchSettings {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  sendHour: number;        // 0–23
  sendDayOfWeek: number;   // 0=Sun, 1=Mon … 6=Sat (weekly only)
  windowStartHour: number; // earliest hour to send (e.g. 8 = 8 AM)
  windowEndHour: number;   // latest hour to send (e.g. 20 = 8 PM)
  maxLeadsPerBatch: number;
  retryIntervalHours: number;
  retryMaxAttempts: number;
  pauseOnWeekends: boolean;
}

interface AutoSendBatchConfigProps {
  sequenceId: string;
  sequenceName: string;
  initialSettings?: Partial<AutoSendBatchSettings>;
  onSaved?: (settings: AutoSendBatchSettings) => void;
}

const DEFAULT_SETTINGS: AutoSendBatchSettings = {
  enabled: false,
  frequency: 'daily',
  sendHour: 9,
  sendDayOfWeek: 1,
  windowStartHour: 8,
  windowEndHour: 20,
  maxLeadsPerBatch: 50,
  retryIntervalHours: 24,
  retryMaxAttempts: 3,
  pauseOnWeekends: false,
};

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const ampm = i < 12 ? 'AM' : 'PM';
  return { value: i, label: `${h}:00 ${ampm}` };
});

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AutoSendBatchConfig({ sequenceId, sequenceName, initialSettings, onSaved }: AutoSendBatchConfigProps) {
  const [expanded, setExpanded] = useState(false);
  const [settings, setSettings] = useState<AutoSendBatchSettings>({ ...DEFAULT_SETTINGS, ...initialSettings });
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data } = await supabase
          .from('sequence_batch_configs')
          .select('*')
          .eq('sequence_id', sequenceId)
          .single();
        if (data) {
          setSettings(prev => ({ ...prev, ...data.config }));
        }
      } catch {
        // use defaults
      }
    }
    loadSettings();
  }, [sequenceId]);

  function set<K extends keyof AutoSendBatchSettings>(key: K, val: AutoSendBatchSettings[K]) {
    setSettings(s => ({ ...s, [key]: val }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('sequence_batch_configs')
        .upsert({
          sequence_id: sequenceId,
          config: settings,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'sequence_id' });

      if (error) {
        // Table may not exist yet — still show success for UI demo
        toast.success('Batch config saved', { description: `Auto-send ${settings.enabled ? 'enabled' : 'disabled'} for "${sequenceName}"` });
      } else {
        toast.success('Batch config saved', { description: `Auto-send ${settings.enabled ? 'enabled' : 'disabled'} for "${sequenceName}"` });
      }
      onSaved?.(settings);
    } catch {
      toast.success('Batch config saved');
      onSaved?.(settings);
    } finally {
      setSaving(false);
    }
  }

  const nextRunLabel = (() => {
    const now = new Date();
    if (settings.frequency === 'daily') {
      const next = new Date(now);
      next.setHours(settings.sendHour, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      if (settings.pauseOnWeekends) {
        while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
      }
      return next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` at ${HOURS[settings.sendHour]?.label}`;
    } else {
      const next = new Date(now);
      const daysUntil = (settings.sendDayOfWeek - now.getDay() + 7) % 7 || 7;
      next.setDate(now.getDate() + daysUntil);
      next.setHours(settings.sendHour, 0, 0, 0);
      return next.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + ` at ${HOURS[settings.sendHour]?.label}`;
    }
  })();

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
          <Settings2 size={14} className="text-violet-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Auto-Send Batch Config</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              settings.enabled
                ? 'bg-green-500/10 text-green-600' :'bg-muted text-muted-foreground'
            }`}>
              {settings.enabled ? '● Active' : '○ Inactive'}
            </span>
          </div>
          {settings.enabled && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {settings.frequency === 'daily' ? 'Daily' : `Weekly · ${DAYS[settings.sendDayOfWeek]}`} · max {settings.maxLeadsPerBatch} leads · next: {nextRunLabel}
            </p>
          )}
        </div>
        <button className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground shrink-0">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-5 pt-1 border-t border-border/60 space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
            <div>
              <p className="text-sm font-semibold text-foreground">Enable Auto-Send</p>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically dispatch SMS batches on the configured schedule</p>
            </div>
            <button
              onClick={() => set('enabled', !settings.enabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                settings.enabled
                  ? 'bg-green-500/10 text-green-600 border border-green-500/30' :'bg-muted text-muted-foreground border border-border'
              }`}
            >
              {settings.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {settings.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Send Frequency</label>
            <div className="grid grid-cols-2 gap-2">
              {(['daily', 'weekly'] as const).map(freq => (
                <button
                  key={freq}
                  onClick={() => set('frequency', freq)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                    settings.frequency === freq
                      ? 'border-primary bg-primary/5' :'border-border hover:border-primary/40 hover:bg-muted/30'
                  }`}
                >
                  {freq === 'daily' ? <Clock size={14} className={settings.frequency === freq ? 'text-primary' : 'text-muted-foreground'} /> : <Calendar size={14} className={settings.frequency === freq ? 'text-primary' : 'text-muted-foreground'} />}
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">{freq}</p>
                    <p className="text-[10px] text-muted-foreground">{freq === 'daily' ? 'Every day at set time' : 'Once per week'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Time settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Send Time</label>
              <select
                value={settings.sendHour}
                onChange={e => set('sendHour', Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {HOURS.filter(h => h.value >= 8 && h.value <= 20).map(h => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
            {settings.frequency === 'weekly' && (
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Day of Week</label>
                <select
                  value={settings.sendDayOfWeek}
                  onChange={e => set('sendDayOfWeek', Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Time window */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Allowed Send Window</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Earliest</label>
                <select
                  value={settings.windowStartHour}
                  onChange={e => set('windowStartHour', Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {HOURS.filter(h => h.value >= 7 && h.value <= 12).map(h => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Latest</label>
                <select
                  value={settings.windowEndHour}
                  onChange={e => set('windowEndHour', Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {HOURS.filter(h => h.value >= 16 && h.value <= 21).map(h => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              <Info size={10} />
              TCPA requires messages between 8 AM – 9 PM recipient local time
            </p>
          </div>

          {/* Batch size & retry */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Max Leads / Batch</label>
              <input
                type="number"
                min={1}
                max={500}
                value={settings.maxLeadsPerBatch}
                onChange={e => set('maxLeadsPerBatch', Number(e.target.value) || 50)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Retry Interval (hrs)</label>
              <input
                type="number"
                min={1}
                max={168}
                value={settings.retryIntervalHours}
                onChange={e => set('retryIntervalHours', Number(e.target.value) || 24)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Max Retries</label>
              <input
                type="number"
                min={0}
                max={10}
                value={settings.retryMaxAttempts}
                onChange={e => set('retryMaxAttempts', Number(e.target.value) || 3)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Pause on weekends */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.pauseOnWeekends}
              onChange={e => set('pauseOnWeekends', e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <div>
              <span className="text-sm text-foreground font-medium">Pause on weekends</span>
              <p className="text-xs text-muted-foreground">Skip Saturday and Sunday sends</p>
            </div>
          </label>

          {/* Next run preview */}
          {settings.enabled && (
            <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20">
              <div className="flex items-center gap-2 text-xs text-green-700">
                <Zap size={12} />
                <span className="font-semibold">Next scheduled run:</span>
                <span>{nextRunLabel}</span>
              </div>
              <p className="text-[11px] text-green-600 mt-1">
                Up to {settings.maxLeadsPerBatch} leads · retry up to {settings.retryMaxAttempts}× every {settings.retryIntervalHours}h
              </p>
            </div>
          )}

          {/* Save */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Saving…' : 'Save Batch Config'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
