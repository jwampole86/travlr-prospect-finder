'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mic, MicOff, PhoneOff, Phone, AlertTriangle, CheckCircle, Clock, User, Home, ChevronRight, Loader2, Volume2, RefreshCw, FileText, Headphones, Settings, WifiOff, Radio, AlertCircle, ChevronDown, CheckSquare, Square, BookOpen, Zap, AlertOctagon, ThumbsUp, ThumbsDown, BarChart2, Hash, X, List, PhoneCall, PhoneMissed, PhoneIncoming, Delete, Briefcase, Brain, PanelRightOpen, Shield } from 'lucide-react';
import Link from 'next/link';
import { resolveVariables, applyVariables, devicePreferences } from '@/lib/services/variableResolutionService';
import { CALL_SCRIPTS, SCRIPT_OPTIONS, buildScriptText, ScriptId, CallScript, ScriptLine } from '@/lib/callScripts';
import { SCRIPT_BEATS } from '@/lib/objectionLibrary';
import { activityService } from '@/lib/services/activityService';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { outreachCallService } from '@/lib/services/outreachCallService';
import type { CallOutcomeType, OutreachCallRecord } from '@/lib/services/outreachCallService';
import { OUTCOME_LABELS, OUTCOME_COLORS } from '@/lib/services/outreachCallService';
import AIEnrichmentPanel from './components/AIEnrichmentPanel';
import EnrichmentSidebar from './components/EnrichmentSidebar';
import TeleprompterRegulationPanel from './components/TeleprompterRegulationPanel';
import { PORTFOLIO_STATES } from '@/lib/localBlurbs';
import { placeOutboundCall } from '@/lib/services/twilioVoiceService';

type BrowserSpeechRecognition = typeof window extends never ? never : {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionAlternative = { transcript: string; confidence: number };
type SpeechRecognitionResultLike = { isFinal: boolean; 0: SpeechRecognitionAlternative };
type SpeechRecognitionEvent = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionErrorEvent = { error: string };

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranscriptEntry {
  id: string;
  speaker: 'Agent' | 'Homeowner';
  text: string;
  timestamp: string;
}

interface LeadContext {
  leadId?: string;
  contactName: string;
  address: string;
  city: string;
  state: string;
  portfolioState: string;
  localBlurb: string;
  phone?: string;
}

type CallPhase = 'setup' | 'headset' | 'consent' | 'active' | 'ended';
type CallOutcome = 'questionnaire_sent' | 'follow_up_scheduled' | 'proposal_conversation' | 'not_interested' | 'voicemail' | 'no_answer' | 'other';

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface HeadsetState {
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  isTestingMic: boolean;
  micLevel: number;
  isTestingOutput: boolean;
  permissionGranted: boolean;
  permissionError: string;
  inputConnected: boolean;
  outputConnected: boolean;
}

interface SuggestionMeta {
  source?: 'llm' | 'objection_library' | 'static_fallback';
  degraded?: boolean;
  degradedReason?: string;
  suppressedReason?: string;
  objectionId?: string;
  objectionCategory?: string;
  note?: string;
}

// ─── Touch Dialpad ────────────────────────────────────────────────────────────

function TouchDialpad({ phone, onClose }: { phone?: string; onClose: () => void }) {
  const [digits, setDigits] = useState(phone || '');
  const [calling, setCalling] = useState(false);

  const keys = [
    ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
    ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
    ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
    ['*', ''], ['0', '+'], ['#', ''],
  ];

  const handleKey = (k: string) => setDigits(d => d + k);
  const handleDelete = () => setDigits(d => d.slice(0, -1));

  const handleCall = async () => {
    if (!digits.trim()) return;
    setCalling(true);
    const result = await placeOutboundCall({ to: digits });
    setCalling(false);

    if (result.error && result.status === 'error') {
      toast.error(result.error);
      return;
    }

    toast.success(result.configured ? `Calling ${digits}…` : `Dialer opened in placeholder mode for ${digits}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card text-foreground rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-foreground">Dialpad</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Display */}
        <div className="flex items-center gap-2 bg-muted rounded-2xl px-4 py-3 mb-5">
          <span className="flex-1 text-2xl font-mono font-semibold text-foreground tracking-widest min-h-[2rem]">
            {digits || <span className="text-muted-foreground text-lg">Enter number</span>}
          </span>
          {digits && (
            <button onClick={handleDelete} className="p-2 rounded-xl hover:bg-background transition-colors">
              <Delete className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Keys grid */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {keys.map(([digit, sub]) => (
            <button
              key={digit}
              onClick={() => handleKey(digit)}
              className="flex flex-col items-center justify-center h-16 rounded-2xl bg-muted hover:bg-background active:bg-background transition-colors touch-manipulation select-none"
            >
              <span className="text-xl font-semibold text-foreground">{digit}</span>
              {sub && <span className="text-[10px] font-medium text-muted-foreground tracking-widest mt-0.5">{sub}</span>}
            </button>
          ))}
        </div>

        {/* Call button */}
        <button
          onClick={handleCall}
          disabled={!digits.trim() || calling}
          className="w-full h-14 rounded-2xl bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-50 touch-manipulation"
        >
          {calling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Phone className="w-5 h-5" />}
          {calling ? 'Connecting…' : 'Call'}
        </button>
      </div>
    </div>
  );
}

// ─── Inline Call Log Sidebar ──────────────────────────────────────────────────

function CallLogSidebar({ leadId, onClose }: { leadId?: string; onClose: () => void }) {
  const [calls, setCalls] = useState<OutreachCallRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) { setLoading(false); return; }
    outreachCallService.getCallsForLead(leadId, 15).then(data => {
      setCalls(data);
      setLoading(false);
    });
  }, [leadId]);

  const outcomeIcon = (outcome: CallOutcomeType) => {
    if (['connected', 'interested', 'questionnaire_sent', 'follow_up_scheduled', 'proposal_conversation'].includes(outcome))
      return <PhoneCall className="w-3.5 h-3.5 text-green-500" />;
    if (['voicemail'].includes(outcome))
      return <PhoneIncoming className="w-3.5 h-3.5 text-amber-500" />;
    return <PhoneMissed className="w-3.5 h-3.5 text-gray-400" />;
  };

  const fmtDuration = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-card text-foreground w-full max-w-sm h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-bold text-foreground">Call History</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{calls.length} calls logged</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          )}
          {!loading && calls.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <PhoneMissed className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No calls logged yet for this lead</p>
            </div>
          )}
          {!loading && calls.map(call => (
            <div key={call.id} className="px-4 py-3 border-b border-border hover:bg-muted transition-colors">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">{outcomeIcon(call.outcome)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${OUTCOME_COLORS[call.outcome]}`}>
                      {OUTCOME_LABELS[call.outcome]}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{fmtDuration(call.duration_seconds)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{fmtDate(call.called_at)}</p>
                  {call.disposition_notes && (
                    <p className="text-xs text-foreground/80 mt-1 line-clamp-2 italic">"{call.disposition_notes}"</p>
                  )}
                  {call.agent_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">by {call.agent_name}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Lead Card ─────────────────────────────────────────────────────────

function MobileLeadCard({
  lead,
  onStartCall,
  onShowDialpad,
  onShowCallLog,
  callCount,
}: {
  lead: LeadContext;
  onStartCall: () => void;
  onShowDialpad: () => void;
  onShowCallLog: () => void;
  callCount: number;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
      {/* Lead header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{lead.contactName}</h2>
            <p className="text-sm text-muted-foreground truncate mt-0.5">{lead.address}</p>
            {lead.city && (
              <p className="text-xs text-muted-foreground mt-0.5">{lead.city}, {lead.state}</p>
            )}
          </div>
          <button
            onClick={onShowCallLog}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-background transition-colors flex-shrink-0"
          >
            <List className="w-3.5 h-3.5" />
            {callCount > 0 ? `${callCount} calls` : 'Log'}
          </button>
        </div>

        {lead.phone && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground font-mono">{lead.phone}</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-4 flex gap-2">
        {/* One-tap call start */}
        <button
          onClick={onStartCall}
          className="flex-1 h-12 rounded-2xl bg-foreground text-background font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity touch-manipulation"
        >
          <Phone className="w-4 h-4" />
          Start Call
        </button>
        {/* Dialpad */}
        <button
          onClick={onShowDialpad}
          className="h-12 w-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center hover:text-foreground hover:bg-background transition-colors touch-manipulation flex-shrink-0"
          title="Open dialpad"
        >
          <Hash className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Call Outline Progress Tracker ───────────────────────────────────────────

function CallOutlineTracker({
  scriptId,
  transcript,
  coveredBeats,
  onToggleBeat,
}: {
  scriptId: ScriptId;
  transcript: TranscriptEntry[];
  coveredBeats: Set<string>;
  onToggleBeat: (beatId: string) => void;
}) {
  const relevantBeats = SCRIPT_BEATS.filter(b => b.scriptIds.includes(scriptId));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted">
        <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Call Outline</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {coveredBeats.size}/{relevantBeats.length} covered
        </span>
      </div>
      <div className="p-2 space-y-1">
        {relevantBeats.map(beat => {
          const covered = coveredBeats.has(beat.id);
          return (
            <button
              key={beat.id}
              onClick={() => onToggleBeat(beat.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors touch-manipulation ${
                covered
                    ? 'bg-green-50 text-green-700' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title={covered ? 'Click to unmark' : 'Click to mark as covered'}
            >
              {covered
                ? <CheckSquare className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                : <Square className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
              }
              <span className="text-xs font-medium truncate">{beat.shortLabel}</span>
              {covered && (
                <span className="ml-auto text-xs text-green-500 flex-shrink-0">✓</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="px-3 py-2 border-t border-border bg-muted">
        <div className="h-1.5 bg-background rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${relevantBeats.length > 0 ? (coveredBeats.size / relevantBeats.length) * 100 : 0}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {coveredBeats.size === relevantBeats.length
            ? 'All key points covered'
            : `${relevantBeats.length - coveredBeats.size} remaining`}
        </p>
      </div>
    </div>
  );
}

// ─── Audio Quality Banner ─────────────────────────────────────────────────────

function AudioQualityBanner({ lowConfidenceCount }: { lowConfidenceCount: number }) {
  if (lowConfidenceCount < 3) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
      <AlertOctagon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
      <span className="text-amber-700 font-medium">
        Audio quality low — suggestions may be less accurate ({lowConfidenceCount} low-confidence segments detected)
      </span>
    </div>
  );
}

// ─── Suggestion Source Badge ──────────────────────────────────────────────────

function SuggestionSourceBadge({ meta }: { meta: SuggestionMeta }) {
  if (!meta.source) return null;

  if (meta.degraded) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="w-3 h-3 text-amber-500" />
        <span className="text-xs text-amber-700 font-medium">
          {meta.degradedReason === 'llm_timeout' ? 'LLM timeout — showing script fallback' : 'LLM error — showing script fallback'}
        </span>
      </div>
    );
  }

  if (meta.source === 'objection_library') {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg">
        <BookOpen className="w-3 h-3 text-blue-500" />
        <span className="text-xs text-blue-700 font-medium">
          Objection library · {meta.objectionCategory}
        </span>
      </div>
    );
  }

  if (meta.source === 'static_fallback') {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg">
        <FileText className="w-3 h-3 text-gray-400" />
        <span className="text-xs text-gray-500 font-medium">Script fallback</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg">
      <Zap className="w-3 h-3 text-gray-400" />
      <span className="text-xs text-gray-500 font-medium">AI generated</span>
    </div>
  );
}

// ─── Suggestion Feedback Buttons ──────────────────────────────────────────────

function SuggestionFeedback({
  onUsed,
  onIgnored,
  lastFeedback,
}: {
  onUsed: () => void;
  onIgnored: () => void;
  lastFeedback: 'used' | 'ignored' | null;
}) {
  return (
    <div className="flex items-center gap-2 pt-2 border-t border-border">
      <span className="text-xs text-muted-foreground">Did you use this?</span>
      <button
        onClick={onUsed}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors touch-manipulation ${
          lastFeedback === 'used' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground hover:bg-green-50 hover:text-green-700'
        }`}
      >
        <ThumbsUp className="w-3 h-3" />
        Used it
      </button>
      <button
        onClick={onIgnored}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors touch-manipulation ${
          lastFeedback === 'ignored' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground hover:bg-red-50 hover:text-red-700'
        }`}
      >
        <ThumbsDown className="w-3 h-3" />
        Skipped
      </button>
    </div>
  );
}

// ─── Post-Call Summary Panel ──────────────────────────────────────────────────

function PostCallSummaryPanel({
  summary,
  isGenerating,
}: {
  summary: {
    summary: string;
    objections: string[];
    objectionHandling: string;
    nextStep: string;
    homeownerSentiment: string;
    keyTopicsCovered: string[];
  } | null;
  isGenerating: boolean;
}) {
  if (isGenerating) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Generating call summary…</p>
          <p className="text-xs text-blue-600 mt-0.5">This will be saved to the activity timeline automatically.</p>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const sentimentColors: Record<string, string> = {
    positive: 'text-green-700 bg-green-50 border-green-200',
    neutral: 'text-foreground bg-muted border-border',
    negative: 'text-red-700 bg-red-50 border-red-200',
    mixed: 'text-amber-700 bg-amber-50 border-amber-200',
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted">
        <BarChart2 className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Auto-Generated Call Summary</span>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full border ${sentimentColors[summary.homeownerSentiment] || sentimentColors.neutral}`}>
          {summary.homeownerSentiment}
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Summary</p>
          <p className="text-sm text-foreground leading-relaxed">{summary.summary}</p>
        </div>

        {summary.objections.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Objections Raised</p>
            <div className="space-y-1">
              {summary.objections.map((obj, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-foreground/80">{obj}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1 italic">{summary.objectionHandling}</p>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Next Step</p>
          <div className="flex items-start gap-2">
            <ChevronRight className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-foreground font-medium">{summary.nextStep}</p>
          </div>
        </div>

        {summary.keyTopicsCovered.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Topics Covered</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.keyTopicsCovered.map((topic, i) => (
                <span key={i} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{topic}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 pt-1">
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          <p className="text-xs text-green-700 font-medium">Saved to activity timeline</p>
        </div>
      </div>
    </div>
  );
}

// ─── Headset Setup Panel ──────────────────────────────────────────────────────

function HeadsetSetupPanel({
  onComplete,
  userId,
}: {
  onComplete: (inputId: string, outputId: string) => void;
  userId?: string;
}) {
  const [state, setState] = useState<HeadsetState>({
    inputDevices: [],
    outputDevices: [],
    selectedInputId: '',
    selectedOutputId: '',
    isTestingMic: false,
    micLevel: 0,
    isTestingOutput: false,
    permissionGranted: false,
    permissionError: '',
    inputConnected: false,
    outputConnected: false,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const requestPermission = useCallback(async () => {
    setState(s => ({ ...s, permissionError: '' }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({
        deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`, kind: d.kind as MediaDeviceKind,
      }));
      const outputs = devices.filter(d => d.kind === 'audiooutput').map(d => ({
        deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 6)}`, kind: d.kind as MediaDeviceKind,
      }));
      const saved = userId ? devicePreferences.load(userId) : {};
      const savedInput = inputs.find(d => d.deviceId === saved.audioInputId);
      const savedOutput = outputs.find(d => d.deviceId === saved.audioOutputId);
      setState(s => ({
        ...s, permissionGranted: true, inputDevices: inputs, outputDevices: outputs,
        selectedInputId: savedInput?.deviceId || inputs[0]?.deviceId || '',
        selectedOutputId: savedOutput?.deviceId || outputs[0]?.deviceId || '',
        inputConnected: inputs.length > 0, outputConnected: outputs.length > 0,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({
        ...s,
        permissionError: msg.includes('denied')
          ? 'Microphone access was denied. Please allow microphone access in your browser settings and try again.'
          : `Could not access microphone: ${msg}`,
      }));
    }
  }, [userId]);

  useEffect(() => {
    requestPermission();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioCtxRef.current?.close();
    };
  }, [requestPermission]);

  useEffect(() => {
    const handleDeviceChange = async () => {
      if (!state.permissionGranted) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({
        deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`, kind: d.kind as MediaDeviceKind,
      }));
      const outputs = devices.filter(d => d.kind === 'audiooutput').map(d => ({
        deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 6)}`, kind: d.kind as MediaDeviceKind,
      }));
      const inputStillConnected = inputs.some(d => d.deviceId === state.selectedInputId);
      const outputStillConnected = outputs.some(d => d.deviceId === state.selectedOutputId);
      setState(s => ({ ...s, inputDevices: inputs, outputDevices: outputs, inputConnected: inputStillConnected, outputConnected: outputStillConnected }));
      if (!inputStillConnected) toast.error('Headset disconnected — reconnect to continue');
    };
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [state.permissionGranted, state.selectedInputId, state.selectedOutputId]);

  const startMicTest = useCallback(async () => {
    if (!state.selectedInputId) return;
    setState(s => ({ ...s, isTestingMic: true, micLevel: 0 }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: state.selectedInputId }, echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setState(s => ({ ...s, micLevel: Math.min(100, avg * 2) }));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
      setTimeout(() => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setState(s => ({ ...s, isTestingMic: false, micLevel: 0 }));
      }, 5000);
    } catch {
      setState(s => ({ ...s, isTestingMic: false }));
      toast.error('Could not access selected microphone');
    }
  }, [state.selectedInputId]);

  const stopMicTest = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setState(s => ({ ...s, isTestingMic: false, micLevel: 0 }));
  }, []);

  const playTestTone = useCallback(async () => {
    setState(s => ({ ...s, isTestingOutput: true }));
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
      osc.onended = () => { ctx.close(); setState(s => ({ ...s, isTestingOutput: false })); };
    } catch {
      setState(s => ({ ...s, isTestingOutput: false }));
    }
  }, []);

  const handleContinue = () => {
    if (!state.selectedInputId) { toast.error('Please select a microphone before continuing'); return; }
    if (userId) devicePreferences.save(userId, { audioInputId: state.selectedInputId, audioOutputId: state.selectedOutputId });
    onComplete(state.selectedInputId, state.selectedOutputId);
  };

  const isBluetoothDevice = (label: string) =>
    /bluetooth|bt|airpod|bose|sony|jabra|plantronics|poly|sennheiser/i.test(label);

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center">
            <Headphones className="w-5 h-5 text-background" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Headset Setup</h2>
        </div>
        <p className="text-sm text-muted-foreground">Select your audio devices and test them before starting the call session.</p>
      </div>

      {!state.permissionGranted && !state.permissionError && (
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 mb-4 text-center">
          <Mic className="w-8 h-8 text-blue-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">Microphone Access Required</p>
          <p className="text-xs text-muted-foreground mb-4">TRAVLR needs microphone access to power live call suggestions during homeowner calls.</p>
          <button onClick={requestPermission} className="px-5 py-2.5 bg-foreground text-background rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity touch-manipulation">Allow Microphone Access</button>
        </div>
      )}

      {state.permissionError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800 mb-1">Microphone Access Blocked</p>
              <p className="text-xs text-red-600">{state.permissionError}</p>
              <button onClick={requestPermission} className="mt-3 text-xs font-semibold text-red-700 underline touch-manipulation">Try Again</button>
            </div>
          </div>
        </div>
      )}

      {state.permissionGranted && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Microphone (Input)</label>
            <div className="relative">
              <select value={state.selectedInputId} onChange={e => setState(s => ({ ...s, selectedInputId: e.target.value, inputConnected: true }))} className="w-full px-3 py-3 rounded-xl border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background appearance-none pr-8 touch-manipulation">
                {state.inputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
            {state.selectedInputId && isBluetoothDevice(state.inputDevices.find(d => d.deviceId === state.selectedInputId)?.label || '') && (
              <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Wired headsets are recommended for the fastest response time. Bluetooth adds 100–300ms latency.</p>
            )}
            {!state.inputConnected && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1.5"><WifiOff className="w-3.5 h-3.5" />Selected device not detected — reconnect or choose another</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mic Level Test</span>
              <button onClick={state.isTestingMic ? stopMicTest : startMicTest} className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors touch-manipulation ${state.isTestingMic ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-muted text-foreground hover:bg-background'}`}>
                {state.isTestingMic ? 'Stop Test' : 'Test Mic'}
              </button>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-75" style={{ width: `${state.micLevel}%`, backgroundColor: state.micLevel > 70 ? '#ef4444' : state.micLevel > 30 ? '#22c55e' : '#d1d5db' }} />
            </div>
            {state.isTestingMic && <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Speak into your mic — you should see the bar move</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Speaker / Headset (Output)</label>
            <div className="relative">
              <select value={state.selectedOutputId} onChange={e => setState(s => ({ ...s, selectedOutputId: e.target.value }))} className="w-full px-3 py-3 rounded-xl border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background appearance-none pr-8 touch-manipulation">
                {state.outputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                {state.outputDevices.length === 0 && <option value="">Default system output</option>}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center justify-between bg-muted rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Test Output</p>
              <p className="text-xs text-muted-foreground">Play a tone to confirm audio is routed correctly</p>
            </div>
            <button onClick={playTestTone} disabled={state.isTestingOutput} className="flex items-center gap-1.5 px-4 py-2.5 bg-card border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-background transition-colors disabled:opacity-60 touch-manipulation">
              {state.isTestingOutput ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
              {state.isTestingOutput ? 'Playing…' : 'Play Tone'}
            </button>
          </div>

          <button onClick={handleContinue} disabled={!state.inputConnected} className="w-full py-3.5 px-6 bg-foreground text-background rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation">
            <Phone className="w-4 h-4" />
            Continue to Consent
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Consent Gate ─────────────────────────────────────────────────────────────

function ConsentGate({ onAccept, lead }: { onAccept: () => void; lead: LeadContext }) {
  const allPartyStates = ['CA', 'WA', 'FL', 'MA', 'IL', 'MD', 'NH', 'PA', 'CT', 'OR'];
  const isAllPartyState = allPartyStates.includes(lead.state.toUpperCase());

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto px-4">
      <div className="bg-warning-bg border border-warning-border rounded-2xl p-6 sm:p-8 w-full">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Recording Consent Required</h2>
            <p className="text-sm text-warning font-medium">
              {isAllPartyState
                ? `${lead.state} requires all-party consent — both you and the homeowner must agree before recording begins.`
                : 'Best practice requires disclosure before any recording or transcription begins.'}
            </p>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-warning-border p-5 mb-6">
          <p className="text-sm font-semibold text-foreground mb-3">Required disclosure to read at call start:</p>
          <blockquote className="text-base text-foreground italic border-l-4 border-warning pl-4 leading-relaxed">
            "Hi {lead.contactName}, before we get started — this call may be recorded for quality and training purposes. Is that okay with you?"
          </blockquote>
        </div>
        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-foreground/80">Transcription begins only after homeowner confirms consent</p>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-foreground/80">Call transcript stored securely, accessible only to you and admins</p>
          </div>
          {isAllPartyState && (
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700 font-medium">All-party consent state: read the disclosure and wait for verbal confirmation before proceeding</p>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Every teleprompter suggestion is a draft, not a locked script — you remain responsible for what you say on the call. Deviate freely when a suggestion doesn't fit the moment.
        </p>
        <button onClick={onAccept} className="w-full py-3.5 px-6 bg-foreground text-background rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity touch-manipulation">
          I understand — I will read the disclosure before recording begins
        </button>
      </div>
    </div>
  );
}

// ─── Script Reference Panel ───────────────────────────────────────────────────

function ScriptReferencePanel({ script, resolvedVars }: { script: CallScript; resolvedVars: ReturnType<typeof resolveVariables> }) {
  const renderLine = (line: ScriptLine) => {
    const resolved = applyVariables(line.text, resolvedVars);
    if (line.type === 'instruction') return <p key={line.id} className="text-xs text-muted-foreground italic px-1">[{resolved}]</p>;
    if (line.type === 'agent_fill') return (
      <div key={line.id} className="bg-warning-bg border border-warning-border rounded-lg px-3 py-2">
        <p className="text-xs font-semibold text-warning mb-0.5">Agent fills in:</p>
        <p className="text-sm text-warning font-medium">{resolved}</p>
      </div>
    );
    return <div key={line.id} className="bg-muted rounded-lg px-3 py-2"><p className="text-sm text-foreground leading-relaxed">"{resolved}"</p></div>;
  };

  return (
    <div className="space-y-4 overflow-y-auto max-h-full pr-1">
      <div className="bg-primary/10 border border-primary/15 rounded-xl px-3 py-2">
        <p className="text-xs font-semibold text-primary">Goal</p>
        <p className="text-xs text-foreground mt-0.5">{script.goal}</p>
      </div>
      {script.sections.map(section => (
        <div key={section.id}>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{section.title}</p>
          <div className="space-y-1.5">{section.lines.map(line => renderLine(line))}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Transcript Panel ─────────────────────────────────────────────────────────

function TranscriptPanel({ entries, isListening, currentSpeaker }: {
  entries: TranscriptEntry[];
  isListening: boolean;
  currentSpeaker: 'Agent' | 'Homeowner' | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [entries]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Live Transcript</h3>
        {isListening && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-600 font-medium">Recording</span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Volume2 className="w-8 h-8 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">Transcript will appear here as the call progresses</p>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className={`flex gap-3 ${entry.speaker === 'Agent' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${entry.speaker === 'Agent' ? 'bg-gray-900 text-white' : 'bg-blue-100 text-blue-700'}`}>
              {entry.speaker === 'Agent' ? <User className="w-3.5 h-3.5" /> : <Home className="w-3.5 h-3.5" />}
            </div>
            <div className={`max-w-[80%] ${entry.speaker === 'Agent' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div className={`flex items-center gap-2 ${entry.speaker === 'Agent' ? 'flex-row-reverse' : ''}`}>
                <span className="text-xs font-semibold text-muted-foreground">{entry.speaker}</span>
                <span className="text-xs text-muted-foreground/80">{entry.timestamp}</span>
              </div>
              <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${entry.speaker === 'Agent' ? 'bg-foreground text-background rounded-tr-sm' : 'bg-primary/10 text-foreground rounded-tl-sm'}`}>
                {entry.text}
              </div>
            </div>
          </div>
        ))}
        {currentSpeaker && (
          <div className={`flex gap-3 ${currentSpeaker === 'Agent' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${currentSpeaker === 'Agent' ? 'bg-gray-900' : 'bg-blue-100'}`}>
              {currentSpeaker === 'Agent' ? <User className="w-3.5 h-3.5 text-white" /> : <Home className="w-3.5 h-3.5 text-blue-700" />}
            </div>
            <div className={`px-3 py-2 rounded-xl ${currentSpeaker === 'Agent' ? 'bg-foreground/70 rounded-tr-sm' : 'bg-primary/10 rounded-tl-sm'}`}>
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Suggestion Panel ─────────────────────────────────────────────────────────

const TELEPROMPTER_DISPLAY_THEMES = {
  classic: { label: 'Classic', box: 'bg-gray-900', text: 'text-white', label_: 'text-gray-400' },
  yellow: { label: 'Yellow', box: 'bg-black', text: 'text-yellow-300', label_: 'text-yellow-600' },
  green: { label: 'Green', box: 'bg-black', text: 'text-green-400', label_: 'text-green-700' },
  light: { label: 'Light', box: 'bg-white border-2 border-gray-200', text: 'text-gray-900', label_: 'text-gray-400' },
} as const;
type TeleprompterTheme = keyof typeof TELEPROMPTER_DISPLAY_THEMES;

const TELEPROMPTER_SETTINGS_KEY = 'travlr_teleprompter_display_settings';

function loadDisplaySettings(): { fontSize: number; theme: TeleprompterTheme } {
  if (typeof window === 'undefined') return { fontSize: 18, theme: 'classic' };
  try {
    const raw = window.localStorage.getItem(TELEPROMPTER_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : 18,
        theme: TELEPROMPTER_DISPLAY_THEMES[parsed.theme as TeleprompterTheme] ? parsed.theme : 'classic',
      };
    }
  } catch { /* ignore */ }
  return { fontSize: 18, theme: 'classic' };
}

function DisplaySettingsPopover({
  fontSize,
  theme,
  onFontSizeChange,
  onThemeChange,
  onClose,
}: {
  fontSize: number;
  theme: TeleprompterTheme;
  onFontSizeChange: (n: number) => void;
  onThemeChange: (t: TeleprompterTheme) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-9 z-20 w-64 bg-card border border-border rounded-xl shadow-lg p-4" onMouseLeave={onClose}>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-foreground">Text Size</label>
          <span className="text-xs text-muted-foreground">{fontSize}px</span>
        </div>
        <input
          type="range"
          min={14}
          max={32}
          step={1}
          value={fontSize}
          onChange={(e) => onFontSizeChange(Number(e.target.value))}
          className="w-full accent-gray-900 touch-manipulation"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-foreground block mb-1.5">Color Theme</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(TELEPROMPTER_DISPLAY_THEMES) as [TeleprompterTheme, typeof TELEPROMPTER_DISPLAY_THEMES[TeleprompterTheme]][]).map(([key, t]) => (
            <button
              key={key}
              onClick={() => onThemeChange(key)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors touch-manipulation ${
                theme === key ? 'border-primary ring-1 ring-primary text-foreground' : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-full ${t.box} flex-shrink-0`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SuggestionPanel({
  suggestion,
  isLoading,
  onRefresh,
  meta,
  onFeedback,
  lastFeedback,
  lowConfidenceCount,
}: {
  suggestion: string;
  isLoading: boolean;
  onRefresh: () => void;
  meta: SuggestionMeta;
  onFeedback: (signal: 'used' | 'ignored') => void;
  lastFeedback: 'used' | 'ignored' | null;
  lowConfidenceCount: number;
}) {
  const lines = suggestion.split('\n').filter(l => l.trim());
  const [displaySettings, setDisplaySettings] = useState(loadDisplaySettings);
  const [showSettings, setShowSettings] = useState(false);
  const activeTheme = TELEPROMPTER_DISPLAY_THEMES[displaySettings.theme];

  const updateSettings = (next: Partial<{ fontSize: number; theme: TeleprompterTheme }>) => {
    setDisplaySettings(prev => {
      const merged = { ...prev, ...next };
      try { window.localStorage.setItem(TELEPROMPTER_SETTINGS_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
      return merged;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border relative">
        <h3 className="text-sm font-semibold text-foreground">AI Suggestion</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSettings(v => !v)} className="p-1.5 rounded-lg hover:bg-muted transition-colors touch-manipulation" title="Display settings">
            <Settings className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button onClick={onRefresh} disabled={isLoading} className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 touch-manipulation" title="Refresh suggestion">
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {showSettings && (
            <DisplaySettingsPopover
              fontSize={displaySettings.fontSize}
              theme={displaySettings.theme}
              onFontSizeChange={(n) => updateSettings({ fontSize: n })}
              onThemeChange={(t) => updateSettings({ theme: t })}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>
      </div>

      {lowConfidenceCount >= 3 && (
        <div className="px-3 pt-2">
          <AudioQualityBanner lowConfidenceCount={lowConfidenceCount} />
        </div>
      )}

      <div className="flex-1 p-4 overflow-y-auto">
        {isLoading && !suggestion && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Generating suggestion…</p>
          </div>
        )}
        {!isLoading && !suggestion && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Suggestions will appear as the conversation progresses</p>
          </div>
        )}
        {suggestion && (
          <div className="space-y-3">
            <SuggestionSourceBadge meta={meta} />

            {meta.note && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 italic">[Note: {meta.note}]</p>
            )}

            {lines.map((line, i) => {
              const isSuggested = line.startsWith('Suggested next line:');
              const isNote = line.startsWith('[Note:');
              const isOptionA = line.startsWith('Option A:');
              const isOptionB = line.startsWith('Option B:');

              if (isSuggested || isOptionA || isOptionB) {
                const colonIdx = line.indexOf(':');
                const label = line.slice(0, colonIdx + 1);
                const text = line.slice(colonIdx + 1).trim().replace(/^"|"$/g, '');
                const isMain = !(isOptionA || isOptionB);
                return (
                  <div key={i} className={`rounded-xl p-4 ${isOptionA || isOptionB ? 'bg-muted border border-border' : activeTheme.box}`}>
                    <p className={`text-xs font-semibold mb-2 ${isOptionA || isOptionB ? 'text-muted-foreground' : activeTheme.label_}`}>{label}</p>
                    <p
                      className={`leading-relaxed font-medium ${isOptionA || isOptionB ? 'text-foreground' : activeTheme.text}`}
                      style={isMain ? { fontSize: `${displaySettings.fontSize}px` } : undefined}
                    >
                      "{text}"
                    </p>
                  </div>
                );
              }
              if (isNote) return <p key={i} className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 italic">{line}</p>;
              if (line.startsWith('"') || line.startsWith('\u2018')) {
                return (
                  <div key={i} className={`rounded-xl p-4 ${activeTheme.box}`}>
                    <p className={`text-xs font-semibold mb-2 ${activeTheme.label_}`}>Suggested next line:</p>
                    <p className={`leading-relaxed font-medium ${activeTheme.text}`} style={{ fontSize: `${displaySettings.fontSize}px` }}>{line}</p>
                  </div>
                );
              }
              return <p key={i} className="text-sm text-muted-foreground leading-relaxed">{line}</p>;
            })}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Updating…
              </div>
            )}

            {suggestion && !isLoading && (
              <SuggestionFeedback
                onUsed={() => onFeedback('used')}
                onIgnored={() => onFeedback('ignored')}
                lastFeedback={lastFeedback}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Call Setup Form ──────────────────────────────────────────────────────────

interface CallSetupFormProps {
  onStart: (lead: LeadContext, agentName: string, scriptId: ScriptId) => void;
  prefill?: { contactName?: string; address?: string; city?: string; state?: string; phone?: string; agentName?: string; leadId?: string };
}

interface AssignedLeadOption {
  id: string;
  owner_name: string | null;
  contact_name?: string | null;
  property_address: string | null;
  address?: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  contact_phone?: string | null;
  verified_owner?: boolean;
  verified_number?: boolean;
}

const DEMO_LEAD_DETAILS = {
  contactName: 'Jordan Avery',
  address: '1287 Silver King Dr',
  city: 'Aspen',
  state: 'CO',
  phone: '(970) 555-0184',
};

function CallSetupForm({ onStart, prefill }: CallSetupFormProps) {
  const { user, session, role } = useAuth();
  const [contactName, setContactName] = useState(prefill?.contactName || '');
  const [address, setAddress] = useState(prefill?.address || '');
  const [city, setCity] = useState(prefill?.city || '');
  const [state, setState] = useState(prefill?.state || 'CO');
  const [phone, setPhone] = useState(prefill?.phone || '');
  const [selectedLeadId, setSelectedLeadId] = useState(prefill?.leadId);
  const [agentName, setAgentName] = useState(prefill?.agentName || '');
  const [scriptId, setScriptId] = useState<ScriptId>('initial_outreach');
  const [showDialpad, setShowDialpad] = useState(false);
  const [showCallLog, setShowCallLog] = useState(false);
  const [callCount, setCallCount] = useState(0);
  const [assignedLeads, setAssignedLeads] = useState<AssignedLeadOption[]>([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);

  // Auto-fill agent name from the logged-in user's profile
  useEffect(() => {
    if (agentName.trim() || !user) return;
    const supabase = createClient();
    supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        const metadata = user.user_metadata || {};
        const emailName = data?.email ? String(data.email).split('@')[0]?.replace(/[._-]+/g, ' ') : '';
        const name = data?.full_name || metadata.full_name || metadata.name || emailName || '';
        if (name) setAgentName(name);
      });
  }, [user, agentName]);

  // Load verified, phone-ready leads for the address dropdown.
  // Agents are scoped server-side to their assigned leads; admins receive the full verified list.
  useEffect(() => {
    let cancelled = false;

    const loadLeadOptions = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token || session?.access_token;
      if (!accessToken) return;

      const pageSize = 1000;
      const leads: AssignedLeadOption[] = [];

      for (let offset = 0; ; offset += pageSize) {
        const res = await fetch(`/api/agent/leads?limit=${pageSize}&offset=${offset}&verified_with_numbers=true`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'same-origin',
        });
        if (!res.ok) break;

        const data = await res.json();
        const page = ((data?.leads || []) as AssignedLeadOption[]).filter(l => (l.phone || l.contact_phone) && (l.property_address || l.address));
        leads.push(...page);

        if (page.length < pageSize) break;
      }

      if (!cancelled) setAssignedLeads(leads);
    };

    loadLeadOptions().catch(() => {
      if (!cancelled) setAssignedLeads([]);
    });

    return () => { cancelled = true; };
  }, [session]);

  // Load call count for this lead
  useEffect(() => {
    if (!prefill?.leadId) return;
    outreachCallService.getLeadCallSummary(prefill.leadId).then(s => setCallCount(s.totalCalls));
  }, [prefill?.leadId]);

  const portfolioStates = PORTFOLIO_STATES;
  const canViewAllLeadOptions = role === 'admin' || role === 'owner';

  const addressMatches = assignedLeads.filter(l =>
    !address.trim() || (l.property_address || l.address || '').toLowerCase().includes(address.toLowerCase())
  ).slice(0, canViewAllLeadOptions ? 20 : 8);

  const handleSelectLead = (lead: AssignedLeadOption) => {
    const leadAddress = lead.property_address || lead.address || '';
    const leadContactName = lead.owner_name || lead.contact_name || '';
    const leadPhone = lead.phone || lead.contact_phone || '';
    setSelectedLeadId(lead.id);
    setAddress(leadAddress);
    setCity(lead.city || '');
    const matchedState = portfolioStates.find(s => s.value === lead.state)?.value;
    if (matchedState) setState(matchedState);
    setContactName(leadContactName);
    setPhone(leadPhone);
    setShowAddressDropdown(false);
  };

  const handleAutofillLeadDetails = () => {
    const lead = addressMatches[0] || assignedLeads[0];
    if (lead) {
      handleSelectLead(lead);
      toast.success('Lead details auto-filled from your assigned leads');
      return;
    }

    setSelectedLeadId(undefined);
    setContactName(DEMO_LEAD_DETAILS.contactName);
    setAddress(DEMO_LEAD_DETAILS.address);
    setCity(DEMO_LEAD_DETAILS.city);
    setState(DEMO_LEAD_DETAILS.state);
    setPhone(DEMO_LEAD_DETAILS.phone);
    setShowAddressDropdown(false);
    toast.success('Lead details auto-filled');
  };

  const handleStart = () => {
    if (!address.trim()) { toast.error('Property address is required — check the lead record before starting a call'); return; }
    if (!agentName.trim()) { toast.error('Please enter your name before starting'); return; }
    const { localBlurb } = resolveVariables(
      { contactName: contactName.trim(), address: address.trim(), city: city.trim(), state },
      { senderName: agentName.trim() }
    );
    onStart({
      contactName: contactName.trim() || 'there',
      address: address.trim(),
      city: city.trim(),
      state,
      portfolioState: state,
      localBlurb,
      phone: phone || prefill?.phone,
      leadId: selectedLeadId || prefill?.leadId,
    }, agentName.trim(), scriptId);
  };

  const selectedScript = SCRIPT_OPTIONS.find(s => s.value === scriptId);
  const canAccessInterviewMode = role === 'admin' || role === 'owner';

  // Mobile: show lead card at top if prefilled
  const hasPrefill = !!(prefill?.contactName || prefill?.address);

  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-8">
      {/* Mobile Lead Card — shown when coming from lead record */}
      {hasPrefill && (
        <div className="mb-5">
          <MobileLeadCard
            lead={{
              contactName: contactName || 'Unknown',
              address: address || '',
              city,
              state,
              portfolioState: state,
              localBlurb: '',
              phone: prefill?.phone,
              leadId: prefill?.leadId,
            }}
            onStartCall={handleStart}
            onShowDialpad={() => setShowDialpad(true)}
            onShowCallLog={() => setShowCallLog(true)}
            callCount={callCount}
          />
        </div>
      )}

      {/* Property Intelligence Panel — regulation context before call */}
      {prefill?.leadId && (
        <div className="mb-5">
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <Shield className="w-3.5 h-3.5 text-background" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Property Context</p>
                <p className="text-xs text-muted-foreground">Review before calling</p>
              </div>
            </div>
            <TeleprompterRegulationPanel
              leadId={prefill.leadId}
              city={prefill.city}
              state={prefill.state}
            />
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-2">Live Call Teleprompter</h1>
        <p className="text-sm text-muted-foreground">Enter the lead details and select the call script to load, then start the session.</p>
      </div>

      {/* Interview Mode Entry Card — admin only */}
      {canAccessInterviewMode && (
        <Link
          href="/teleprompter/interview"
          className="block mb-5 bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-5 text-white hover:from-gray-800 hover:to-gray-700 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Interview Mode</p>
                <p className="text-xs text-gray-300 mt-0.5">Structured scripts + AI suggestions for Zoom interviews</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors flex-shrink-0" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['Homeowner Outreach Agent', 'Guest Experience Manager', 'Head of Property Operations', '+3 more'].map(role => (
              <span key={role} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-gray-300">{role}</span>
            ))}
          </div>
        </Link>
      )}

      <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Call Script</label>
          <div className="space-y-2">
            {SCRIPT_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setScriptId(opt.value)} className={`w-full text-left px-4 py-3 rounded-xl border transition-colors touch-manipulation ${scriptId === opt.value ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:border-primary/60 hover:bg-muted/50'}`}>
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className={`text-xs mt-0.5 ${scriptId === opt.value ? 'text-background/75' : 'text-muted-foreground'}`}>{opt.goal}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-border pt-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lead Details</p>
          <button
            type="button"
            onClick={handleAutofillLeadDetails}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 text-xs font-semibold hover:bg-blue-100 transition-colors touch-manipulation"
          >
            <Zap className="w-3.5 h-3.5" />
            Autofill
          </button>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Your Name (Agent)</label>
          <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)} autoComplete="name" placeholder="e.g. Sarah" className="w-full px-3 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent touch-manipulation" />
          {user && <p className="mt-1 text-xs text-muted-foreground">Auto-filled from your account — edit if needed</p>}
        </div>
        <div className="relative">
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Property Address <span className="text-danger">*</span></label>
          <input
            type="text"
            value={address}
            onChange={e => { setAddress(e.target.value); setSelectedLeadId(undefined); setShowAddressDropdown(true); }}
            onFocus={() => setShowAddressDropdown(true)}
            onBlur={() => setTimeout(() => setShowAddressDropdown(false), 150)}
            autoComplete="street-address"
            placeholder="e.g. 123 Mountain View Dr"
            className="w-full px-3 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent touch-manipulation"
          />
          <p className="mt-1 text-xs text-muted-foreground">Required — teleprompter cannot start without a property address</p>
          {showAddressDropdown && addressMatches.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
              <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                {canViewAllLeadOptions ? 'All Verified Leads With Numbers' : 'Your Assigned Verified Leads With Numbers'}
              </p>
              {addressMatches.map(lead => (
                <button
                  key={lead.id}
                  type="button"
                  onMouseDown={() => handleSelectLead(lead)}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border last:border-0"
                >
                  <p className="text-sm font-medium text-foreground truncate">{lead.property_address || lead.address}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">{[lead.owner_name || lead.contact_name, lead.city, lead.state].filter(Boolean).join(' · ')}</span>
                    {(lead.phone || lead.contact_phone) && <span className="text-xs text-muted-foreground font-mono ml-auto flex-shrink-0">{lead.phone || lead.contact_phone}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Homeowner / Contact Name</label>
          <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} autoComplete="name" placeholder="e.g. John Smith (leave blank to use 'there')" className="w-full px-3 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent touch-manipulation" />
          {selectedLeadId && <p className="mt-1 text-xs text-muted-foreground">Auto-filled from the selected lead</p>}
        </div>
        {phone && (
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Phone Number</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" className="w-full px-3 py-3 rounded-xl border border-input bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent touch-manipulation" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">City</label>
            <input type="text" value={city} onChange={e => setCity(e.target.value)} autoComplete="address-level2" placeholder="e.g. Aspen" className="w-full px-3 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent touch-manipulation" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Portfolio State</label>
            <select value={state} onChange={e => setState(e.target.value)} className="w-full px-3 py-3 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent touch-manipulation">
              {portfolioStates.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        {selectedScript && city && (
          <div className="bg-primary/10 border border-primary/15 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-primary mb-1">Local Blurb Preview</p>
            <p className="text-xs text-foreground">{resolveVariables({ contactName, address, city, state }, { senderName: agentName }).localBlurb}</p>
          </div>
        )}
        <button onClick={handleStart} className="w-full py-3.5 px-6 bg-foreground text-background rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 touch-manipulation">
          <Headphones className="w-4 h-4" />
          Continue to Headset Setup
        </button>
      </div>

      {showDialpad && <TouchDialpad phone={phone || prefill?.phone} onClose={() => setShowDialpad(false)} />}
      {showCallLog && <CallLogSidebar leadId={prefill?.leadId} onClose={() => setShowCallLog(false)} />}
    </div>
  );
}

// ─── Call Ended Summary ───────────────────────────────────────────────────────

function CallEndedSummary({
  transcript,
  duration,
  suggestionsCount,
  onSave,
  isSaving,
  autoSummary,
  isGeneratingSummary,
}: {
  transcript: TranscriptEntry[];
  duration: number;
  suggestionsCount: number;
  onSave: (outcome: CallOutcome, notes: string) => void;
  isSaving: boolean;
  autoSummary: { summary: string; objections: string[]; objectionHandling: string; nextStep: string; homeownerSentiment: string; keyTopicsCovered: string[] } | null;
  isGeneratingSummary: boolean;
}) {
  const [outcome, setOutcome] = useState<CallOutcome>('other');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (autoSummary?.nextStep && !notes) {
      setNotes(`Next step: ${autoSummary.nextStep}`);
    }
  }, [autoSummary]);

  const outcomes: { value: CallOutcome; label: string }[] = [
    { value: 'questionnaire_sent', label: 'Questionnaire Sent' },
    { value: 'follow_up_scheduled', label: 'Follow-Up Scheduled' },
    { value: 'proposal_conversation', label: 'Proposal Conversation' },
    { value: 'not_interested', label: 'Not Interested' },
    { value: 'voicemail', label: 'Left Voicemail' },
    { value: 'no_answer', label: 'No Answer' },
    { value: 'other', label: 'Other' },
  ];

  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Call Ended</h2>
            <p className="text-sm text-muted-foreground">{mins}m {secs}s · {transcript.length} exchanges · {suggestionsCount} AI suggestions</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Call Outcome</label>
            <div className="grid grid-cols-2 gap-2">
              {outcomes.map(o => (
                <button key={o.value} onClick={() => setOutcome(o.value)} className={`px-3 py-3 rounded-xl text-sm font-medium border transition-colors touch-manipulation ${outcome === o.value ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:border-primary/60 hover:bg-muted/50'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any follow-up actions, homeowner concerns, or context for the next touchpoint…" className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none touch-manipulation" />
          </div>
          <button onClick={() => onSave(outcome, notes)} disabled={isSaving} className="w-full py-3.5 px-6 bg-foreground text-background rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {isSaving ? 'Saving…' : 'Save to Activity Timeline'}
          </button>
        </div>
      </div>

      <PostCallSummaryPanel summary={autoSummary} isGenerating={isGeneratingSummary} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TeleprompterPageInner() {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<CallPhase>('setup');
  const [lead, setLead] = useState<LeadContext | null>(null);

  const prefill = {
    contactName: searchParams.get('contactName') || undefined,
    address: searchParams.get('address') || undefined,
    city: searchParams.get('city') || undefined,
    state: searchParams.get('state') || undefined,
    phone: searchParams.get('phone') || undefined,
    leadId: searchParams.get('leadId') || undefined,
  };

  const [agentName, setAgentName] = useState('');
  const [scriptId, setScriptId] = useState<ScriptId>('initial_outreach');
  const [resolvedVars, setResolvedVars] = useState<ReturnType<typeof resolveVariables> | null>(null);
  const [baseScriptText, setBaseScriptText] = useState('');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [suggestion, setSuggestion] = useState('');
  const [suggestionMeta, setSuggestionMeta] = useState<SuggestionMeta>({});
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<'Agent' | 'Homeowner' | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<'Agent' | 'Homeowner'>('Homeowner');
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [suggestionsCount, setSuggestionsCount] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [selectedOutputId, setSelectedOutputId] = useState('');
  const [headsetConnected, setHeadsetConnected] = useState(true);
  const [showDialpad, setShowDialpad] = useState(false);
  const [showCallLog, setShowCallLog] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'suggestion' | 'ai-prep'>('suggestion');
  const [showEnrichmentSidebar, setShowEnrichmentSidebar] = useState(true);

  // Reliability state
  const [coveredBeats, setCoveredBeats] = useState<Set<string>>(new Set());
  const [lowConfidenceCount, setLowConfidenceCount] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<'used' | 'ignored' | null>(null);
  const [currentSuggestionId, setCurrentSuggestionId] = useState<string>('');
  const [autoSummary, setAutoSummary] = useState<{
    summary: string; objections: string[]; objectionHandling: string;
    nextStep: string; homeownerSentiment: string; keyTopicsCovered: string[];
  } | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const suggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSuggestionRef = useRef<string>('');
  const isSuggestingRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => { if (data.user) setUserId(data.user.id); });
  }, []);

  useEffect(() => {
    if (phase === 'active' && callStartTime) {
      timerRef.current = setInterval(() => { setElapsed(Math.floor((Date.now() - callStartTime.getTime()) / 1000)); }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, callStartTime]);

  useEffect(() => {
    if (phase !== 'active') return;
    const handleDeviceChange = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputStillConnected = devices.some(d => d.kind === 'audioinput' && d.deviceId === selectedInputId);
      if (!inputStillConnected && selectedInputId) {
        setHeadsetConnected(false);
        setIsListening(false);
        if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.stop(); recognitionRef.current = null; }
        toast.error('Headset disconnected — reconnect to continue live suggestions');
      } else if (inputStillConnected && !headsetConnected) {
        setHeadsetConnected(true);
        toast.success('Headset reconnected');
      }
    };
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [phase, selectedInputId, headsetConnected]);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const detectCoveredBeats = useCallback((entries: TranscriptEntry[]) => {
    const relevantBeats = SCRIPT_BEATS.filter(b => b.scriptIds.includes(scriptId));
    const newCovered = new Set<string>();
    for (const beat of relevantBeats) {
      for (const entry of entries) {
        for (const pattern of beat.patterns) {
          if (pattern.test(entry.text)) { newCovered.add(beat.id); break; }
        }
        if (newCovered.has(beat.id)) break;
      }
    }
    setCoveredBeats(prev => new Set([...prev, ...newCovered]));
  }, [scriptId]);

  const handleToggleBeat = useCallback((beatId: string) => {
    setCoveredBeats(prev => {
      const next = new Set(prev);
      if (next.has(beatId)) next.delete(beatId);
      else next.add(beatId);
      return next;
    });
  }, []);

  const fetchSuggestion = useCallback(async (currentTranscript: TranscriptEntry[], isBargeIn = false) => {
    if (!lead || !baseScriptText || currentTranscript.length === 0) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (isBargeIn) { setSuggestion(''); setSuggestionMeta({}); }

    setIsSuggesting(true);
    isSuggestingRef.current = true;
    const newSuggestionId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCurrentSuggestionId(newSuggestionId);
    setLastFeedback(null);

    try {
      const res = await fetch('/api/teleprompter/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          transcript: currentTranscript.slice(-10).map(e => ({ speaker: e.speaker, text: e.text })),
          baseScript: baseScriptText,
          scriptId,
          leadContext: {
            contactName: lead.contactName,
            address: lead.address,
            portfolioState: lead.portfolioState,
            localBlurb: lead.localBlurb,
          },
          sessionId,
          isBargeIn,
        }),
      });

      if (controller.signal.aborted) return;

      const data = await res.json();
      if (data.suggestion) {
        setSuggestion(data.suggestion);
        lastSuggestionRef.current = data.suggestion;
        setSuggestionMeta({
          source: data.source,
          degraded: data.degraded,
          degradedReason: data.degradedReason,
          suppressedReason: data.suppressedReason,
          objectionId: data.objectionId,
          objectionCategory: data.objectionCategory,
          note: data.note,
        });
        setSuggestionsCount(c => c + 1);
        if (data.suppressedReason === 'low_confidence') setLowConfidenceCount(c => c + 1);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
    } finally {
      if (!controller.signal.aborted) { setIsSuggesting(false); isSuggestingRef.current = false; }
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  }, [lead, baseScriptText, scriptId, sessionId]);

  const handleSuggestionFeedback = useCallback(async (signal: 'used' | 'ignored') => {
    setLastFeedback(signal);
    if (sessionId && lastSuggestionRef.current) {
      try {
        await fetch('/api/teleprompter/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            suggestionId: currentSuggestionId,
            suggestionText: lastSuggestionRef.current,
            source: suggestionMeta.source,
            objectionId: suggestionMeta.objectionId,
            scriptId,
            leadId: lead?.leadId,
          }),
        });
      } catch { /* non-blocking */ }
    }
  }, [sessionId, currentSuggestionId, suggestionMeta, scriptId, lead]);

  const addTranscriptEntry = useCallback((speaker: 'Agent' | 'Homeowner', text: string) => {
    const entry: TranscriptEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      speaker,
      text,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    setTranscript(prev => {
      const updated = [...prev, entry];
      detectCoveredBeats(updated);
      const isBargeIn = speaker === 'Homeowner' && isSuggestingRef.current;
      if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current);
      suggestionDebounceRef.current = setTimeout(() => {
        fetchSuggestion(updated, isBargeIn);
      }, speaker === 'Homeowner' ? 400 : 800);
      return updated;
    });
    setCurrentSpeaker(null);
  }, [fetchSuggestion, detectCoveredBeats]);

  const startListening = useCallback(() => {
    const SpeechRecognitionCtor = (window as typeof window & {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    }).SpeechRecognition || (window as typeof window & {
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    }).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) { toast.error('Speech recognition not supported in this browser. Use Chrome or Edge.'); return; }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
          const confidence = result[0].confidence;
          if (typeof confidence === 'number' && confidence < 0.6) setLowConfidenceCount(c => c + 1);
        } else {
          interim += result[0].transcript;
          if (activeSpeaker === 'Homeowner' && isSuggestingRef.current) {
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
              setSuggestion('');
              setSuggestionMeta({});
            }
          }
        }
      }
      if (interim) setCurrentSpeaker(activeSpeaker);
      if (final.trim()) addTranscriptEntry(activeSpeaker, final.trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'no-speech') console.warn('[SpeechRecognition] error:', event.error);
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [activeSpeaker, addTranscriptEntry]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsListening(false);
    setCurrentSpeaker(null);
  }, []);

  const handleSetupComplete = (leadCtx: LeadContext, agent: string, sid: ScriptId) => {
    setLead(leadCtx);
    setAgentName(agent);
    setScriptId(sid);
    const vars = resolveVariables(
      { contactName: leadCtx.contactName, address: leadCtx.address, city: leadCtx.city, state: leadCtx.state },
      { senderName: agent }
    );
    setResolvedVars(vars);
    const script = CALL_SCRIPTS[sid];
    const rawText = buildScriptText(script);
    const resolvedText = applyVariables(rawText, vars);
    setBaseScriptText(resolvedText);
    setPhase('headset');
  };

  const handleHeadsetComplete = (inputId: string, outputId: string) => {
    setSelectedInputId(inputId);
    setSelectedOutputId(outputId);
    setHeadsetConnected(true);
    setPhase('consent');
  };

  const handleConsentAccepted = async () => {
    setPhase('active');
    const now = new Date();
    setCallStartTime(now);
    setCoveredBeats(new Set());
    setLowConfidenceCount(0);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && lead) {
        const res = await fetch('/api/teleprompter/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            leadAddress: lead.address,
            leadState: lead.state,
            agentName,
            contactName: lead.contactName,
            portfolioState: lead.portfolioState,
            baseScriptVariant: scriptId,
          }),
        });
        const data = await res.json();
        if (data.sessionId) setSessionId(data.sessionId);
      }
    } catch { /* non-blocking */ }

    if (resolvedVars && lead) {
      const script = CALL_SCRIPTS[scriptId];
      const firstLine = script.sections[0]?.lines.find(l => l.type === 'spoken');
      if (firstLine) {
        const suggText = `Suggested next line: "${applyVariables(firstLine.text, resolvedVars)}"`;
        setSuggestion(suggText);
        lastSuggestionRef.current = suggText;
        setSuggestionMeta({ source: 'static_fallback' });
      }
    }
  };

  const handleEndCall = async () => {
    stopListening();
    if (timerRef.current) clearInterval(timerRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setPhase('ended');

    if (transcript.length > 0) {
      setIsGeneratingSummary(true);
      try {
        const res = await fetch('/api/teleprompter/auto-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            transcript,
            leadId: lead?.leadId,
            leadAddress: lead?.address,
            leadState: lead?.state,
            contactName: lead?.contactName,
            scriptId,
            durationSeconds: elapsed,
            agentName,
          }),
        });
        const data = await res.json();
        if (data.summary) setAutoSummary(data.summary);
      } catch { /* non-blocking */ }
      finally { setIsGeneratingSummary(false); }
    }
  };

  const handleSaveSession = async (outcome: CallOutcome, notes: string) => {
    setIsSaving(true);
    try {
      if (sessionId) {
        await fetch('/api/teleprompter/session', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, transcript, suggestionsCount, outcome, notes, durationSeconds: elapsed }),
        });
      }

      if (lead) {
        await outreachCallService.logCall({
          leadId: lead.leadId,
          sessionId: sessionId ?? undefined,
          agentName,
          contactName: lead.contactName,
          outcome: outcome as CallOutcomeType,
          durationSeconds: elapsed,
          calledAt: callStartTime?.toISOString(),
          scriptVariant: scriptId,
          portfolioState: lead.portfolioState,
          dispositionNotes: notes || undefined,
          transcriptLength: transcript.length,
          suggestionsCount,
          metadata: {
            address: lead.address,
            state: lead.state,
            covered_beats: Array.from(coveredBeats),
            low_confidence_segments: lowConfidenceCount,
          },
        });

        // Auto-trigger cadence based on call outcome
        if (lead.leadId) {
          try {
            await fetch('/api/cadence/stage-trigger', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                leadId: lead.leadId,
                callOutcome: outcome,
                agentName,
                notes,
              }),
            });
          } catch { /* non-blocking */ }
        }
      }

      if (lead) {
        await activityService.record({
          leadId: lead.leadId,
          leadAddress: lead.address,
          leadState: lead.state,
          eventType: 'outreach_sent',
          description: `Live call with ${lead.contactName} — ${formatOutcome(outcome)}`,
          detail: `Script: ${CALL_SCRIPTS[scriptId].label} · Duration: ${formatElapsed(elapsed)} · ${transcript.length} exchanges · ${suggestionsCount} AI suggestions`,
          source: 'teleprompter',
          metadata: {
            script_id: scriptId,
            outcome,
            duration_seconds: elapsed,
            suggestions_count: suggestionsCount,
            transcript_length: transcript.length,
            session_id: sessionId,
            notes,
            covered_beats: Array.from(coveredBeats),
            low_confidence_segments: lowConfidenceCount,
          },
        });
      }

      toast.success('Call saved to activity timeline');
      setPhase('setup');
      setTranscript([]);
      setSuggestion('');
      setSuggestionMeta({});
      setSuggestionsCount(0);
      setElapsed(0);
      setSessionId(null);
      setLead(null);
      setResolvedVars(null);
      setCoveredBeats(new Set());
      setLowConfidenceCount(0);
      setAutoSummary(null);
    } catch {
      toast.error('Failed to save call session');
    } finally {
      setIsSaving(false);
    }
  };

  const formatOutcome = (o: CallOutcome) => {
    const map: Record<CallOutcome, string> = {
      questionnaire_sent: 'Questionnaire Sent', follow_up_scheduled: 'Follow-Up Scheduled',
      proposal_conversation: 'Proposal Conversation', not_interested: 'Not Interested',
      voicemail: 'Left Voicemail', no_answer: 'No Answer', other: 'Other',
    };
    return map[o];
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (phase === 'setup') return <div className="min-h-screen bg-background text-foreground"><CallSetupForm onStart={handleSetupComplete} prefill={prefill} /></div>;
  if (phase === 'headset') return <div className="min-h-screen bg-background text-foreground"><HeadsetSetupPanel onComplete={handleHeadsetComplete} userId={userId} /></div>;
  if (phase === 'consent' && lead) return <div className="min-h-screen bg-background text-foreground"><ConsentGate onAccept={handleConsentAccepted} lead={lead} /></div>;
  if (phase === 'ended') {
    return (
      <div className="min-h-screen bg-background text-foreground">
      <CallEndedSummary
        transcript={transcript}
        duration={elapsed}
        suggestionsCount={suggestionsCount}
        onSave={handleSaveSession}
        isSaving={isSaving}
        autoSummary={autoSummary}
        isGeneratingSummary={isGeneratingSummary}
      />
      </div>
    );
  }

  const activeScript = CALL_SCRIPTS[scriptId];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 bg-card border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-semibold text-foreground">Live</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-shrink-0">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono font-medium text-foreground">{formatElapsed(elapsed)}</span>
          </div>
          {lead && (
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground min-w-0">
              <span className="text-muted-foreground/50">·</span>
              <span className="truncate max-w-[120px]">{lead.contactName}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0">{activeScript.label}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Dialpad button — mobile prominent */}
          <button
            onClick={() => setShowDialpad(true)}
            className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors touch-manipulation"
            title="Open dialpad"
          >
            <Hash className="w-4 h-4" />
          </button>
          {/* Call log button */}
          {lead?.leadId && (
            <button
              onClick={() => setShowCallLog(true)}
              className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors touch-manipulation"
              title="Call history"
            >
              <List className="w-4 h-4" />
            </button>
          )}
          {isListening ? (
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <Radio className="w-3.5 h-3.5 text-green-600 animate-pulse" />
              <span className="text-xs font-semibold text-green-700 hidden sm:inline">Listening</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-muted rounded-lg">
              <MicOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Mic Off</span>
            </div>
          )}
          {!headsetConnected && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg">
              <WifiOff className="w-3.5 h-3.5 text-red-500" />
            </div>
          )}
          <button onClick={() => setShowScript(s => !s)} className="hidden sm:flex px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors items-center gap-1.5 touch-manipulation">
            <FileText className="w-3.5 h-3.5" />
            {showScript ? 'Hide' : 'Script'}
          </button>
          <button onClick={handleEndCall} className="px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 touch-manipulation">
            <PhoneOff className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">End Call</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Script reference */}
        {showScript && resolvedVars && (
          <div className="w-64 xl:w-80 flex flex-col border-r border-border bg-card overflow-hidden flex-shrink-0 hidden sm:flex">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{activeScript.label} Script</h3>
              <Settings className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <ScriptReferencePanel script={activeScript} resolvedVars={resolvedVars} />
            </div>
          </div>
        )}

        {/* Transcript */}
        <div className="flex-1 flex flex-col border-r border-border bg-card overflow-hidden">
          <TranscriptPanel entries={transcript} isListening={isListening} currentSpeaker={currentSpeaker} />
          {/* Mic controls — touch-friendly */}
          <div className="border-t border-border p-3 sm:p-4 flex-shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-xl border border-border overflow-hidden text-xs font-semibold">
                <button onClick={() => setActiveSpeaker('Agent')} className={`px-3 py-2.5 flex items-center gap-1.5 transition-colors touch-manipulation ${activeSpeaker === 'Agent' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                  <User className="w-3 h-3" /> Agent
                </button>
                <button onClick={() => setActiveSpeaker('Homeowner')} className={`px-3 py-2.5 flex items-center gap-1.5 transition-colors touch-manipulation ${activeSpeaker === 'Homeowner' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                  <Home className="w-3 h-3" /> Owner
                </button>
              </div>
              <button
                onClick={() => isListening ? stopListening() : startListening()}
                disabled={!headsetConnected}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation ${isListening ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-foreground text-background hover:opacity-90'}`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isListening ? 'Stop' : 'Start Mic'}
              </button>
              <p className="text-xs text-muted-foreground flex-1 hidden sm:block">
                {!headsetConnected ? 'Reconnect headset' : isListening ? `Listening as ${activeSpeaker}…` : 'Tap Start Mic'}
              </p>
            </div>
          </div>
        </div>

        {/* Right panel: Suggestion + Call Outline */}
        <div className="w-72 sm:w-80 xl:w-96 flex flex-col bg-card overflow-hidden flex-shrink-0">
          {/* Tab bar */}
          <div className="flex items-center border-b border-border flex-shrink-0">
            <button
              onClick={() => setRightPanelTab('suggestion')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
                rightPanelTab === 'suggestion' ?'text-foreground border-b-2 border-foreground' :'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Suggestions
            </button>
            <button
              onClick={() => setRightPanelTab('ai-prep')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
                rightPanelTab === 'ai-prep' ?'text-primary border-b-2 border-primary' :'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              AI Prep
            </button>
          </div>

          {rightPanelTab === 'suggestion' ? (
            <>
              <div className="p-3 border-b border-border flex-shrink-0">
                <CallOutlineTracker
                  scriptId={scriptId}
                  transcript={transcript}
                  coveredBeats={coveredBeats}
                  onToggleBeat={handleToggleBeat}
                />
              </div>
              <div className="flex-1 overflow-hidden">
                <SuggestionPanel
                  suggestion={suggestion}
                  isLoading={isSuggesting}
                  onRefresh={() => fetchSuggestion(transcript)}
                  meta={suggestionMeta}
                  onFeedback={handleSuggestionFeedback}
                  lastFeedback={lastFeedback}
                  lowConfidenceCount={lowConfidenceCount}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-3">
              <AIEnrichmentPanel
                leadContext={{
                  contactName: lead?.contactName,
                  address: lead?.address,
                  city: lead?.city,
                  state: lead?.state,
                  scriptId,
                }}
                isCallActive={phase === 'active'}
              />
            </div>
          )}
        </div>

        {/* Enrichment Sidebar */}
        <div className="hidden xl:flex flex-shrink-0">
          {showEnrichmentSidebar ? (
            <EnrichmentSidebar
              signals={{
                estimatedNetMonthly: undefined,
                luxuryClassification: undefined,
                regulationComplianceStatus: 'unknown',
                regulationState: lead?.state,
                ownerProfileConfidenceScore: undefined,
                prospectScore: undefined,
              }}
              contactName={lead?.contactName}
              address={lead?.address}
            />
          ) : (
            <button
              onClick={() => setShowEnrichmentSidebar(true)}
              className="flex items-center justify-center w-8 bg-card border-l border-border hover:bg-muted transition-colors"
              title="Show enrichment signals"
            >
              <PanelRightOpen className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Dialpad overlay */}
      {showDialpad && <TouchDialpad phone={lead?.phone} onClose={() => setShowDialpad(false)} />}
      {/* Call log sidebar */}
      {showCallLog && <CallLogSidebar leadId={lead?.leadId} onClose={() => setShowCallLog(false)} />}
    </div>
  );
}

export default function TeleprompterPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" /></div>}>
      <TeleprompterPageInner />
    </Suspense>
  );
}
