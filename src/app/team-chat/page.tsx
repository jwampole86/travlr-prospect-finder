'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { AlertCircle, ArrowDown, ArrowLeft, Bell, BellOff, Check, Copy, CornerUpLeft, Loader2, MessageCircle, Pencil, Plus, Search, Send, Smile, Trash2, Users, X } from 'lucide-react';
import {
  type ChatChannelSummary, type ChatMessage, type ChatReaction, type ChatSearchHit,
  deleteMessage, editMessage, listMessages, listMyChannels, listMyMemberStates, listReactions, markChannelRead, searchMessages, sendMessage, setChannelMuted, toggleReaction,
} from '@/lib/services/chatService';
import { Avatar, EMOJIS, GroupPanel, PeoplePicker, QUICK_REACTIONS, RichText, clockTime, dayLabel, listTime } from './parts';

type UiMessage = ChatMessage & { status?: 'sending' | 'failed' };
type Filter = 'all' | 'unread' | 'dm' | 'group';
type ReplyRef = { id: string; sender_name: string | null; preview: string };

const channelName = (c: ChatChannelSummary) => (c.type === 'group' ? c.name || 'Group' : c.other_user_name || 'Unknown user');
const PAGE = 50;

function mergeMessages(prev: UiMessage[], fresh: ChatMessage[]): UiMessage[] {
  const map = new Map<string, UiMessage>(); prev.filter(m => !m.status).forEach(m => map.set(m.id, m)); fresh.forEach(m => map.set(m.id, m));
  const real = [...map.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return [...real, ...prev.filter(m => m.status)];
}

export default function TeamChatPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams();

  const [channels, setChannels] = useState<ChatChannelSummary[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [composer, setComposer] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ChatSearchHit[] | null>(null);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [dividerAt, setDividerAt] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(0);
  const [picker, setPicker] = useState<null | { addTo?: { channelId: string; existing: string[] } }>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const restore = useRef<{ height: number; top: number } | null>(null);
  const activeRef = useRef<string | null>(null); activeRef.current = activeId;
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const typingChan = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);
  const myName = (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Someone';

  const active = useMemo(() => channels.find(c => c.channel_id === activeId) ?? null, [channels, activeId]);
  const totalUnread = channels.reduce((s, c) => s + (muted.has(c.channel_id) ? 0 : c.unread_count), 0);

  const loadChannels = useCallback(async () => {
    try { setChannels(await listMyChannels()); } catch { /* keep the last list */ }
    setLoadingChannels(false);
  }, []);
  useEffect(() => { void loadChannels(); listMyMemberStates().then(s => setMuted(new Set(s.filter(x => x.muted).map(x => x.channel_id)))).catch(() => {}); }, [loadChannels]);
  useEffect(() => { document.title = totalUnread ? `(${totalUnread}) Team Chat` : 'Team Chat'; return () => { document.title = 'Team Chat'; }; }, [totalUnread]);

  const loadReactions = useCallback(async (id: string) => { try { setReactions(await listReactions(id)); } catch { /* reactions are optional */ } }, []);

  const scrollToBottom = useCallback((smooth = false) => { bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' }); setNewBelow(0); }, []);

  const openChannel = useCallback(async (id: string, highlight?: string) => {
    setActiveId(id); setMobileThread(true); setLoadingMessages(true); setShowInfo(false); setReplyTo(null); setEditing(null); setNewBelow(0); setEmojiOpen(false); setMessages([]); setReactions([]); setHasMore(false);
    setComposer(localStorage.getItem(`team-chat-draft:${id}`) ?? '');
    try {
      const [states, first] = await Promise.all([listMyMemberStates(), listMessages(id, undefined, PAGE)]);
      let all: ChatMessage[] = first; let more = first.length >= PAGE;
      const unread = channels.find(c => c.channel_id === id)?.unread_count ?? 0;
      setDividerAt(unread > 0 ? states.find(s => s.channel_id === id)?.last_read_at ?? null : null);
      while (highlight && !all.some(m => m.id === highlight) && more && all.length < PAGE * 6) { const older = await listMessages(id, all[0].created_at, PAGE); all = [...older, ...all]; more = older.length >= PAGE; }
      setMessages(all); setHasMore(more); atBottom.current = true;
      void loadReactions(id);
      markChannelRead(id).catch(() => {});
      setChannels(prev => prev.map(c => (c.channel_id === id ? { ...c, unread_count: 0 } : c)));
      if (highlight) setTimeout(() => { document.getElementById(`msg-${highlight}`)?.scrollIntoView({ block: 'center' }); setFlash(highlight); setTimeout(() => setFlash(null), 1800); }, 80);
    } catch { toast.error('Could not load this conversation'); }
    setLoadingMessages(false);
    setTimeout(() => composerRef.current?.focus(), 50);
  }, [channels, loadReactions]);

  // /team-chat?channel=ID (from the global toast) opens that conversation once.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || loadingChannels) return; const id = searchParams.get('channel'); if (!id) return;
    deepLinked.current = true; if (channels.some(c => c.channel_id === id)) void openChannel(id); router.replace(pathname);
  }, [loadingChannels, channels, searchParams, router, pathname, openChannel]);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    if (restore.current) { el.scrollTop = el.scrollHeight - restore.current.height + restore.current.top; restore.current = null; return; }
    const last = messages[messages.length - 1];
    if (atBottom.current || last?.sender_id === user?.id) scrollToBottom(!!last && Date.now() - Date.parse(last.created_at) < 30_000);
    else if (last) setNewBelow(n => n + 1);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOlder() {
    if (!activeId || loadingOlder || !messages.length) return;
    const oldest = messages.find(m => !m.status); if (!oldest) return;
    setLoadingOlder(true);
    try {
      const older = await listMessages(activeId, oldest.created_at, PAGE); const el = scroller.current;
      if (el) restore.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages(prev => mergeMessages(prev, older)); setHasMore(older.length >= PAGE);
    } catch { toast.error('Could not load earlier messages'); }
    setLoadingOlder(false);
  }

  // Live updates: messages, edits, reactions and unread counts.
  useEffect(() => {
    if (!user) return; let timer: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase.channel(`team-chat:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, payload => {
        const row = (payload.new ?? {}) as { channel_id?: string; sender_id?: string };
        if (row.channel_id && row.channel_id === activeRef.current) {
          listMessages(row.channel_id, undefined, PAGE).then(fresh => setMessages(prev => mergeMessages(prev, fresh))).catch(() => {});
          if (payload.eventType === 'INSERT' && row.sender_id !== user.id) markChannelRead(row.channel_id).catch(() => {});
        }
        if (payload.eventType === 'INSERT') void loadChannels();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_message_reactions' }, () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { if (activeRef.current) void loadReactions(activeRef.current); }, 250); })
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [user, supabase, loadChannels, loadReactions]);

  // Who is online.
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('team-chat-presence', { config: { presence: { key: user.id } } });
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState())))).subscribe(async status => { if (status === 'SUBSCRIBED') await ch.track({ at: Date.now() }); });
    return () => { void supabase.removeChannel(ch); };
  }, [user, supabase]);

  // Typing indicators for the open conversation.
  useEffect(() => {
    if (!activeId || !user) return; setTyping({});
    const ch = supabase.channel(`team-chat-typing:${activeId}`).on('broadcast', { event: 'typing' }, ({ payload }) => {
      const p = payload as { user_id: string; name: string }; if (p.user_id === user.id) return;
      setTyping(t => ({ ...t, [p.user_id]: { name: p.name, until: Date.now() + 4000 } }));
    }).subscribe();
    typingChan.current = ch;
    const sweep = setInterval(() => setTyping(t => { const n = Object.fromEntries(Object.entries(t).filter(([, v]) => v.until > Date.now())); return Object.keys(n).length === Object.keys(t).length ? t : n; }), 1000);
    return () => { clearInterval(sweep); typingChan.current = null; void supabase.removeChannel(ch); };
  }, [activeId, user, supabase]);

  // Search conversations and message text.
  useEffect(() => {
    const q = search.trim(); if (q.length < 2) { setHits(null); return; }
    const t = setTimeout(() => { searchMessages(q).then(setHits).catch(() => setHits([])); }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  useEffect(() => { if (activeId) localStorage.setItem(`team-chat-draft:${activeId}`, composer); }, [composer, activeId]);
  useEffect(() => { const el = composerRef.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; } }, [composer]);

  async function send(retry?: UiMessage) {
    const id = activeId; const body = (retry?.body ?? composer).trim(); if (!id || !body || !user) return;
    const meta = retry?.metadata ?? (replyTo ? { reply_to: replyTo } : undefined);
    const tempId = retry?.id ?? `tmp-${Date.now()}`;
    const temp: UiMessage = { id: tempId, channel_id: id, sender_id: user.id, sender_name: myName, sender_avatar: null, body, metadata: (meta as Record<string, unknown>) ?? null, edited_at: null, deleted_at: null, created_at: new Date().toISOString(), status: 'sending' };
    setMessages(prev => [...prev.filter(m => m.id !== tempId), temp]);
    if (!retry) { setComposer(''); setReplyTo(null); localStorage.removeItem(`team-chat-draft:${id}`); }
    try {
      const saved = await sendMessage(id, body, meta as Record<string, unknown> | undefined);
      setMessages(prev => mergeMessages(prev.filter(m => m.id !== tempId), saved ? [{ ...saved, sender_name: myName }] : []));
      void loadChannels();
    } catch { setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, status: 'failed' } : m))); }
  }

  function onComposerChange(v: string) {
    setComposer(v);
    if (v && typingChan.current && Date.now() - lastTypingSent.current > 2500 && user) { lastTypingSent.current = Date.now(); void typingChan.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id, name: myName.split(' ')[0] } }); }
  }

  async function react(m: UiMessage, emoji: string) {
    if (!activeId || !user || m.status) return;
    const mine = reactions.some(r => r.message_id === m.id && r.user_id === user.id && r.emoji === emoji);
    setReactions(prev => (mine ? prev.filter(r => !(r.message_id === m.id && r.user_id === user.id && r.emoji === emoji)) : [...prev, { message_id: m.id, user_id: user.id, emoji }]));
    try { await toggleReaction(activeId, m.id, emoji, !mine); } catch { void loadReactions(activeId); }
  }

  async function saveEdit() {
    if (!editing || !editing.body.trim()) return; const { id, body } = editing; setEditing(null);
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, body: body.trim(), edited_at: new Date().toISOString() } : m)));
    try { await editMessage(id, body); } catch { toast.error('Could not save your edit'); if (activeId) listMessages(activeId, undefined, PAGE).then(f => setMessages(p => mergeMessages(p, f))).catch(() => {}); }
  }
  async function remove(id: string) {
    if (!confirm('Delete this message for everyone?')) return;
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, deleted_at: new Date().toISOString(), body: '' } : m)));
    try { await deleteMessage(id); } catch { toast.error('Could not delete the message'); }
  }
  async function toggleMute() {
    if (!activeId) return; const on = !muted.has(activeId);
    setMuted(s => { const n = new Set(s); if (on) n.add(activeId); else n.delete(activeId); return n; });
    try { await setChannelMuted(activeId, on); toast.success(on ? 'Muted. You will not get pop-ups for this chat.' : 'Unmuted'); } catch { toast.error('Could not change mute'); }
  }

  const grouped = useMemo(() => {
    const byMsg = new Map<string, Map<string, string[]>>();
    for (const r of reactions) { const m = byMsg.get(r.message_id) ?? new Map<string, string[]>(); m.set(r.emoji, [...(m.get(r.emoji) ?? []), r.user_id]); byMsg.set(r.message_id, m); }
    return byMsg;
  }, [reactions]);

  const q = search.trim().toLowerCase();
  const visible = channels.filter(c => {
    if (filter === 'unread' && !c.unread_count) return false; if (filter === 'dm' && c.type !== 'dm') return false; if (filter === 'group' && c.type !== 'group') return false;
    return !q || channelName(c).toLowerCase().includes(q) || (c.last_message_preview ?? '').toLowerCase().includes(q);
  });
  const chips: Array<[Filter, string]> = [['all', 'All'], ['unread', `Unread${channels.filter(c => c.unread_count).length ? ` ${channels.filter(c => c.unread_count).length}` : ''}`], ['dm', 'Direct'], ['group', 'Groups']];
  const typingNames = Object.values(typing).filter(t => t.until > Date.now()).map(t => t.name);
  const otherOnline = active?.type === 'dm' && active.other_user_id ? online.has(active.other_user_id) : undefined;
  let lastDay = ''; let dividerShown = false;

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background">
        <div className={`w-full md:w-[340px] shrink-0 border-r border-border flex flex-col bg-card ${mobileThread ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-4 pt-4 pb-3 flex items-center justify-between">
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">Team Chat{totalUnread > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">{totalUnread}</span>}</h1>
            <button onClick={() => setPicker({})} title="New message" className="p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"><Plus size={16} /></button>
          </div>
          <div className="px-4">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats and messages" aria-label="Search" className="w-full pl-9 pr-14 py-2 text-sm rounded-xl border border-border bg-muted/40 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />{search ? <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Clear"><X size={13} className="text-muted-foreground" /></button> : <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground border border-border rounded px-1">⌘K</kbd>}</div>
            <div className="flex gap-1.5 mt-3 pb-1 overflow-x-auto">{chips.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap transition ${filter === k ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground'}`}>{l}</button>)}</div>
          </div>
          <div className="flex-1 overflow-y-auto mt-2 px-2 pb-2">
            {loadingChannels ? <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div> : visible.length === 0 && !(hits && hits.length) ? (
              <div className="flex flex-col items-center justify-center h-52 gap-2 text-center px-6"><MessageCircle size={30} className="text-muted-foreground/60" /><p className="text-sm font-medium text-foreground">{channels.length ? 'Nothing matches' : 'No conversations yet'}</p><p className="text-xs text-muted-foreground">{channels.length ? 'Try a different filter or search.' : 'Message a teammate or start a group to get going.'}</p>{!channels.length && <button onClick={() => setPicker({})} className="mt-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">Start a conversation</button>}</div>
            ) : visible.map(c => {
              const on = c.channel_id === activeId; const isMuted = muted.has(c.channel_id);
              return (
                <button key={c.channel_id} onClick={() => void openChannel(c.channel_id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${on ? 'bg-primary/10' : 'hover:bg-muted/60'}`}>
                  <Avatar name={c.other_user_name} id={c.other_user_id ?? c.channel_id} size={40} group={c.type === 'group'} online={c.type === 'dm' && c.other_user_id ? online.has(c.other_user_id) : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><p className={`text-sm truncate ${c.unread_count ? 'font-bold' : 'font-medium'} text-foreground`}>{channelName(c)}</p><span className={`text-[10px] shrink-0 ${c.unread_count ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{listTime(c.last_message_at)}</span></div>
                    <div className="flex items-center justify-between gap-2"><p className={`text-xs truncate ${c.unread_count ? 'text-foreground' : 'text-muted-foreground'}`}>{c.last_message_preview || 'No messages yet'}</p>
                      <span className="flex items-center gap-1 shrink-0">{isMuted && <BellOff size={11} className="text-muted-foreground" />}{c.unread_count > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${isMuted ? 'bg-muted-foreground' : 'bg-primary'}`}>{c.unread_count > 99 ? '99+' : c.unread_count}</span>}</span></div>
                  </div>
                </button>);
            })}
            {hits && hits.length > 0 && (
              <div className="mt-2"><p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Messages</p>
                {hits.map(h => { const c = channels.find(x => x.channel_id === h.channel_id); return (
                  <button key={h.id} onClick={() => { setSearch(''); void openChannel(h.channel_id, h.id); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-muted/60">
                    <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-foreground truncate">{c ? channelName(c) : 'Conversation'}</p><span className="text-[10px] text-muted-foreground shrink-0">{listTime(h.created_at)}</span></div>
                    <p className="text-xs text-muted-foreground line-clamp-2"><span className="font-medium">{h.sender_name || 'Someone'}:</span> {h.body}</p>
                  </button>); })}
              </div>)}
          </div>
        </div>

        <div className={`flex-1 flex min-w-0 relative ${mobileThread ? 'flex' : 'hidden md:flex'}`}>
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 bg-muted/20"><div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"><MessageCircle size={28} className="text-primary" /></div><p className="text-base font-semibold text-foreground">Select a conversation</p><p className="text-sm text-muted-foreground max-w-xs">Pick a chat on the left, or message a teammate. Press <kbd className="text-[11px] border border-border rounded px-1">⌘K</kbd> to search.</p></div>
          ) : (
            <>
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
                  <button onClick={() => setMobileThread(false)} className="md:hidden p-1 rounded-lg text-muted-foreground hover:bg-muted" aria-label="Back"><ArrowLeft size={17} /></button>
                  <Avatar name={active.other_user_name} id={active.other_user_id ?? active.channel_id} size={38} group={active.type === 'group'} online={otherOnline} />
                  <div className="min-w-0 flex-1"><p className="text-sm font-bold text-foreground truncate">{channelName(active)}</p><p className="text-[11px] text-muted-foreground">{typingNames.length ? <span className="text-primary">{typingNames.join(', ')} typing…</span> : active.type === 'group' ? `${active.member_count} members` : otherOnline ? 'Online now' : 'Offline'}</p></div>
                  <button onClick={() => void toggleMute()} title={muted.has(active.channel_id) ? 'Unmute' : 'Mute pop-ups'} className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">{muted.has(active.channel_id) ? <BellOff size={16} /> : <Bell size={16} />}</button>
                  {active.type === 'group' && <button onClick={() => setShowInfo(v => !v)} title="Members" className={`p-2 rounded-lg hover:bg-muted ${showInfo ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><Users size={16} /></button>}
                </div>

                <div ref={scroller} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (atBottom.current) setNewBelow(0); }} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-muted/20 relative">
                  {hasMore && <div className="flex justify-center pb-3"><button onClick={() => void loadOlder()} disabled={loadingOlder} className="text-xs font-medium px-3 py-1.5 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground">{loadingOlder ? 'Loading…' : 'Load earlier messages'}</button></div>}
                  {loadingMessages ? <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div> : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center gap-2"><span className="text-3xl">👋</span><p className="text-sm font-medium text-foreground">This is the start of your conversation</p><p className="text-xs text-muted-foreground">Say hello to {channelName(active)}.</p></div>
                  ) : messages.map((m, i) => {
                    const mine = m.sender_id === user?.id; const prev = messages[i - 1]; const next = messages[i + 1]; const deleted = !!m.deleted_at;
                    const day = dayLabel(m.created_at); const showDay = day !== lastDay; lastDay = day;
                    const showDivider = !dividerShown && !!dividerAt && !mine && Date.parse(m.created_at) > Date.parse(dividerAt); if (showDivider) dividerShown = true;
                    const first = !prev || prev.sender_id !== m.sender_id || showDay || showDivider || Date.parse(m.created_at) - Date.parse(prev.created_at) > 5 * 60_000;
                    const last = !next || next.sender_id !== m.sender_id || dayLabel(next.created_at) !== day || Date.parse(next.created_at) - Date.parse(m.created_at) > 5 * 60_000;
                    const reply = (m.metadata as { reply_to?: ReplyRef } | null)?.reply_to; const rx = grouped.get(m.id);
                    return (
                      <React.Fragment key={m.id}>
                        {showDay && <div className="flex items-center gap-3 my-4"><div className="flex-1 h-px bg-border" /><span className="text-[11px] font-medium text-muted-foreground px-2 py-0.5 rounded-full bg-card border border-border">{day}</span><div className="flex-1 h-px bg-border" /></div>}
                        {showDivider && <div className="flex items-center gap-3 my-3"><div className="flex-1 h-px bg-primary/40" /><span className="text-[11px] font-semibold text-primary">New messages</span><div className="flex-1 h-px bg-primary/40" /></div>}
                        <div id={`msg-${m.id}`} className={`group flex gap-2.5 ${mine ? 'flex-row-reverse' : ''} ${first ? 'mt-3' : 'mt-0.5'} ${flash === m.id ? 'animate-pulse' : ''}`}>
                          <div className="w-8 shrink-0">{!mine && last && <Avatar name={m.sender_name} id={m.sender_id} size={32} online={online.has(m.sender_id)} />}</div>
                          <div className={`max-w-[78%] min-w-0 flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                            {first && !mine && active.type === 'group' && <span className="text-[11px] font-medium text-muted-foreground mb-0.5 px-1">{m.sender_name || 'Unknown'}</span>}
                            {editing?.id === m.id ? (
                              <div className="w-72 max-w-full"><textarea autoFocus value={editing.body} onChange={e => setEditing({ id: m.id, body: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit(); } if (e.key === 'Escape') setEditing(null); }} rows={2} className="w-full px-3 py-2 text-sm rounded-xl border border-primary/50 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" /><p className="text-[10px] text-muted-foreground mt-0.5">Enter to save, Esc to cancel</p></div>
                            ) : (
                              <div className="relative">
                                {!deleted && !m.status && (
                                  <div className={`absolute -top-4 ${mine ? 'right-0' : 'left-0'} z-10 hidden group-hover:flex items-center gap-0.5 bg-card border border-border rounded-lg shadow-md px-1 py-0.5`}>
                                    {QUICK_REACTIONS.map(e => <button key={e} onClick={() => void react(m, e)} className="text-sm w-6 h-6 rounded hover:bg-muted" aria-label={`React ${e}`}>{e}</button>)}
                                    <span className="w-px h-4 bg-border mx-0.5" />
                                    <button onClick={() => { setReplyTo({ id: m.id, sender_name: m.sender_name, preview: m.body.slice(0, 90) }); composerRef.current?.focus(); }} title="Reply" className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"><CornerUpLeft size={13} /></button>
                                    <button onClick={() => { void navigator.clipboard?.writeText(m.body); toast.success('Copied'); }} title="Copy" className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"><Copy size={12} /></button>
                                    {mine && <button onClick={() => setEditing({ id: m.id, body: m.body })} title="Edit" className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"><Pencil size={12} /></button>}
                                    {mine && <button onClick={() => void remove(m.id)} title="Delete" className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center text-red-500"><Trash2 size={12} /></button>}
                                  </div>)}
                                <div className={`px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${deleted ? 'bg-muted text-muted-foreground italic border border-border' : mine ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground border border-border'} ${mine ? `rounded-2xl ${last ? 'rounded-br-md' : ''}` : `rounded-2xl ${last ? 'rounded-bl-md' : ''}`} ${m.status === 'sending' ? 'opacity-60' : ''}`}>
                                  {reply && !deleted && <button onClick={() => { document.getElementById(`msg-${reply.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); setFlash(reply.id); setTimeout(() => setFlash(null), 1500); }} className={`block w-full text-left text-xs mb-1.5 pl-2 border-l-2 ${mine ? 'border-white/60 text-primary-foreground/80' : 'border-primary/60 text-muted-foreground'}`}><span className="font-semibold">{reply.sender_name || 'Someone'}</span><br /><span className="line-clamp-1">{reply.preview}</span></button>}
                                  {deleted ? 'Message deleted' : <RichText text={m.body} mine={mine} />}
                                </div>
                              </div>)}
                            {rx && rx.size > 0 && <div className={`flex flex-wrap gap-1 mt-1 ${mine ? 'justify-end' : ''}`}>{[...rx.entries()].map(([emoji, ids]) => { const i = ids.includes(user?.id ?? ''); return <button key={emoji} onClick={() => void react(m, emoji)} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition ${i ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/40'}`}>{emoji}<span className="font-semibold">{ids.length}</span></button>; })}</div>}
                            {(last || m.status) && <div className="flex items-center gap-1.5 mt-0.5 px-1"><span className="text-[10px] text-muted-foreground" title={new Date(m.created_at).toLocaleString()}>{clockTime(m.created_at)}{m.edited_at && !deleted ? ' · edited' : ''}</span>
                              {m.status === 'sending' && <Loader2 size={10} className="animate-spin text-muted-foreground" />}{m.status === 'failed' && <button onClick={() => void send(m)} className="flex items-center gap-1 text-[10px] font-semibold text-red-600"><AlertCircle size={10} />Not sent. Retry</button>}
                              {mine && !m.status && last && i === messages.length - 1 && <Check size={11} className="text-muted-foreground" />}</div>}
                          </div>
                        </div>
                      </React.Fragment>);
                  })}
                  {typingNames.length > 0 && <div className="flex items-center gap-2 mt-3 ml-10 text-xs text-muted-foreground"><span className="flex gap-0.5"><i className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" /><i className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" /><i className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" /></span>{typingNames.join(', ')} typing</div>}
                  <div ref={bottomRef} />
                </div>
                {newBelow > 0 && <button onClick={() => scrollToBottom(true)} className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground shadow-lg"><ArrowDown size={12} />{newBelow} new message{newBelow > 1 ? 's' : ''}</button>}

                <div className="px-4 py-3 border-t border-border bg-card shrink-0">
                  {replyTo && <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-muted/60 border-l-2 border-primary"><CornerUpLeft size={12} className="text-primary shrink-0" /><p className="text-xs text-muted-foreground truncate flex-1">Replying to <span className="font-semibold text-foreground">{replyTo.sender_name || 'message'}</span>: {replyTo.preview}</p><button onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={13} className="text-muted-foreground" /></button></div>}
                  <div className="flex items-end gap-2 relative">
                    <div className="flex-1 flex items-end rounded-2xl border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30">
                      <textarea ref={composerRef} value={composer} onChange={e => onComposerChange(e.target.value)} rows={1} placeholder={`Message ${channelName(active)}`}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
                          if (e.key === 'Escape') { setReplyTo(null); setEmojiOpen(false); }
                          if (e.key === 'ArrowUp' && !composer) { const mineLast = [...messages].reverse().find(x => x.sender_id === user?.id && !x.deleted_at && !x.status); if (mineLast) { e.preventDefault(); setEditing({ id: mineLast.id, body: mineLast.body }); } }
                        }}
                        className="flex-1 bg-transparent px-4 py-2.5 text-sm text-foreground resize-none focus:outline-none max-h-[140px]" />
                      <div className="relative"><button onClick={() => setEmojiOpen(v => !v)} className="p-2.5 text-muted-foreground hover:text-foreground" aria-label="Emoji"><Smile size={18} /></button>
                        {emojiOpen && <div className="absolute bottom-12 right-0 z-30 w-56 p-2 grid grid-cols-6 gap-1 bg-card border border-border rounded-xl shadow-xl">{EMOJIS.map(e => <button key={e} onClick={() => { setComposer(c => c + e); setEmojiOpen(false); composerRef.current?.focus(); }} className="text-lg w-8 h-8 rounded hover:bg-muted">{e}</button>)}</div>}</div>
                    </div>
                    <button onClick={() => void send()} disabled={!composer.trim()} className="p-3 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 shadow-sm" aria-label="Send"><Send size={16} /></button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5 px-1">Enter to send · Shift+Enter for a new line · ↑ edits your last message</p>
                </div>
              </div>
              {showInfo && active.type === 'group' && <GroupPanel channelId={active.channel_id} name={channelName(active)} myId={user?.id} online={online} onClose={() => setShowInfo(false)} onLeft={() => { setShowInfo(false); setActiveId(null); setMobileThread(false); void loadChannels(); toast.success('You left the group'); }} onAdd={existing => setPicker({ addTo: { channelId: active.channel_id, existing } })} />}
            </>
          )}
        </div>
      </div>

      {picker && <PeoplePicker online={online} addTo={picker.addTo} onClose={() => setPicker(null)} onDone={id => { const adding = !!picker.addTo; setPicker(null); void loadChannels().then(() => { if (adding) toast.success('People added'); else void openChannel(id); }); }} />}
    </AppLayout>
  );
}
