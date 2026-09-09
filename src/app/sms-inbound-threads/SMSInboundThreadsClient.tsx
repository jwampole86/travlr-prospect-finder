'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import {
  MessageSquare, Send, RefreshCw, ThumbsUp, ThumbsDown, Clock, CheckCircle,
  XCircle, ArrowLeft, User, Search, BarChart2, MessageCircle,
} from 'lucide-react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationThread {
  id: string;
  campaign_id: string | null;
  lead_id: string | null;
  phone: string;
  contact_name: string | null;
  conversation_status: 'pending' | 'interested' | 'not_interested' | 'follow_up' | 'opted_out' | 'closed';
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  campaign_name?: string;
}

interface ThreadMessage {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  twilio_message_sid: string | null;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', icon: Clock },
  interested: { label: 'Interested', color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: ThumbsUp },
  not_interested: { label: 'Not Interested', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', icon: ThumbsDown },
  follow_up: { label: 'Follow-Up', color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Clock },
  opted_out: { label: 'Opted Out', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', icon: XCircle },
  closed: { label: 'Closed', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', icon: CheckCircle },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SMSInboundThreadsClient() {
  const searchParams = useSearchParams();
  const campaignFilter = searchParams.get('campaign');

  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const loadThreads = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('sms_conversation_threads')
      .select('*')
      .order('last_inbound_at', { ascending: false, nullsFirst: false })
      .limit(100);

    if (campaignFilter) query = query.eq('campaign_id', campaignFilter);
    if (statusFilter !== 'all') query = query.eq('conversation_status', statusFilter);

    const { data } = await query;
    const threadList = (data as ConversationThread[]) ?? [];

    // Enrich with campaign names
    const campaignIds = [...new Set(threadList.map(t => t.campaign_id).filter(Boolean))] as string[];
    if (campaignIds.length > 0) {
      const { data: camps } = await supabase
        .from('sms_campaigns')
        .select('id,campaign_name')
        .in('id', campaignIds);
      const campMap = new Map((camps ?? []).map((c: { id: string; campaign_name: string }) => [c.id, c.campaign_name]));
      threadList.forEach(t => {
        if (t.campaign_id) t.campaign_name = campMap.get(t.campaign_id);
      });
    }

    setThreads(threadList);
    setLoading(false);
  }, [campaignFilter, statusFilter]);

  const loadMessages = useCallback(async (thread: ConversationThread) => {
    setSelectedThread(thread);
    setNotes(thread.notes ?? '');
    setMessagesLoading(true);
    const { data } = await supabase
      .from('sms_thread_messages')
      .select('*')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true });
    setMessages((data as ThreadMessage[]) ?? []);
    setMessagesLoading(false);

    if (thread.unread_count > 0) {
      await supabase.from('sms_conversation_threads').update({ unread_count: 0 }).eq('id', thread.id);
      setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, unread_count: 0 } : t));
    }
  }, []);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('sms-threads-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_thread_messages' }, (payload) => {
        const msg = payload.new as ThreadMessage;
        if (selectedThread && msg.thread_id === selectedThread.id) {
          setMessages(prev => [...prev, msg]);
        }
        loadThreads();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sms_conversation_threads' }, () => {
        loadThreads();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedThread, loadThreads]);

  const sendReply = async () => {
    if (!selectedThread || !replyBody.trim() || sending) return;
    setSending(true);
    const body = replyBody.trim();
    setReplyBody('');

    try {
      const { data: msgData } = await supabase
        .from('sms_thread_messages')
        .insert({ thread_id: selectedThread.id, direction: 'outbound', body, status: 'queued' })
        .select()
        .single();

      if (msgData) setMessages(prev => [...prev, msgData as ThreadMessage]);

      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: selectedThread.phone, body, leadId: selectedThread.lead_id }),
      });
      const result = await res.json();
      const sid = result.messageSid ?? result.sid ?? null;

      if (msgData && sid) {
        await supabase.from('sms_thread_messages').update({ twilio_message_sid: sid, status: 'sent' }).eq('id', (msgData as ThreadMessage).id);
        setMessages(prev => prev.map(m => m.id === (msgData as ThreadMessage).id ? { ...m, twilio_message_sid: sid, status: 'sent' } : m));
      }

      await supabase.from('sms_conversation_threads').update({
        last_outbound_at: new Date().toISOString(),
        last_message_preview: body.slice(0, 100),
        updated_at: new Date().toISOString(),
      }).eq('id', selectedThread.id);
    } catch (err) {
      console.error('[sendReply]', err);
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (status: ConversationThread['conversation_status']) => {
    if (!selectedThread || updatingStatus) return;
    setUpdatingStatus(true);
    await supabase.from('sms_conversation_threads').update({ conversation_status: status, updated_at: new Date().toISOString() }).eq('id', selectedThread.id);

    if (selectedThread.campaign_id) {
      const eventType = status === 'interested' ? 'interested' : status === 'not_interested' ? 'not_interested' : status === 'follow_up' ? 'follow_up' : null;
      if (eventType) {
        await supabase.from('sms_analytics_events').insert({
          campaign_id: selectedThread.campaign_id,
          lead_id: selectedThread.lead_id,
          phone: selectedThread.phone,
          event_type: eventType,
        });
      }
    }

    setSelectedThread(prev => prev ? { ...prev, conversation_status: status } : null);
    setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, conversation_status: status } : t));
    setUpdatingStatus(false);
  };

  const saveNotes = async () => {
    if (!selectedThread) return;
    setSavingNotes(true);
    await supabase.from('sms_conversation_threads').update({ notes, updated_at: new Date().toISOString() }).eq('id', selectedThread.id);
    setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, notes } : t));
    setSavingNotes(false);
  };

  const filteredThreads = threads.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (t.contact_name ?? '').toLowerCase().includes(q) || t.phone.includes(q) || (t.last_message_preview ?? '').toLowerCase().includes(q);
  });

  const statusCounts = threads.reduce((acc, t) => {
    acc[t.conversation_status] = (acc[t.conversation_status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* ── Left Panel: Thread List ── */}
        <div className={`${selectedThread ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-80 xl:w-96 border-r border-border bg-card shrink-0`}>
          <div className="px-4 py-3 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-sm font-bold text-foreground">Inbound Threads</h1>
                <p className="text-[11px] text-muted-foreground">{threads.length} conversations</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Link href="/sms-campaign-analytics" className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors" title="Campaign Analytics">
                  <BarChart2 size={13} />
                </Link>
                <button onClick={loadThreads} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {['all', 'pending', 'interested', 'not_interested', 'follow_up'].map(s => {
                const cfg = s === 'all' ? null : STATUS_CONFIG[s];
                const count = s === 'all' ? threads.length : (statusCounts[s] ?? 0);
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap border transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-primary/40'}`}
                  >
                    {s === 'all' ? 'All' : cfg?.label}
                    <span className="font-mono-data">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs">
                {searchQuery ? 'No conversations match your search.' : 'No inbound conversations yet.'}
              </div>
            ) : (
              filteredThreads.map(thread => {
                const cfg = STATUS_CONFIG[thread.conversation_status] ?? STATUS_CONFIG.pending;
                const StatusIcon = cfg.icon;
                const isSelected = selectedThread?.id === thread.id;
                return (
                  <button
                    key={thread.id}
                    onClick={() => loadMessages(thread)}
                    className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/40 transition-colors ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User size={14} className="text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground truncate">{thread.contact_name ?? thread.phone}</span>
                            {thread.unread_count > 0 && (
                              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center shrink-0">{thread.unread_count}</span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{thread.last_message_preview ?? 'No messages yet'}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{thread.last_inbound_at ? timeAgo(thread.last_inbound_at) : '—'}</span>
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                          <StatusIcon size={8} />{cfg.label}
                        </span>
                      </div>
                    </div>
                    {thread.campaign_name && <p className="text-[10px] text-muted-foreground mt-1 pl-10 truncate">📣 {thread.campaign_name}</p>}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right Panel: Conversation View ── */}
        {selectedThread ? (
          <div className="flex-1 flex flex-col min-w-0 bg-background">
            <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setSelectedThread(null)} className="lg:hidden p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
                  <ArrowLeft size={13} />
                </button>
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User size={16} className="text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground truncate">{selectedThread.contact_name ?? selectedThread.phone}</h2>
                    {selectedThread.lead_id && (
                      <Link href={`/lead-profile?id=${selectedThread.lead_id}`} className="text-[10px] text-primary hover:underline shrink-0">View Lead</Link>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground font-mono-data">{selectedThread.phone}</span>
                    {selectedThread.campaign_name && <span className="text-[10px] text-muted-foreground">· {selectedThread.campaign_name}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(['interested', 'not_interested', 'follow_up'] as const).map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  const isActive = selectedThread.conversation_status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => updateStatus(s)}
                      disabled={updatingStatus}
                      title={cfg.label}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${isActive ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-muted text-muted-foreground border-border hover:border-primary/40'}`}
                    >
                      <Icon size={11} />
                      <span className="hidden sm:inline">{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  <RefreshCw size={14} className="animate-spin mr-2" /> Loading messages…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                  <MessageCircle size={24} className="opacity-40" />
                  <p>No messages in this thread yet.</p>
                  <p className="text-xs">Send a reply below to start the conversation.</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.direction === 'outbound' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-card border border-border text-foreground rounded-bl-sm'}`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                      <div className={`flex items-center gap-1.5 mt-1 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <span className={`text-[10px] ${msg.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        {msg.direction === 'outbound' && <span className="text-[10px] text-primary-foreground/70 capitalize">{msg.status}</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-border bg-card">
              <div className="px-4 pt-3 pb-2 border-b border-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Agent Notes</span>
                  <button onClick={saveNotes} disabled={savingNotes} className="text-[10px] text-primary hover:underline disabled:opacity-50">
                    {savingNotes ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add context notes about this conversation…"
                  rows={2}
                  className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div className="px-4 py-3 flex items-end gap-2">
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply(); }}
                  placeholder="Type a reply… (⌘+Enter to send)"
                  rows={2}
                  className="flex-1 text-sm bg-muted border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !replyBody.trim()}
                  className="p-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                >
                  {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center bg-muted/20">
            <div className="text-center space-y-3">
              <MessageSquare size={40} className="text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">Select a conversation to view messages</p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
