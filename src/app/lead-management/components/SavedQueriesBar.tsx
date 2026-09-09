'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bookmark, BookmarkCheck, ChevronDown, Plus, Trash2, Share2, X, Save,
  Star, Zap, TrendingUp, Filter, Pin, PinOff, Edit2, Check,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { FilterState } from './LeadManagementClient';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


interface SavedQuery {
  id: string;
  name: string;
  description?: string;
  filters: FilterState;
  is_shared: boolean;
  is_pinned: boolean;
  color: string;
  icon: string;
  use_count: number;
  last_used_at: string | null;
  user_id: string;
}

interface SavedQueriesBarProps {
  currentFilters: FilterState;
  defaultFilters: FilterState;
  onApply: (filters: FilterState) => void;
  activeQueryId?: string | null;
  onActiveQueryChange?: (id: string | null) => void;
}

const COLOR_OPTIONS = [
  { value: 'blue', label: 'Blue', cls: 'bg-blue-500' },
  { value: 'green', label: 'Green', cls: 'bg-green-500' },
  { value: 'purple', label: 'Purple', cls: 'bg-purple-500' },
  { value: 'orange', label: 'Orange', cls: 'bg-orange-500' },
  { value: 'red', label: 'Red', cls: 'bg-red-500' },
  { value: 'teal', label: 'Teal', cls: 'bg-teal-500' },
];

const ICON_OPTIONS = [
  { value: 'bookmark', Icon: Bookmark },
  { value: 'star', Icon: Star },
  { value: 'zap', Icon: Zap },
  { value: 'trending', Icon: TrendingUp },
  { value: 'filter', Icon: Filter },
];

function getColorClasses(color: string, active = false) {
  const map: Record<string, { chip: string; dot: string }> = {
    blue:   { chip: active ? 'bg-blue-500/20 border-blue-500/60 text-blue-400'   : 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20',   dot: 'bg-blue-500' },
    green:  { chip: active ? 'bg-green-500/20 border-green-500/60 text-green-400' : 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20', dot: 'bg-green-500' },
    purple: { chip: active ? 'bg-purple-500/20 border-purple-500/60 text-purple-400' : 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20', dot: 'bg-purple-500' },
    orange: { chip: active ? 'bg-orange-500/20 border-orange-500/60 text-orange-400' : 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20', dot: 'bg-orange-500' },
    red:    { chip: active ? 'bg-red-500/20 border-red-500/60 text-red-400'       : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20',       dot: 'bg-red-500' },
    teal:   { chip: active ? 'bg-teal-500/20 border-teal-500/60 text-teal-400'    : 'bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20',    dot: 'bg-teal-500' },
  };
  return map[color] ?? map.blue;
}

function QueryIcon({ icon, size = 11 }: { icon: string; size?: number }) {
  const found = ICON_OPTIONS.find((o) => o.value === icon);
  const Icon = found?.Icon ?? Bookmark;
  return <Icon size={size} />;
}

export default function SavedQueriesBar({
  currentFilters,
  defaultFilters,
  onApply,
  activeQueryId,
  onActiveQueryChange,
}: SavedQueriesBarProps) {
  const { user } = useAuth();
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveShared, setSaveShared] = useState(false);
  const [saveColor, setSaveColor] = useState('blue');
  const [saveIcon, setSaveIcon] = useState('bookmark');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const manageRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLDivElement>(null);

  const hasActiveFilters = JSON.stringify(currentFilters) !== JSON.stringify(defaultFilters);

  const loadQueries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('saved_queries')
        .select('*')
        .or(`user_id.eq.${user.id},is_shared.eq.true`)
        .order('is_pinned', { ascending: false })
        .order('use_count', { ascending: false })
        .order('created_at', { ascending: false });
      if (!error && data) setQueries(data as SavedQuery[]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadQueries();
  }, [user, loadQueries]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (manageRef.current && !manageRef.current.contains(e.target as Node)) setManageOpen(false);
      if (saveRef.current && !saveRef.current.contains(e.target as Node)) setSaveOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function applyQuery(query: SavedQuery) {
    onApply(query.filters);
    onActiveQueryChange?.(query.id);
    toast.success(`Applied: ${query.name}`);
    setManageOpen(false);
    // Increment use_count
    try {
      const supabase = createClient();
      await supabase
        .from('saved_queries')
        .update({ use_count: (query.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
        .eq('id', query.id);
      setQueries((prev) => prev.map((q) => q.id === query.id ? { ...q, use_count: q.use_count + 1 } : q));
    } catch { /* non-fatal */ }
  }

  async function saveQuery() {
    if (!user || !saveName.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('saved_queries').insert({
        user_id: user.id,
        name: saveName.trim(),
        description: saveDesc.trim() || null,
        filters: currentFilters,
        is_shared: saveShared,
        is_pinned: false,
        color: saveColor,
        icon: saveIcon,
        use_count: 0,
      });
      if (error) throw error;
      toast.success(`Query "${saveName}" saved`);
      setSaveName('');
      setSaveDesc('');
      setSaveShared(false);
      setSaveColor('blue');
      setSaveIcon('bookmark');
      setSaveOpen(false);
      await loadQueries();
    } catch {
      toast.error('Failed to save query');
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuery(id: string, name: string) {
    if (!user) return;
    try {
      const supabase = createClient();
      await supabase.from('saved_queries').delete().eq('id', id).eq('user_id', user.id);
      setQueries((prev) => prev.filter((q) => q.id !== id));
      if (activeQueryId === id) onActiveQueryChange?.(null);
      toast.success(`Deleted "${name}"`);
    } catch {
      toast.error('Failed to delete query');
    }
  }

  async function togglePin(query: SavedQuery) {
    if (!user || query.user_id !== user.id) return;
    try {
      const supabase = createClient();
      await supabase.from('saved_queries').update({ is_pinned: !query.is_pinned }).eq('id', query.id);
      setQueries((prev) => prev.map((q) => q.id === query.id ? { ...q, is_pinned: !q.is_pinned } : q));
    } catch {
      toast.error('Failed to update pin');
    }
  }

  async function saveEditName(id: string) {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      const supabase = createClient();
      await supabase.from('saved_queries').update({ name: editName.trim() }).eq('id', id);
      setQueries((prev) => prev.map((q) => q.id === id ? { ...q, name: editName.trim() } : q));
      setEditingId(null);
    } catch {
      toast.error('Failed to rename');
    }
  }

  const pinnedQueries = queries.filter((q) => q.is_pinned && (q.user_id === user?.id || q.is_shared));
  const myQueries = queries.filter((q) => q.user_id === user?.id);
  const sharedQueries = queries.filter((q) => q.is_shared && q.user_id !== user?.id);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Pinned quick-access chips */}
      {pinnedQueries.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {pinnedQueries.map((q) => {
            const isActive = activeQueryId === q.id;
            const colors = getColorClasses(q.color, isActive);
            return (
              <button
                key={q.id}
                onClick={() => applyQuery(q)}
                title={q.description || q.name}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-full transition-all ${colors.chip}`}
              >
                <QueryIcon icon={q.icon} size={10} />
                <span className="max-w-[120px] truncate">{q.name}</span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Save current filters button */}
      {hasActiveFilters && (
        <div ref={saveRef} className="relative">
          <button
            onClick={() => { setSaveOpen((v) => !v); setManageOpen(false); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 rounded-md transition-all"
            title="Save current filters as a named query"
          >
            <Save size={11} />
            Save Query
          </button>

          {saveOpen && (
            <div className="absolute top-full left-0 mt-1 w-80 bg-card border border-border rounded-lg shadow-xl z-50 p-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-foreground">Save as Named Query</p>
                <button onClick={() => setSaveOpen(false)} className="p-0.5 rounded hover:bg-muted">
                  <X size={12} className="text-muted-foreground" />
                </button>
              </div>

              <input
                type="text"
                placeholder='e.g. "High-Score CA Leads"'
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveQuery()}
                className="w-full px-2.5 py-1.5 text-xs border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 mb-2"
                maxLength={60}
                autoFocus
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 mb-2"
                maxLength={120}
              />

              {/* Color + Icon pickers */}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-1">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setSaveColor(c.value)}
                      className={`w-4 h-4 rounded-full ${c.cls} transition-all ${saveColor === c.value ? 'ring-2 ring-offset-1 ring-offset-card ring-white/60 scale-110' : 'opacity-60 hover:opacity-100'}`}
                      title={c.label}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {ICON_OPTIONS.map(({ value, Icon }) => (
                    <button
                      key={value}
                      onClick={() => setSaveIcon(value)}
                      className={`p-1 rounded transition-all ${saveIcon === value ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <Icon size={11} />
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveShared}
                  onChange={(e) => setSaveShared(e.target.checked)}
                  className="rounded border-border accent-primary w-3.5 h-3.5"
                />
                <span className="text-xs text-muted-foreground">Share with team</span>
              </label>

              <button
                onClick={saveQuery}
                disabled={saving || !saveName.trim()}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                {saving ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                ) : <Plus size={11} />}
                Save Query
              </button>
            </div>
          )}
        </div>
      )}

      {/* Manage queries dropdown */}
      <div ref={manageRef} className="relative">
        <button
          onClick={() => { setManageOpen((v) => !v); setSaveOpen(false); }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-all ${queries.length > 0 ? 'border-primary/40 text-primary bg-primary/5 hover:bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}
        >
          {queries.length > 0 ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
          Queries
          {queries.length > 0 && (
            <span className="bg-primary text-white text-[9px] font-bold px-1 py-0.5 rounded-full leading-none">{queries.length}</span>
          )}
          <ChevronDown size={10} className={`transition-transform ${manageOpen ? 'rotate-180' : ''}`} />
        </button>

        {manageOpen && (
          <div className="absolute top-full right-0 mt-1 w-80 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : queries.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <Bookmark size={20} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">No saved queries yet.</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Apply filters and click &quot;Save Query&quot; to create one.</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                {myQueries.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-muted/50 border-b border-border sticky top-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">My Queries</p>
                    </div>
                    {myQueries.map((q) => (
                      <QueryRow
                        key={q.id}
                        query={q}
                        isActive={activeQueryId === q.id}
                        isOwn
                        editingId={editingId}
                        editName={editName}
                        onApply={() => applyQuery(q)}
                        onDelete={() => deleteQuery(q.id, q.name)}
                        onTogglePin={() => togglePin(q)}
                        onStartEdit={() => { setEditingId(q.id); setEditName(q.name); }}
                        onEditNameChange={setEditName}
                        onSaveEdit={() => saveEditName(q.id)}
                        onCancelEdit={() => setEditingId(null)}
                      />
                    ))}
                  </>
                )}
                {sharedQueries.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-muted/50 border-b border-border border-t sticky top-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team Queries</p>
                    </div>
                    {sharedQueries.map((q) => (
                      <QueryRow
                        key={q.id}
                        query={q}
                        isActive={activeQueryId === q.id}
                        isOwn={false}
                        editingId={editingId}
                        editName={editName}
                        onApply={() => applyQuery(q)}
                        onDelete={() => {}}
                        onTogglePin={() => {}}
                        onStartEdit={() => {}}
                        onEditNameChange={() => {}}
                        onSaveEdit={() => {}}
                        onCancelEdit={() => setEditingId(null)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QueryRow({
  query, isActive, isOwn, editingId, editName,
  onApply, onDelete, onTogglePin, onStartEdit, onEditNameChange, onSaveEdit, onCancelEdit,
}: {
  query: SavedQuery;
  isActive: boolean;
  isOwn: boolean;
  editingId: string | null;
  editName: string;
  onApply: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onStartEdit: () => void;
  onEditNameChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const colors = getColorClasses(query.color, isActive);
  const isEditing = editingId === query.id;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 transition-colors group ${isActive ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
      {/* Color dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />

      {/* Name / edit */}
      {isEditing ? (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <input
            autoFocus
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }}
            className="flex-1 min-w-0 px-1.5 py-0.5 text-xs border border-primary/40 rounded bg-background text-foreground focus:outline-none"
          />
          <button onClick={onSaveEdit} className="p-0.5 text-green-500 hover:text-green-400"><Check size={11} /></button>
          <button onClick={onCancelEdit} className="p-0.5 text-muted-foreground hover:text-foreground"><X size={11} /></button>
        </div>
      ) : (
        <button onClick={onApply} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-1">
            <QueryIcon icon={query.icon} size={10} />
            <p className={`text-xs font-medium truncate ${isActive ? 'text-primary' : 'text-foreground'}`}>{query.name}</p>
            {query.is_shared && <Share2 size={9} className="text-primary shrink-0" title="Shared" />}
            {query.is_pinned && <Pin size={9} className="text-amber-500 shrink-0" />}
          </div>
          {query.description && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{query.description}</p>
          )}
          {query.use_count > 0 && (
            <p className="text-[9px] text-muted-foreground mt-0.5">Used {query.use_count}×</p>
          )}
        </button>
      )}

      {/* Actions */}
      {isOwn && !isEditing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onTogglePin} className={`p-1 rounded transition-colors ${query.is_pinned ? 'text-amber-500 hover:text-amber-400' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`} title={query.is_pinned ? 'Unpin' : 'Pin to bar'}>
            {query.is_pinned ? <PinOff size={10} /> : <Pin size={10} />}
          </button>
          <button onClick={onStartEdit} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Rename">
            <Edit2 size={10} />
          </button>
          <button onClick={onDelete} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
