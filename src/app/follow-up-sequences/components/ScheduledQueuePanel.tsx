'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ListOrdered, RefreshCw, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Calendar, Users, Edit3, Trash2, Play, Pause } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface ScheduledBatch {
  id: string;
  sequence_id: string | null;
  sequence_name: string | null;
  template_id: string | null;
  message_body: string;
  send_mode: string;
  batch_frequency: string;
  scheduled_at: string;
  max_per_batch: number;
  batch_interval_hours: number;
  status: 'scheduled' | 'sending' | 'completed' | 'failed' | 'paused';
  total_leads: number;
  sent_count: number;
  created_at: string;
  agent_name: string | null;
}

interface ScheduledQueuePanelProps {
  sequenceId?: string; // if provided, filter to this sequence only
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  scheduled: { label: 'Scheduled', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: <Clock size={11} /> },
  sending: { label: 'Sending', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: <RefreshCw size={11} className="animate-spin" /> },
  completed: { label: 'Completed', color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: <CheckCircle size={11} /> },
  failed: { label: 'Failed', color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <XCircle size={11} /> },
  paused: { label: 'Paused', color: 'bg-muted text-muted-foreground border-border', icon: <Pause size={11} /> },
};

// Mock data for when table doesn't exist yet
const MOCK_QUEUE: ScheduledBatch[] = [
  {
    id: 'mock-1',
    sequence_id: null,
    sequence_name: 'Initial Outreach',
    template_id: 'intro',
    message_body: 'Hi {{contactName}}, this is your TRAVLR agent…',
    send_mode: 'scheduled',
    batch_frequency: 'daily',
    scheduled_at: new Date(Date.now() + 3600000 * 2).toISOString(),
    max_per_batch: 50,
    batch_interval_hours: 24,
    status: 'scheduled',
    total_leads: 48,
    sent_count: 0,
    created_at: new Date().toISOString(),
    agent_name: 'Agent',
  },
  {
    id: 'mock-2',
    sequence_id: null,
    sequence_name: 'Follow-Up Sequence',
    template_id: 'followup1',
    message_body: 'Hi {{contactName}}, just following up…',
    send_mode: 'scheduled',
    batch_frequency: 'weekly',
    scheduled_at: new Date(Date.now() + 3600000 * 48).toISOString(),
    max_per_batch: 100,
    batch_interval_hours: 168,
    status: 'scheduled',
    total_leads: 92,
    sent_count: 0,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    agent_name: 'Agent',
  },
  {
    id: 'mock-3',
    sequence_id: null,
    sequence_name: 'Revenue Estimate Offer',
    template_id: 'revenue',
    message_body: 'Hi {{contactName}}, I ran a quick analysis…',
    send_mode: 'now',
    batch_frequency: 'immediate',
    scheduled_at: new Date(Date.now() - 3600000 * 1).toISOString(),
    max_per_batch: 75,
    batch_interval_hours: 24,
    status: 'completed',
    total_leads: 75,
    sent_count: 72,
    created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    agent_name: 'Agent',
  },
];

function formatRelativeTime(isoString: string): string {
  const diff = new Date(isoString).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const mins = Math.floor(absDiff / 60000);
  const hours = Math.floor(absDiff / 3600000);
  const days = Math.floor(absDiff / 86400000);
  const past = diff < 0;

  if (days > 0) return past ? `${days}d ago` : `in ${days}d`;
  if (hours > 0) return past ? `${hours}h ago` : `in ${hours}h`;
  if (mins > 0) return past ? `${mins}m ago` : `in ${mins}m`;
  return past ? 'just now' : 'now';
}

export default function ScheduledQueuePanel({ sequenceId }: ScheduledQueuePanelProps) {
  const [batches, setBatches] = useState<ScheduledBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editMaxPerBatch, setEditMaxPerBatch] = useState(50);
  const supabase = createClient();

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('scheduled_sms_batches')
        .select('*')
        .order('scheduled_at', { ascending: true });

      if (sequenceId) {
        query = query.eq('sequence_id', sequenceId);
      }

      const { data, error } = await query;
      if (error || !data) {
        // Table doesn't exist yet — use mock data
        setBatches(MOCK_QUEUE);
      } else {
        setBatches(data as ScheduledBatch[]);
      }
    } catch {
      setBatches(MOCK_QUEUE);
    } finally {
      setLoading(false);
    }
  }, [sequenceId]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  async function handlePause(id: string) {
    setBatches(prev => prev.map(b => b.id === id ? { ...b, status: 'paused' } : b));
    try {
      await supabase.from('scheduled_sms_batches').update({ status: 'paused' }).eq('id', id);
    } catch { /* silent */ }
    toast.success('Batch paused');
  }

  async function handleResume(id: string) {
    setBatches(prev => prev.map(b => b.id === id ? { ...b, status: 'scheduled' } : b));
    try {
      await supabase.from('scheduled_sms_batches').update({ status: 'scheduled' }).eq('id', id);
    } catch { /* silent */ }
    toast.success('Batch resumed');
  }

  async function handleDelete(id: string) {
    setBatches(prev => prev.filter(b => b.id !== id));
    try {
      await supabase.from('scheduled_sms_batches').delete().eq('id', id);
    } catch { /* silent */ }
    toast.success('Batch removed from queue');
  }

  function startEdit(batch: ScheduledBatch) {
    setEditingId(batch.id);
    const d = new Date(batch.scheduled_at);
    setEditScheduledAt(d.toISOString().slice(0, 16));
    setEditMaxPerBatch(batch.max_per_batch);
  }

  async function saveEdit(id: string) {
    const newScheduledAt = new Date(editScheduledAt).toISOString();
    setBatches(prev => prev.map(b => b.id === id ? { ...b, scheduled_at: newScheduledAt, max_per_batch: editMaxPerBatch } : b));
    try {
      await supabase.from('scheduled_sms_batches').update({
        scheduled_at: newScheduledAt,
        max_per_batch: editMaxPerBatch,
      }).eq('id', id);
    } catch { /* silent */ }
    setEditingId(null);
    toast.success('Batch timing updated');
  }

  const pending = batches.filter(b => b.status === 'scheduled' || b.status === 'paused');
  const completed = batches.filter(b => b.status === 'completed' || b.status === 'failed');

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
          <ListOrdered size={14} className="text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Scheduled SMS Queue</span>
            {pending.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-medium">
                {pending.length} pending
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {batches.length} total · {completed.length} completed · adjust timing without manual dispatch
          </p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); loadBatches(); }}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          title="Refresh queue"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <button className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground shrink-0">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-border/60">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={16} className="animate-spin text-muted-foreground" />
            </div>
          ) : batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Calendar size={24} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No scheduled batches</p>
              <p className="text-xs text-muted-foreground">Use "Bulk SMS" in Lead Management to schedule a batch</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {/* Pending batches */}
              {pending.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-muted/20">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pending / Scheduled</span>
                  </div>
                  {pending.map(batch => (
                    <div key={batch.id} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                      {editingId === batch.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Scheduled At</label>
                              <input
                                type="datetime-local"
                                value={editScheduledAt}
                                onChange={e => setEditScheduledAt(e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Max per Batch</label>
                              <input
                                type="number"
                                min={1}
                                max={500}
                                value={editMaxPerBatch}
                                onChange={e => setEditMaxPerBatch(Number(e.target.value))}
                                className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveEdit(batch.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
                            >
                              <CheckCircle size={11} />
                              Save Changes
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">{batch.sequence_name || 'Bulk SMS Batch'}</span>
                              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_CONFIG[batch.status]?.color}`}>
                                {STATUS_CONFIG[batch.status]?.icon}
                                {STATUS_CONFIG[batch.status]?.label}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">{batch.batch_frequency}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Users size={10} />
                                {batch.total_leads} leads
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {formatRelativeTime(batch.scheduled_at)}
                              </span>
                              <span>max {batch.max_per_batch}/batch</span>
                              {batch.batch_interval_hours > 0 && (
                                <span>retry every {batch.batch_interval_hours}h</span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1 font-mono">{batch.message_body.slice(0, 80)}…</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => startEdit(batch)}
                              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                              title="Edit timing"
                            >
                              <Edit3 size={12} />
                            </button>
                            {batch.status === 'scheduled' ? (
                              <button
                                onClick={() => handlePause(batch.id)}
                                className="p-1.5 rounded-lg hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 transition-colors"
                                title="Pause batch"
                              >
                                <Pause size={12} />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleResume(batch.id)}
                                className="p-1.5 rounded-lg hover:bg-green-500/10 text-muted-foreground hover:text-green-600 transition-colors"
                                title="Resume batch"
                              >
                                <Play size={12} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(batch.id)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                              title="Remove from queue"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Completed batches */}
              {completed.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-muted/20">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Completed / Failed</span>
                  </div>
                  {completed.map(batch => (
                    <div key={batch.id} className="px-4 py-3 hover:bg-muted/20 transition-colors opacity-75">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{batch.sequence_name || 'Bulk SMS Batch'}</span>
                            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_CONFIG[batch.status]?.color}`}>
                              {STATUS_CONFIG[batch.status]?.icon}
                              {STATUS_CONFIG[batch.status]?.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{batch.sent_count}/{batch.total_leads} sent</span>
                            <span>{formatRelativeTime(batch.scheduled_at)}</span>
                          </div>
                          {batch.status === 'completed' && batch.sent_count > 0 && (
                            <div className="mt-1.5 w-full bg-muted rounded-full h-1">
                              <div
                                className="bg-green-500 h-1 rounded-full"
                                style={{ width: `${Math.round((batch.sent_count / batch.total_leads) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(batch.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                          title="Remove"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
