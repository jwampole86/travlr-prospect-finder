'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX, Radio, RadioTower, X, ChevronDown, User, Home, Clock, Loader2, Sparkles, RefreshCw, MessageSquare, Minimize2,  } from 'lucide-react';
import type { CallOutcome } from '@/lib/services/callSessionService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranscriptEntry {
  id: string;
  speaker: 'Agent' | 'Homeowner';
  text: string;
  timestamp: string;
}

interface LeadInfo {
  leadId?: string;
  contactName?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  sessionId?: string;
  baseScript?: string;
  scriptId?: string;
}

interface ImmersiveCallViewProps {
  leadInfo: LeadInfo;
  callDuration: number;
  muted: boolean;
  speakerOff: boolean;
  recording: boolean;
  onMuteToggle: () => void;
  onSpeakerToggle: () => void;
  onRecordingToggle: () => void;
  onHangUp: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const OUTCOME_LABELS: Record<CallOutcome, { label: string; color: string }> = {
  interested: { label: 'Interested', color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' },
  callback: { label: 'Callback', color: 'text-blue-400 bg-blue-500/20 border-blue-500/30' },
  not_interested: { label: 'Not Interested', color: 'text-red-400 bg-red-500/20 border-red-500/30' },
  voicemail: { label: 'Voicemail', color: 'text-amber-400 bg-amber-500/20 border-amber-500/30' },
  no_answer: { label: 'No Answer', color: 'text-gray-400 bg-gray-500/20 border-gray-500/30' },
  other: { label: 'Other', color: 'text-purple-400 bg-purple-500/20 border-purple-500/30' },
};

// ─── Whisper Transcription Hook ───────────────────────────────────────────────

function useWhisperTranscription(
  active: boolean,
  onTranscript: (entry: TranscriptEntry) => void
) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const sendChunk = useCallback(async (blob: Blob) => {
    if (blob.size < 1000) return; // skip tiny chunks
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'chunk.webm');
      formData.append('speaker', 'Agent');
      const res = await fetch('/api/twilio/voice/transcribe', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) return;
      const { text, speaker } = await res.json();
      if (text && text.trim()) {
        onTranscript({
          id: `t-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          speaker: (speaker as 'Agent' | 'Homeowner') || 'Agent',
          text: text.trim(),
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      // silent — transcription is best-effort
    }
  }, [onTranscript]);

  useEffect(() => {
    if (!active) {
      // Stop everything
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
      setIsCapturing(false);
      return;
    }

    let cancelled = false;

    async function startCapture() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.start(3000); // collect 3s chunks
        setIsCapturing(true);

        // Every 5 seconds, flush accumulated chunks and send
        intervalRef.current = setInterval(() => {
          if (chunksRef.current.length === 0) return;
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          chunksRef.current = [];
          sendChunk(blob);
        }, 5000);
      } catch {
        // Mic not available — graceful degradation
        setIsCapturing(false);
      }
    }

    startCapture();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [active, sendChunk]);

  return { isCapturing };
}

// ─── Claude Suggestion Hook ───────────────────────────────────────────────────

function useClaudeSuggestion(
  transcript: TranscriptEntry[],
  leadInfo: LeadInfo,
  active: boolean
) {
  const [suggestion, setSuggestion] = useState('');
  const [loading, setLoading] = useState(false);
  const lastFragmentRef = useRef('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestion = useCallback(async (liveFragment?: string) => {
    if (!active || (!transcript.length && !liveFragment)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/teleprompter/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript.slice(-10),
          baseScript: leadInfo.baseScript || 'Initial outreach call to homeowner.',
          scriptId: leadInfo.scriptId || 'initial_outreach',
          leadContext: {
            contactName: leadInfo.contactName || 'there',
            address: leadInfo.address || '',
            portfolioState: leadInfo.state || '',
            localBlurb: '',
          },
          liveFragment: liveFragment || undefined,
          sessionId: leadInfo.sessionId,
        }),
      });
      if (!res.ok) return;
      const { suggestion: s } = await res.json();
      if (s) setSuggestion(s);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [active, transcript, leadInfo]);

  // Auto-fetch when transcript updates (debounced)
  useEffect(() => {
    if (!active || transcript.length === 0) return;
    const lastEntry = transcript[transcript.length - 1];
    const fragment = lastEntry?.text || '';
    if (fragment === lastFragmentRef.current) return;
    lastFragmentRef.current = fragment;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestion(fragment);
    }, 800);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [transcript, active, fetchSuggestion]);

  return { suggestion, loading, refresh: () => fetchSuggestion() };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImmersiveCallView({
  leadInfo,
  callDuration,
  muted,
  speakerOff,
  recording,
  onMuteToggle,
  onSpeakerToggle,
  onRecordingToggle,
  onHangUp,
  onMinimize,
  onClose,
}: ImmersiveCallViewProps) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const handleNewTranscript = useCallback((entry: TranscriptEntry) => {
    setTranscript(prev => [...prev, entry]);
    setSuggestionDismissed(false);
  }, []);

  const { isCapturing } = useWhisperTranscription(true, handleNewTranscript);
  const { suggestion, loading: suggestionLoading, refresh: refreshSuggestion } = useClaudeSuggestion(
    transcript,
    leadInfo,
    true
  );

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Demo: inject a placeholder transcript entry after 3s if no real mic
  useEffect(() => {
    if (isCapturing) return;
    const t = setTimeout(() => {
      setTranscript([{
        id: 'demo-1',
        speaker: 'Agent',
        text: 'Hi, may I speak with the homeowner? This is [Agent Name] calling from TRAVLR.',
        timestamp: new Date().toISOString(),
      }]);
    }, 3000);
    return () => clearTimeout(t);
  }, [isCapturing]);

  return (
    <div className="fixed inset-0 z-[10001] bg-gray-950 flex flex-col overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold text-white">Live Call</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-800 rounded-full">
            <Clock size={12} className="text-gray-400" />
            <span className="font-mono text-sm font-bold text-white">{formatDuration(callDuration)}</span>
          </div>
          {recording && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/20 border border-red-500/30 rounded-full">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] font-medium text-red-400">REC</span>
            </div>
          )}
          {isCapturing && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full">
              <Radio size={11} className="text-blue-400" />
              <span className="text-[11px] font-medium text-blue-400">Transcribing</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {leadInfo.contactName && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg mr-2">
              <User size={13} className="text-gray-400" />
              <span className="text-sm text-white font-medium">{leadInfo.contactName}</span>
              {leadInfo.address && (
                <span className="text-xs text-gray-400 hidden md:block">· {leadInfo.address}</span>
              )}
            </div>
          )}
          <button
            onClick={onMinimize}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            title="Minimize to floating dialer"
          >
            <Minimize2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            title="Close immersive view"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Transcript + Suggestion Panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Claude Suggestion Banner */}
          {!suggestionDismissed && (suggestion || suggestionLoading) && (
            <div className="mx-4 mt-4 bg-gradient-to-r from-violet-900/60 to-indigo-900/60 border border-violet-500/30 rounded-xl p-4 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={14} className="text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400 mb-1">
                      Claude · Next Line Suggestion
                    </p>
                    {suggestionLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 size={13} className="animate-spin text-violet-400" />
                        <span className="text-sm text-gray-400">Generating suggestion…</span>
                      </div>
                    ) : (
                      <p className="text-sm text-white leading-relaxed">{suggestion}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={refreshSuggestion}
                    className="p-1.5 rounded-lg hover:bg-violet-500/20 text-violet-400 transition-colors"
                    title="Refresh suggestion"
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button
                    onClick={() => setSuggestionDismissed(true)}
                    className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
                    title="Dismiss"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Transcript Feed */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600">
                <MessageSquare size={40} className="mb-3 opacity-30" />
                <p className="text-sm">Live transcript will appear here as the call progresses</p>
                {!isCapturing && (
                  <p className="text-xs mt-1 text-gray-700">
                    Microphone access required for real-time transcription
                  </p>
                )}
              </div>
            ) : (
              transcript.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex gap-3 ${entry.speaker === 'Agent' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                    entry.speaker === 'Agent' ?'bg-blue-500/20 border border-blue-500/30 text-blue-400' :'bg-green-500/20 border border-green-500/30 text-green-400'
                  }`}>
                    {entry.speaker === 'Agent' ? 'A' : 'H'}
                  </div>
                  <div className={`max-w-[70%] ${entry.speaker === 'Agent' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    <div className={`flex items-center gap-2 ${entry.speaker === 'Agent' ? 'flex-row-reverse' : ''}`}>
                      <span className="text-[10px] font-medium text-gray-500">{entry.speaker}</span>
                      <span className="text-[9px] text-gray-700">
                        {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className={`px-4 py-2.5 rounded-2xl text-sm text-white leading-relaxed ${
                      entry.speaker === 'Agent' ?'bg-blue-600/30 border border-blue-500/20 rounded-tr-sm' :'bg-gray-800 border border-gray-700 rounded-tl-sm'
                    }`}>
                      {entry.text}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* ── Call Controls Bar ── */}
          <div className="px-6 py-4 bg-gray-900 border-t border-gray-800 shrink-0">
            <div className="flex items-center justify-center gap-3">
              {/* Mute */}
              <button
                onClick={onMuteToggle}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${
                  muted
                    ? 'bg-red-500/20 border-red-500/40 text-red-400' :'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                }`}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <MicOff size={20} /> : <Mic size={20} />}
                <span className="text-[10px] font-medium">{muted ? 'Unmute' : 'Mute'}</span>
              </button>

              {/* Speaker */}
              <button
                onClick={onSpeakerToggle}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${
                  speakerOff
                    ? 'bg-red-500/20 border-red-500/40 text-red-400' :'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                }`}
                title={speakerOff ? 'Speaker On' : 'Speaker Off'}
              >
                {speakerOff ? <VolumeX size={20} /> : <Volume2 size={20} />}
                <span className="text-[10px] font-medium">Speaker</span>
              </button>

              {/* Record */}
              <button
                onClick={onRecordingToggle}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${
                  recording
                    ? 'bg-red-600/30 border-red-500/50 text-red-400' :'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                }`}
                title={recording ? 'Stop Recording' : 'Start Recording'}
              >
                <RadioTower size={20} />
                <span className="text-[10px] font-medium">{recording ? 'Recording' : 'Record'}</span>
              </button>

              {/* Hang Up */}
              <button
                onClick={onHangUp}
                className="flex flex-col items-center gap-1.5 px-8 py-3 rounded-2xl bg-red-600 hover:bg-red-700 border border-red-500 text-white transition-all active:scale-95 shadow-lg shadow-red-900/40"
                title="End Call"
              >
                <PhoneOff size={22} />
                <span className="text-[10px] font-semibold">End Call</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Lead Info Sidebar ── */}
        <div className={`border-l border-gray-800 bg-gray-900 flex flex-col transition-all duration-300 ${sidebarOpen ? 'w-72' : 'w-12'} shrink-0`}>
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="flex items-center justify-between px-3 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors"
          >
            {sidebarOpen ? (
              <>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Lead Info</span>
                <ChevronDown size={14} className="text-gray-500 rotate-90" />
              </>
            ) : (
              <User size={16} className="text-gray-500 mx-auto" />
            )}
          </button>

          {sidebarOpen && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Contact */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Contact</p>
                {leadInfo.contactName && (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                      <User size={14} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{leadInfo.contactName}</p>
                      {leadInfo.phone && (
                        <p className="text-[11px] text-gray-400">{leadInfo.phone}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Property */}
              {leadInfo.address && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Property</p>
                  <div className="flex items-start gap-2 bg-gray-800 rounded-xl p-3">
                    <Home size={14} className="text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-white leading-snug">{leadInfo.address}</p>
                      {(leadInfo.city || leadInfo.state) && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {[leadInfo.city, leadInfo.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Call Stats */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Call Stats</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="font-mono text-lg font-bold text-white">{formatDuration(callDuration)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Duration</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="font-mono text-lg font-bold text-white">{transcript.length}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Utterances</p>
                  </div>
                </div>
              </div>

              {/* Transcript Summary */}
              {transcript.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Recent</p>
                  <div className="space-y-1.5">
                    {transcript.slice(-3).map(entry => (
                      <div key={entry.id} className="bg-gray-800 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-medium text-gray-500 mb-0.5">{entry.speaker}</p>
                        <p className="text-xs text-gray-300 line-clamp-2">{entry.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status indicators */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Status</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Microphone</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${muted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                      {muted ? 'Muted' : 'Active'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Transcription</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isCapturing ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-500'}`}>
                      {isCapturing ? 'Live' : 'Standby'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Recording</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${recording ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-500'}`}>
                      {recording ? 'On' : 'Off'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
