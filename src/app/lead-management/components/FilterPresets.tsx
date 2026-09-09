'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bookmark, BookmarkCheck, ChevronDown, Plus, Trash2, Share2, X, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { FilterState } from './LeadManagementClient';
import { toast } from 'sonner';

interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: FilterState;
  is_shared: boolean;
  user_id: string;
}

interface FilterPresetsProps {
  currentFilters: FilterState;
  onApply: (filters: FilterState) => void;
  defaultFilters: FilterState;
}

export default function FilterPresets({ currentFilters, onApply, defaultFilters }: FilterPresetsProps) {
  const { user } = useAuth();
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveShared, setSaveShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) loadPresets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSaveOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadPresets() {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('filter_presets')
        .select('*')
        .or(`user_id.eq.${user.id},is_shared.eq.true`)
        .order('created_at', { ascending: false });
      if (!error && data) {
        setPresets(data as FilterPreset[]);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function savePreset() {
    if (!user || !saveName.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('filter_presets').insert({
        user_id: user.id,
        name: saveName.trim(),
        description: saveDesc.trim() || null,
        filters: currentFilters,
        is_shared: saveShared,
      });
      if (error) throw error;
      toast.success(`Preset "${saveName}" saved`);
      setSaveName('');
      setSaveDesc('');
      setSaveShared(false);
      setSaveOpen(false);
      await loadPresets();
    } catch {
      toast.error('Failed to save preset');
    } finally {
      setSaving(false);
    }
  }

  async function deletePreset(id: string, name: string) {
    if (!user) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from('filter_presets').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      setPresets((prev) => prev.filter((p) => p.id !== id));
      toast.success(`Preset "${name}" deleted`);
    } catch {
      toast.error('Failed to delete preset');
    }
  }

  const hasActiveFilters = JSON.stringify(currentFilters) !== JSON.stringify(defaultFilters);
  const myPresets = presets.filter((p) => p.user_id === user?.id);
  const sharedPresets = presets.filter((p) => p.is_shared && p.user_id !== user?.id);

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {/* Save current filters button */}
      {hasActiveFilters && (
        <button
          onClick={() => { setSaveOpen((v) => !v); setOpen(false); }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 rounded-md transition-all"
          title="Save current filters as preset"
        >
          <Save size={11} />
          Save Filters
        </button>
      )}

      {/* Presets dropdown */}
      <button
        onClick={() => { setOpen((v) => !v); setSaveOpen(false); }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-all ${presets.length > 0 ? 'border-primary/40 text-primary bg-primary/5 hover:bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}
      >
        {presets.length > 0 ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
        Presets
        {presets.length > 0 && (
          <span className="bg-primary text-white text-[9px] font-bold px-1 py-0.5 rounded-full leading-none">{presets.length}</span>
        )}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Save panel */}
      {saveOpen && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-card border border-border rounded-lg shadow-xl z-50 p-3 fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-foreground">Save Filter Preset</p>
            <button onClick={() => setSaveOpen(false)} className="p-0.5 rounded hover:bg-muted transition-colors">
              <X size={12} className="text-muted-foreground" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Preset name (e.g. Top 40% CO Condos)"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 mb-2"
            maxLength={60}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={saveDesc}
            onChange={(e) => setSaveDesc(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 mb-2"
            maxLength={120}
          />
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
            onClick={savePreset}
            disabled={saving || !saveName.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {saving ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <Plus size={11} />
            )}
            Save Preset
          </button>
        </div>
      )}

      {/* Presets dropdown list */}
      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-card border border-border rounded-lg shadow-xl z-50 fade-in overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : presets.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <Bookmark size={20} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No saved presets yet.</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Apply filters and click &quot;Save Filters&quot; to create one.</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {myPresets.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-muted/50 border-b border-border">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">My Presets</p>
                  </div>
                  {myPresets.map((preset) => (
                    <PresetRow
                      key={preset.id}
                      preset={preset}
                      onApply={() => { onApply(preset.filters); setOpen(false); toast.success(`Applied: ${preset.name}`); }}
                      onDelete={() => deletePreset(preset.id, preset.name)}
                      isOwn
                    />
                  ))}
                </>
              )}
              {sharedPresets.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-muted/50 border-b border-border border-t">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team Presets</p>
                  </div>
                  {sharedPresets.map((preset) => (
                    <PresetRow
                      key={preset.id}
                      preset={preset}
                      onApply={() => { onApply(preset.filters); setOpen(false); toast.success(`Applied: ${preset.name}`); }}
                      onDelete={() => {}}
                      isOwn={false}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PresetRow({ preset, onApply, onDelete, isOwn }: {
  preset: FilterPreset;
  onApply: () => void;
  onDelete: () => void;
  isOwn: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors group">
      <button onClick={onApply} className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-foreground truncate">{preset.name}</p>
          {preset.is_shared && (
            <Share2 size={9} className="text-primary shrink-0" title="Shared with team" />
          )}
        </div>
        {preset.description && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{preset.description}</p>
        )}
      </button>
      {isOwn && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-danger/10 text-danger transition-all"
          title="Delete preset"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}
