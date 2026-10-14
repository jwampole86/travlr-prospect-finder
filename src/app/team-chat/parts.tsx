'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, LogOut, Search, UserPlus, X } from 'lucide-react';
import { type ChatRosterMember, type TeamDirectoryUser, addMembersToGroup, createDM, createGroup, leaveChannel, listChannelRoster, listTeamDirectory } from '@/lib/services/chatService';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '🙏'];
export const EMOJIS = ['😀', '😂', '😊', '😍', '🤔', '😅', '😎', '🙌', '👍', '👏', '🙏', '🔥', '🎉', '✅', '❌', '⚠️', '📞', '📍', '🏡', '💰', '📈', '⏰', '👀', '💡'];

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

const HUES = ['bg-blue-500/15 text-blue-600 dark:text-blue-300', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', 'bg-amber-500/15 text-amber-600 dark:text-amber-300', 'bg-rose-500/15 text-rose-600 dark:text-rose-300', 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300', 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300'];
const hue = (id: string | null | undefined) => HUES[[...(id ?? '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

export function Avatar({ name, id, size = 36, group, online }: { name: string | null | undefined; id?: string | null; size?: number; group?: boolean; online?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className={`w-full h-full rounded-full flex items-center justify-center font-bold ${group ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300' : hue(id)}`} style={{ fontSize: size * 0.34 }}>
        {group ? '#' : initials(name)}
      </div>
      {online !== undefined && !group && <span className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-card ${online ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} style={{ width: size * 0.3, height: size * 0.3 }} />}
    </div>
  );
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;
/** Message text with clickable links and highlighted @mentions. */
export function RichText({ text, mine }: { text: string; mine: boolean }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) => {
        if (i % 2 === 1) return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`underline underline-offset-2 break-all ${mine ? 'text-primary-foreground' : 'text-primary'}`}>{part}</a>;
        return <React.Fragment key={i}>{part.split(/(@[A-Za-z][\w'-]*)/g).map((s, j) => (j % 2 === 1 ? <span key={j} className={`font-semibold rounded px-0.5 ${mine ? 'bg-white/20' : 'bg-primary/10 text-primary'}`}>{s}</span> : s))}</React.Fragment>;
      })}
    </>
  );
}

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export function dayLabel(iso: string): string {
  const d = new Date(iso); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}
export function listTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso); const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'now'; if (mins < 60) return `${mins}m`;
  if (d.toDateString() === new Date().toDateString()) return clockTime(iso);
  const days = Math.floor(mins / 1440); if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── New message / add people ────────────────────────────────────────────────

export function PeoplePicker({ onClose, onDone, addTo, online }: { onClose: () => void; onDone: (channelId: string) => void; addTo?: { channelId: string; existing: string[] }; online: Set<string> }) {
  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const [directory, setDirectory] = useState<TeamDirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listTeamDirectory().then(setDirectory).catch(e => setError(e instanceof Error ? e.message : 'Could not load the team')).finally(() => setLoading(false)); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const multi = !!addTo || mode === 'group';
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return directory.filter(u => !(addTo?.existing ?? []).includes(u.id) && (!q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)));
  }, [directory, search, addTo]);
  const byId = useMemo(() => new Map(directory.map(u => [u.id, u])), [directory]);
  const toggle = (id: string) => setSelected(s => (multi ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : [id]));

  async function submit() {
    setError(null);
    if (!selected.length) { setError(addTo ? 'Pick at least one person' : 'Pick someone to message'); return; }
    if (!addTo && mode === 'group' && !groupName.trim()) { setError('Give the group a name'); return; }
    setBusy(true);
    try {
      if (addTo) { await addMembersToGroup(addTo.channelId, selected); onDone(addTo.channelId); }
      else if (mode === 'dm') onDone(await createDM(selected[0]));
      else onDone(await createGroup(groupName.trim(), '', selected));
    } catch (e) { setError(e instanceof Error ? e.message : 'That did not work. Try again.'); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label={addTo ? 'Add people' : 'New message'}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">{addTo ? 'Add people to this group' : 'New message'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close"><X size={16} /></button>
        </div>
        {!addTo && (
          <div className="flex gap-1 p-2 mx-4 mt-3 rounded-xl bg-muted/50">
            {(['dm', 'group'] as const).map(m => <button key={m} onClick={() => { setMode(m); setSelected([]); }} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${mode === m ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>{m === 'dm' ? 'Direct message' : 'New group'}</button>)}
          </div>
        )}
        {!addTo && mode === 'group' && <div className="px-5 pt-3"><input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Group name, for example Colorado Team" maxLength={60} className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>}
        <div className="px-5 pt-3">
          {selected.length > 0 && multi && <div className="flex flex-wrap gap-1.5 mb-2">{selected.map(id => <button key={id} onClick={() => toggle(id)} className="flex items-center gap-1 text-[11px] pl-2 pr-1.5 py-1 rounded-full bg-primary/10 text-primary">{byId.get(id)?.full_name || 'Teammate'}<X size={10} /></button>)}</div>}
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teammates" className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 min-h-[160px]">
          {loading ? <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div> : people.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">No teammates found.</p> : people.map(u => {
            const on = selected.includes(u.id);
            return (
              <button key={u.id} onClick={() => toggle(u.id)} className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition ${on ? 'bg-primary/10' : 'hover:bg-muted/60'}`}>
                <Avatar name={u.full_name || u.email} id={u.id} size={34} online={online.has(u.id)} />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium text-foreground truncate">{u.full_name || u.email}</p><p className="text-[11px] text-muted-foreground truncate capitalize">{u.app_role || 'team member'}{online.has(u.id) ? ' · online' : ''}</p></div>
                {on && <Check size={15} className="text-primary shrink-0" />}
              </button>);
          })}
        </div>
        {error && <p className="px-5 pb-1 text-xs text-red-600">{error}</p>}
        <div className="p-4 border-t border-border">
          <button onClick={() => void submit()} disabled={busy} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />}{addTo ? `Add ${selected.length || ''} to group`.trim() : mode === 'dm' ? 'Start conversation' : 'Create group'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Group info ──────────────────────────────────────────────────────────────

export function GroupPanel({ channelId, name, myId, online, onClose, onLeft, onAdd }: { channelId: string; name: string; myId: string | undefined; online: Set<string>; onClose: () => void; onLeft: () => void; onAdd: (existing: string[]) => void }) {
  const [roster, setRoster] = useState<ChatRosterMember[] | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { setRoster(null); listChannelRoster(channelId).then(setRoster).catch(() => setRoster([])); }, [channelId]);
  const iAmOwner = !!roster?.some(m => m.user_id === myId && m.member_role === 'owner');
  return (
    <aside className="w-72 shrink-0 border-l border-border bg-card flex flex-col max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-20 max-md:shadow-xl">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between"><div className="min-w-0"><p className="text-sm font-bold text-foreground truncate">{name}</p><p className="text-[11px] text-muted-foreground">{roster ? `${roster.length} members` : 'Loading…'}</p></div><button onClick={onClose} className="p-1 rounded-lg hover:bg-muted" aria-label="Close"><X size={15} className="text-muted-foreground" /></button></div>
      <div className="flex-1 overflow-y-auto p-2">
        {!roster ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div> : roster.map(m => (
          <div key={m.user_id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
            <Avatar name={m.full_name} id={m.user_id} size={32} online={online.has(m.user_id)} />
            <div className="min-w-0 flex-1"><p className="text-sm text-foreground truncate">{m.full_name || 'Unknown'}{m.user_id === myId ? ' (you)' : ''}</p><p className="text-[11px] text-muted-foreground capitalize">{m.member_role === 'owner' ? 'Owner' : m.app_role || 'Member'}</p></div>
          </div>))}
      </div>
      <div className="p-3 border-t border-border space-y-2">
        <button onClick={() => onAdd((roster ?? []).map(m => m.user_id))} disabled={!roster} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"><UserPlus size={13} />Add people</button>
        {!iAmOwner && roster && <p className="text-[10px] text-muted-foreground text-center">Only the group owner can add people.</p>}
        <button disabled={leaving} onClick={async () => { if (!confirm(`Leave ${name}? You will stop receiving its messages.`)) return; setLeaving(true); try { await leaveChannel(channelId); onLeft(); } finally { setLeaving(false); } }} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-500/10"><LogOut size={13} />Leave group</button>
      </div>
    </aside>
  );
}
