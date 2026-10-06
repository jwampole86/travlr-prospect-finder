'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import {
  MessageCircle, Send, Search, Plus, Users, X, Loader2, Check, ArrowLeft, Hash, Pencil, Trash2,
} from 'lucide-react';
import {
  ChatChannelSummary, ChatMessage, ChatRosterMember, TeamDirectoryUser,
  listMyChannels, listTeamDirectory, listMessages, listChannelRoster,
  sendMessage, createDM, createGroup, markChannelRead, editMessage, deleteMessage,
} from '@/lib/services/chatService';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function channelDisplayName(c: ChatChannelSummary): string {
  if (c.type === 'group') return c.name || 'Group';
  return c.other_user_name || 'Unknown user';
}

// ─── New Message Modal ─────────────────────────────────────────────────────────

function NewMessageModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (channelId: string) => void;
}) {
  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const [directory, setDirectory] = useState<TeamDirectoryUser[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTeamDirectory()
      .then(setDirectory)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load team directory'))
      .finally(() => setLoadingDirectory(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter(
      (u) => (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
  }, [directory, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    if (mode === 'dm') {
      const id = Array.from(selected)[0];
      if (!id) { setError('Pick a team member to message'); return; }
      setSubmitting(true);
      try {
        const channelId = await createDM(id);
        onCreated(channelId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start conversation');
      } finally {
        setSubmitting(false);
      }
    } else {
      if (!groupName.trim()) { setError('Group name is required'); return; }
      if (selected.size === 0) { setError('Pick at least one team member'); return; }
      setSubmitting(true);
      try {
        const channelId = await createGroup(groupName.trim(), '', Array.from(selected));
        onCreated(channelId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create group');
      } finally {
        setSubmitting(false);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">New Message</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 p-2 border-b border-border">
          <button
            onClick={() => { setMode('dm'); setSelected(new Set()); }}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === 'dm' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            Direct Message
          </button>
          <button
            onClick={() => { setMode('group'); setSelected(new Set()); }}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === 'group' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            Group Channel
          </button>
        </div>

        {mode === 'group' && (
          <div className="px-4 pt-3">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name (e.g. Maryland Portfolio Team)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}

        <div className="px-4 pt-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team members…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[160px]">
          {loadingDirectory ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No team members found.</p>
          ) : (
            filtered.map((u) => {
              const isSelected = selected.has(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => (mode === 'dm' ? setSelected(new Set([u.id])) : toggle(u.id))}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${isSelected ? 'bg-primary/10' : 'hover:bg-muted'}`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                    {initials(u.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{u.full_name || u.email}</p>
                    <p className="text-[11px] text-muted-foreground truncate capitalize">{u.app_role || 'team member'}</p>
                  </div>
                  {isSelected && <Check size={15} className="text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {error && <p className="px-4 text-xs text-danger">{error}</p>}

        <div className="p-3 border-t border-border">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
            {mode === 'dm' ? 'Start Conversation' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function TeamChatPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [channels, setChannels] = useState<ChatChannelSummary[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [roster, setRoster] = useState<ChatRosterMember[]>([]);
  const [showRoster, setShowRoster] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadChannels = useCallback(async () => {
    try {
      const data = await listMyChannels();
      setChannels(data);
    } catch { /* silent — keep last known list */ }
    setLoadingChannels(false);
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const activeChannel = useMemo(() => channels.find((c) => c.channel_id === activeChannelId) || null, [channels, activeChannelId]);

  const openChannel = useCallback(async (channelId: string) => {
    setActiveChannelId(channelId);
    setMobileShowThread(true);
    setLoadingMessages(true);
    setShowRoster(false);
    setRoster([]);
    try {
      const data = await listMessages(channelId);
      setMessages(data);
      await markChannelRead(channelId);
      setChannels((prev) => prev.map((c) => (c.channel_id === channelId ? { ...c, unread_count: 0 } : c)));
    } catch { /* silent */ }
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime: new messages in the open channel append live; any message
  // elsewhere refreshes the channel list (ordering, previews, unread counts).
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`team-chat:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as { id: string; channel_id: string; sender_id: string; created_at: string };
        if (msg.channel_id === activeChannelId) {
          listMessages(msg.channel_id).then(setMessages).catch(() => {});
          if (msg.sender_id !== user.id) markChannelRead(msg.channel_id).catch(() => {});
        }
        loadChannels();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as { channel_id: string };
        if (msg.channel_id === activeChannelId) {
          listMessages(msg.channel_id).then(setMessages).catch(() => {});
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeChannelId, loadChannels, supabase]);

  async function handleSend() {
    if (!activeChannelId || !composer.trim() || sending) return;
    setSending(true);
    const body = composer;
    setComposer('');
    try {
      await sendMessage(activeChannelId, body);
      const data = await listMessages(activeChannelId);
      setMessages(data);
      loadChannels();
    } catch {
      setComposer(body);
    }
    setSending(false);
  }

  async function handleOpenRoster() {
    if (!activeChannelId) return;
    setShowRoster((v) => !v);
    if (roster.length === 0) {
      try { setRoster(await listChannelRoster(activeChannelId)); } catch { /* silent */ }
    }
  }

  async function saveEdit(id: string) {
    if (!editBody.trim()) return;
    try {
      await editMessage(id, editBody);
      if (activeChannelId) setMessages(await listMessages(activeChannelId));
    } catch { /* silent */ }
    setEditingId(null);
  }

  async function removeMessage(id: string) {
    try {
      await deleteMessage(id);
      if (activeChannelId) setMessages(await listMessages(activeChannelId));
    } catch { /* silent */ }
  }

  const filteredChannels = channels.filter((c) => {
    if (!search.trim()) return true;
    const name = channelDisplayName(c).toLowerCase();
    return name.includes(search.toLowerCase()) || (c.last_message_preview || '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Channel list */}
        <div className={`w-full md:w-80 shrink-0 border-r border-border flex flex-col bg-card ${mobileShowThread ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h1 className="text-base font-bold text-foreground flex items-center gap-2">
              <MessageCircle size={18} className="text-primary" /> Team Chat
            </h1>
            <button
              onClick={() => setShowNewMessage(true)}
              title="New message"
              className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="px-3 pt-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin mt-2">
            {loadingChannels ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : filteredChannels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
                <MessageCircle size={28} className="text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No conversations yet</p>
                <p className="text-xs text-muted-foreground">Start a direct message or create a group to message your team.</p>
              </div>
            ) : (
              filteredChannels.map((c) => {
                const isActive = c.channel_id === activeChannelId;
                return (
                  <button
                    key={c.channel_id}
                    onClick={() => openChannel(c.channel_id)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${isActive ? 'bg-primary/5' : ''}`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${c.type === 'group' ? 'bg-violet-500/15 text-violet-600' : 'bg-primary/15 text-primary'}`}>
                      {c.type === 'group' ? <Hash size={15} /> : initials(c.other_user_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-sm truncate ${c.unread_count > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                          {channelDisplayName(c)}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(c.last_message_at)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[11px] text-muted-foreground truncate">{c.last_message_preview || 'No messages yet'}</p>
                        {c.unread_count > 0 && (
                          <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-danger text-[9px] font-bold text-white flex items-center justify-center">
                            {c.unread_count > 99 ? '99+' : c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={`flex-1 flex flex-col min-w-0 ${mobileShowThread ? 'flex' : 'hidden md:flex'}`}>
          {!activeChannel ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
              <MessageCircle size={36} className="text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Select a conversation</p>
              <p className="text-xs text-muted-foreground">Or start a new message with a teammate.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border shrink-0">
                <button onClick={() => setMobileShowThread(false)} className="md:hidden p-1 rounded text-muted-foreground hover:bg-muted">
                  <ArrowLeft size={16} />
                </button>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${activeChannel.type === 'group' ? 'bg-violet-500/15 text-violet-600' : 'bg-primary/15 text-primary'}`}>
                  {activeChannel.type === 'group' ? <Hash size={14} /> : initials(activeChannel.other_user_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{channelDisplayName(activeChannel)}</p>
                  {activeChannel.type === 'group' && <p className="text-[11px] text-muted-foreground">{activeChannel.member_count} members</p>}
                </div>
                {activeChannel.type === 'group' && (
                  <button onClick={handleOpenRoster} title="Members" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Users size={15} />
                  </button>
                )}
              </div>

              {showRoster && (
                <div className="border-b border-border px-4 py-2.5 bg-muted/30 flex flex-wrap gap-2">
                  {roster.map((m) => (
                    <span key={m.user_id} className="text-[11px] px-2 py-1 rounded-full bg-card border border-border text-foreground">
                      {m.full_name || 'Unknown'}{m.member_role === 'owner' ? ' · owner' : ''}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                ) : messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Say hello 👋</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === user?.id;
                    const isDeleted = !!m.deleted_at;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`group max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                          {!mine && activeChannel.type === 'group' && (
                            <span className="text-[10px] text-muted-foreground mb-0.5 px-1">{m.sender_name || 'Unknown'}</span>
                          )}
                          {editingId === m.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                value={editBody}
                                onChange={(e) => setEditBody(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(m.id); if (e.key === 'Escape') setEditingId(null); }}
                                autoFocus
                                className="px-2.5 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                              <button onClick={() => saveEdit(m.id)} className="text-[11px] text-primary font-semibold">Save</button>
                            </div>
                          ) : (
                            <div
                              className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                                isDeleted
                                  ? 'bg-muted text-muted-foreground italic'
                                  : mine
                                    ? 'bg-primary text-white rounded-br-sm'
                                    : 'bg-muted text-foreground rounded-bl-sm'
                              }`}
                            >
                              {isDeleted ? 'Message deleted' : m.body}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5 px-1">
                            <span className="text-[10px] text-muted-foreground">{timeAgo(m.created_at)}{m.edited_at ? ' · edited' : ''}</span>
                            {mine && !isDeleted && editingId !== m.id && (
                              <span className="hidden group-hover:flex items-center gap-1">
                                <button onClick={() => { setEditingId(m.id); setEditBody(m.body); }} className="text-muted-foreground hover:text-foreground">
                                  <Pencil size={10} />
                                </button>
                                <button onClick={() => removeMessage(m.id)} className="text-muted-foreground hover:text-danger">
                                  <Trash2 size={10} />
                                </button>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t border-border shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Message your team…"
                    rows={1}
                    className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!composer.trim() || sending}
                    className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all disabled:opacity-50 shrink-0"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showNewMessage && (
        <NewMessageModal
          onClose={() => setShowNewMessage(false)}
          onCreated={(channelId) => {
            setShowNewMessage(false);
            loadChannels().then(() => openChannel(channelId));
          }}
        />
      )}
    </AppLayout>
  );
}
