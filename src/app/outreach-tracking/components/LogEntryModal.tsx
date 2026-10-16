'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buttonPrimary, buttonSecondary, inputClass } from '@/components/ops';
import { COMM_TYPE_OPTIONS, RESPONSE_STATUSES, type CommType, type LeadOption, type ResponseStatus } from '../lib';

interface LogEntryModalProps {
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  prefillLead?: LeadOption | null;
}

export default function LogEntryModal({ onClose, onSaved, prefillLead = null }: LogEntryModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuth();
  const [leadId, setLeadId] = useState(prefillLead?.id ?? '');
  const [leadSearch, setLeadSearch] = useState(prefillLead ? `${prefillLead.address}, ${prefillLead.city}, ${prefillLead.state}` : '');
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false);
  const [commType, setCommType] = useState<CommType>('call');
  const [responseStatus, setResponseStatus] = useState<ResponseStatus>('No Answer');
  const [notes, setNotes] = useState('');
  const [loggedAt, setLoggedAt] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [dueDate, setDueDate] = useState('');
  const [snoozeUntil, setSnoozeUntil] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchLeads = useCallback(async (term: string) => {
    if (!term || term.trim().length < 2 || prefillLead) {
      setLeadOptions([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, address, city, state')
        .eq('is_synthetic', false)
        .or(`address.ilike.%${term}%,city.ilike.%${term}%,owner_name.ilike.%${term}%,contact_name.ilike.%${term}%`)
        .order('updated_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setLeadOptions((data as LeadOption[]) ?? []);
    } catch (error) {
      console.error('[OutreachTracking] lead search failed', error);
      toast.error(error instanceof Error ? error.message : 'Lead search failed');
    } finally {
      setSearching(false);
    }
  }, [prefillLead, supabase]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      void searchLeads(leadSearch);
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [leadSearch, searchLeads]);

  const applySnoozePreset = (hours: number) => {
    const date = new Date(Date.now() + hours * 60 * 60 * 1000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    setSnoozeUntil(date.toISOString().slice(0, 16));
  };

  const handleSave = async () => {
    if (!leadId) {
      toast.error('Select a lead first.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('outreach_logs').insert({
        lead_id: leadId,
        agent_id: user?.id || null,
        agent_name: (user?.user_metadata as Record<string, unknown> | undefined)?.full_name || user?.email || null,
        comm_type: commType,
        response_status: responseStatus,
        notes: notes.trim() || null,
        logged_at: new Date(loggedAt).toISOString(),
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        snooze_until: snoozeUntil ? new Date(snoozeUntil).toISOString() : null,
        priority,
        is_completed: false,
      });
      if (error) throw error;
      toast.success('Outreach entry logged.');
      await onSaved();
      onClose();
    } catch (error) {
      console.error('[OutreachTracking] log save failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save outreach entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Log outreach</h2>
            <p className="text-xs text-muted-foreground">Writes directly to outreach_logs — no messages are sent from this screen.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground" aria-label="Close log outreach modal">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Lead</label>
            {prefillLead ? (
              <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">{prefillLead.address}, {prefillLead.city}, {prefillLead.state}</div>
            ) : (
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={leadSearch}
                  onChange={(event) => {
                    setLeadSearch(event.target.value);
                    setLeadId('');
                    setLeadDropdownOpen(true);
                  }}
                  onFocus={() => setLeadDropdownOpen(true)}
                  placeholder="Search address, city, owner, or contact"
                  className={`${inputClass} pl-9`}
                />
                {leadDropdownOpen && (searching || leadOptions.length > 0) && (
                  <div className="absolute top-full z-10 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                    {searching && (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                        <Loader2 size={14} className="animate-spin" /> Searching…
                      </div>
                    )}
                    {leadOptions.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => {
                          setLeadId(lead.id);
                          setLeadSearch(`${lead.address}, ${lead.city}, ${lead.state}`);
                          setLeadDropdownOpen(false);
                        }}
                        className="block w-full border-t border-border px-4 py-3 text-left text-sm transition-colors first:border-t-0 hover:bg-muted/50"
                      >
                        <div className="font-medium text-foreground">{lead.address}</div>
                        <div className="text-xs text-muted-foreground">{lead.city}, {lead.state}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Communication type</label>
              <select value={commType} onChange={(event) => setCommType(event.target.value as CommType)} className={inputClass}>
                {COMM_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Response status</label>
              <div className="relative">
                <select value={responseStatus} onChange={(event) => setResponseStatus(event.target.value as ResponseStatus)} className={`${inputClass} appearance-none pr-9`}>
                  {RESPONSE_STATUSES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Logged at</span>
              <input type="datetime-local" value={loggedAt} onChange={(event) => setLoggedAt(event.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Due date</span>
              <input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Priority</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as 'low' | 'normal' | 'high')} className={inputClass}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-xs font-semibold text-foreground">Snooze until</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '1h', hours: 1 },
                  { label: '3h', hours: 3 },
                  { label: 'Tomorrow', hours: 24 },
                  { label: '3d', hours: 72 },
                ].map((preset) => (
                  <button key={preset.label} type="button" onClick={() => applySnoozePreset(preset.hours)} className={buttonSecondary}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <input type="datetime-local" value={snoozeUntil} onChange={(event) => setSnoozeUntil(event.target.value)} className={inputClass} />
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-foreground">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
              className={`${inputClass} resize-y`}
              placeholder="What happened? Any key details from the conversation?"
            />
          </label>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-card px-5 py-4">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving || !leadId} className={buttonPrimary}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
