'use client';

/**
 * LiveTeleprompterPanel — Embedded teleprompter for the Agent Workspace.
 * Features:
 *   - Dynamic lead variable substitution ({contactName}, {address}, {localBlurb})
 *   - Progressive script stages (tabs per section)
 *   - Call outcome recording (saved to outreach_calls)
 *   - Integrated notes (saved to activity_events)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Phone, PhoneOff, ChevronRight, ChevronLeft, CheckCircle2, FileText, Clock, Save, X, CheckSquare, Square, Loader2, PhoneCall, PhoneMissed, PhoneIncoming, MessageSquare, StickyNote } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CALL_SCRIPTS, SCRIPT_OPTIONS, ScriptId } from '@/lib/callScripts';
import { resolveVariables, applyVariables } from '@/lib/services/variableResolutionService';
import { outreachCallService } from '@/lib/services/outreachCallService';
import type { CallOutcomeType } from '@/lib/services/outreachCallService';
import Icon from '@/components/ui/AppIcon';



// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadContext {
  id: string;
  contactName: string;
  address: string;
  city: string;
  state: string;
  phone?: string;
}

interface LiveTeleprompterPanelProps {
  lead: LeadContext;
  agentName: string;
  agentId?: string;
  onClose?: () => void;
  defaultScriptId?: ScriptId;
}

const CALL_OUTCOMES: { value: CallOutcomeType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'connected', label: 'Connected', icon: PhoneCall, color: 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100' },
  { value: 'questionnaire_sent', label: 'Questionnaire Sent', icon: CheckCircle2, color: 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100' },
  { value: 'follow_up_scheduled', label: 'Follow-Up Scheduled', icon: Clock, color: 'bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100' },
  { value: 'proposal_conversation', label: 'Proposal Conversation', icon: FileText, color: 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100' },
  { value: 'not_interested', label: 'Not Interested', icon: X, color: 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100' },
  { value: 'voicemail', label: 'Voicemail', icon: PhoneIncoming, color: 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100' },
  { value: 'no_answer', label: 'No Answer', icon: PhoneMissed, color: 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100' },
  { value: 'other', label: 'Other', icon: MessageSquare, color: 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiveTeleprompterPanel({
  lead,
  agentName,
  agentId,
  onClose,
  defaultScriptId = 'initial_outreach',
}: LiveTeleprompterPanelProps) {
  const supabase = createClient();

  // Script state
  const [scriptId, setScriptId] = useState<ScriptId>(defaultScriptId);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [coveredLines, setCoveredLines] = useState<Set<string>>(new Set());

  // Call state
  const [callPhase, setCallPhase] = useState<'ready' | 'active' | 'ended'>('ready');
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Outcome recording
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcomeType | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeSaved, setOutcomeSaved] = useState(false);

  // Notes
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolved variables
  const resolvedVars = resolveVariables(
    { contactName: lead.contactName, address: lead.address, city: lead.city, state: lead.state },
    { senderName: agentName }
  );

  const script = CALL_SCRIPTS[scriptId];
  const sections = script?.sections ?? [];
  const activeSection = sections[activeSectionIdx];

  // ── Timer ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (callPhase === 'active') {
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callPhase]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Start / End Call ───────────────────────────────────────────────────────

  const handleStartCall = () => {
    setCallPhase('active');
    setCallStartTime(new Date());
    setElapsed(0);
    setActiveSectionIdx(0);
    setCoveredLines(new Set());
    setSelectedOutcome(null);
    setOutcomeNotes('');
    setOutcomeSaved(false);
  };

  const handleEndCall = () => {
    setCallPhase('ended');
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ── Line coverage ──────────────────────────────────────────────────────────

  const toggleLine = (lineId: string) => {
    setCoveredLines(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  // ── Save outcome ───────────────────────────────────────────────────────────

  const handleSaveOutcome = useCallback(async () => {
    if (!selectedOutcome || !callStartTime) return;
    setSavingOutcome(true);
    try {
      await outreachCallService.logCall({
        leadId: lead.id,
        outcome: selectedOutcome,
        durationSeconds: elapsed,
        scriptVariant: scriptId,
        dispositionNotes: outcomeNotes.trim() || undefined,
        calledAt: callStartTime.toISOString(),
        agentName: agentName,
      });

      // Also log to activity_events
      await supabase.from('activity_events').insert({
        lead_id: lead.id,
        agent_id: agentId,
        event_type: 'call_outcome_recorded',
        metadata: {
          outcome: selectedOutcome,
          duration_seconds: elapsed,
          script_id: scriptId,
          notes: outcomeNotes.trim() || null,
        },
      });

      setOutcomeSaved(true);
    } catch (err) {
      console.error('[LiveTeleprompterPanel] save outcome error:', err);
    } finally {
      setSavingOutcome(false);
    }
  }, [selectedOutcome, callStartTime, lead.id, agentId, agentName, elapsed, scriptId, outcomeNotes, supabase]);

  // ── Auto-save notes ────────────────────────────────────────────────────────

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setNotesSaved(false);
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(async () => {
      if (!value.trim() || !lead.id) return;
      setSavingNotes(true);
      try {
        await supabase.from('activity_events').insert({
          lead_id: lead.id,
          agent_id: agentId,
          event_type: 'note_added',
          metadata: { note: value.trim(), source: 'teleprompter' },
        });
        setNotesSaved(true);
      } catch { /* silent */ } finally {
        setSavingNotes(false);
      }
    }, 2000);
  };

  // ── Script change reset ────────────────────────────────────────────────────

  const handleScriptChange = (id: ScriptId) => {
    setScriptId(id);
    setActiveSectionIdx(0);
    setCoveredLines(new Set());
  };

  const totalLines = sections.reduce((acc, s) => acc + s.lines.filter(l => l.type === 'spoken').length, 0);
  const coveredSpokenLines = [...coveredLines].filter(id => {
    for (const s of sections) {
      const line = s.lines.find(l => l.id === id);
      if (line && line.type === 'spoken') return true;
    }
    return false;
  }).length;

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${callPhase === 'active' ? 'bg-red-500 animate-pulse' : callPhase === 'ended' ? 'bg-gray-400' : 'bg-emerald-500'}`} />
          <span className="text-sm font-semibold text-foreground">Live Teleprompter</span>
          {callPhase === 'active' && (
            <span className="text-xs font-mono text-red-500 font-semibold">{formatElapsed(elapsed)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {callPhase === 'ready' && (
            <button
              onClick={handleStartCall}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Phone size={12} />
              Start Call
            </button>
          )}
          {callPhase === 'active' && (
            <button
              onClick={handleEndCall}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors"
            >
              <PhoneOff size={12} />
              End Call
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Lead Context Bar ── */}
      <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-foreground truncate">{lead.contactName}</span>
          <span className="text-xs text-muted-foreground ml-2 truncate">{lead.address}{lead.city ? `, ${lead.city}` : ''}</span>
        </div>
        {lead.phone && (
          <span className="text-xs font-mono text-muted-foreground shrink-0">{lead.phone}</span>
        )}
        {callPhase !== 'active' && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-muted-foreground">Script:</span>
            <select
              value={scriptId}
              onChange={e => handleScriptChange(e.target.value as ScriptId)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {SCRIPT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* Script Goal */}
        {script && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-[11px] text-primary/80 bg-primary/5 border border-primary/15 rounded-lg px-3 py-1.5 leading-relaxed">
              <span className="font-semibold">Goal:</span> {script.goal}
            </p>
          </div>
        )}

        {/* Progress bar */}
        {totalLines > 0 && (
          <div className="px-4 pt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">Script progress</span>
              <span className="text-[10px] text-muted-foreground">{coveredSpokenLines}/{totalLines} lines</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${totalLines > 0 ? (coveredSpokenLines / totalLines) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Section tabs */}
        {sections.length > 0 && (
          <div className="px-4 pt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {sections.map((section, idx) => {
              const sectionCovered = section.lines.filter(l => l.type === 'spoken').every(l => coveredLines.has(l.id));
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSectionIdx(idx)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors shrink-0 ${
                    activeSectionIdx === idx
                      ? 'bg-primary text-primary-foreground'
                      : sectionCovered
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {sectionCovered && activeSectionIdx !== idx && <CheckCircle2 size={10} className="text-emerald-500" />}
                  {section.title}
                </button>
              );
            })}
          </div>
        )}

        {/* Active section lines */}
        {activeSection && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {activeSection.lines.map(line => {
              const resolved = applyVariables(line.text, resolvedVars);
              const covered = coveredLines.has(line.id);

              if (line.type === 'instruction') {
                return (
                  <p key={line.id} className="text-[11px] text-muted-foreground italic px-2">
                    [{resolved}]
                  </p>
                );
              }

              if (line.type === 'agent_fill') {
                return (
                  <div key={line.id} className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-semibold text-amber-600 mb-0.5 uppercase tracking-wide">Agent fills in:</p>
                    <p className="text-sm text-amber-800 dark:text-amber-300">{resolved}</p>
                  </div>
                );
              }

              // Spoken line
              return (
                <button
                  key={line.id}
                  onClick={() => toggleLine(line.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all touch-manipulation ${
                    covered
                      ? 'bg-emerald-500/10 border-emerald-500/30 opacity-60' :'bg-card border-border hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {covered
                      ? <CheckSquare size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                      : <Square size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                    }
                    <p className={`text-sm leading-relaxed ${covered ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                      "{resolved}"
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Section navigation */}
        {sections.length > 1 && (
          <div className="px-4 py-2 border-t border-border flex items-center justify-between">
            <button
              onClick={() => setActiveSectionIdx(i => Math.max(0, i - 1))}
              disabled={activeSectionIdx === 0}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <span className="text-xs text-muted-foreground">{activeSectionIdx + 1} / {sections.length}</span>
            <button
              onClick={() => setActiveSectionIdx(i => Math.min(sections.length - 1, i + 1))}
              disabled={activeSectionIdx === sections.length - 1}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Notes Panel ── */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <StickyNote size={12} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Call Notes</span>
          </div>
          {savingNotes && <Loader2 size={10} className="text-muted-foreground animate-spin" />}
          {notesSaved && !savingNotes && <span className="text-[10px] text-emerald-500">Saved</span>}
        </div>
        <textarea
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="Type notes during the call — auto-saved to activity timeline…"
          rows={2}
          className="w-full text-xs bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      {/* ── Outcome Recording (shown after call ends) ── */}
      {callPhase === 'ended' && (
        <div className="border-t border-border px-4 py-3 bg-muted/20">
          <div className="flex items-center gap-1.5 mb-2">
            <FileText size={12} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Record Outcome</span>
            <span className="ml-auto text-xs text-muted-foreground font-mono">{formatElapsed(elapsed)}</span>
          </div>

          {outcomeSaved ? (
            <div className="flex items-center gap-2 py-2 text-emerald-600">
              <CheckCircle2 size={14} />
              <span className="text-xs font-semibold">Outcome saved to call history</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {CALL_OUTCOMES.map(({ value, label, icon: Icon, color }) => (
                  <button
                    key={value}
                    onClick={() => setSelectedOutcome(value)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      selectedOutcome === value
                        ? color + 'ring-2 ring-offset-1 ring-current' :'bg-card border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    <Icon size={11} />
                    {label}
                  </button>
                ))}
              </div>

              <textarea
                value={outcomeNotes}
                onChange={e => setOutcomeNotes(e.target.value)}
                placeholder="Disposition notes (optional)…"
                rows={2}
                className="w-full text-xs bg-card border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none mb-2"
              />

              <button
                onClick={handleSaveOutcome}
                disabled={!selectedOutcome || savingOutcome}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {savingOutcome ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {savingOutcome ? 'Saving…' : 'Save Outcome'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
