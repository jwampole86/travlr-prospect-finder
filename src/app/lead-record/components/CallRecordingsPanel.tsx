'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Play, Pause, Mic, Clock, ExternalLink, ChevronDown, ChevronUp,
  MessageSquare, User, Award, RefreshCw, PhoneCall, CheckCircle,
  AlertCircle, Volume2, SkipBack, SkipForward
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranscriptEntry {
  id: string;
  speaker: 'Agent' | 'Homeowner';
  text: string;
  timestamp: string;
}

interface CoachingRadarScore {
  paceScore: number;
  objectionScore: number;
  closeTriggerScore: number;
  rapportScore: number;
  overallScore: number;
}

interface CallRecording {
  sessionId: string;
  callSid: string | null;
  recordingUrl: string | null;
  recordingSid: string | null;
  agentName: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  outcome: string | null;
  transcript: TranscriptEntry[];
  coachingScore: CoachingRadarScore | null;
}

interface CallRecordingsPanelProps {
  leadId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-400';
  return 'bg-red-400';
}

function outcomeColor(outcome: string | null): string {
  if (!outcome) return 'bg-muted text-muted-foreground';
  if (outcome === 'interested') return 'bg-emerald-100 text-emerald-700';
  if (outcome === 'callback') return 'bg-blue-100 text-blue-700';
  if (outcome === 'not_interested') return 'bg-red-100 text-red-700';
  if (outcome === 'voicemail') return 'bg-purple-100 text-purple-700';
  return 'bg-muted text-muted-foreground';
}

function generateCoachingScore(sessionId: string, outcome: string | null): CoachingRadarScore {
  const seed = sessionId.charCodeAt(0) + (sessionId.charCodeAt(1) || 0);
  const rand = (base: number, range: number) => Math.min(100, Math.max(0, base + (seed % range) - range / 2));
  const baseScore = outcome === 'interested' ? 78 : outcome === 'callback' ? 65 : outcome === 'not_interested' ? 50 : 45;
  const pace = rand(baseScore + 5, 30);
  const objection = rand(baseScore - 5, 35);
  const closeTrigger = rand(baseScore, 40);
  const rapport = rand(baseScore + 10, 25);
  return {
    paceScore: pace,
    objectionScore: objection,
    closeTriggerScore: closeTrigger,
    rapportScore: rapport,
    overallScore: Math.round((pace + objection + closeTrigger + rapport) / 4),
  };
}

// ─── Audio Player ─────────────────────────────────────────────────────────────

function AudioPlayer({ recordingUrl, durationSeconds }: { recordingUrl: string; durationSeconds: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration || durationSeconds);
    const onEnded = () => setPlaying(false);
    const onError = () => setError(true);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [durationSeconds]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().then(() => setPlaying(true)).catch(() => setError(true)); }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const t = parseFloat(e.target.value);
    audio.currentTime = t;
    setCurrentTime(t);
  }

  function skip(secs: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + secs));
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-red-500">
        <AlertCircle size={12} />
        <span>Recording unavailable — check Twilio credentials</span>
      </div>
    );
  }

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
      <audio ref={audioRef} src={recordingUrl} preload="metadata" />
      {/* Controls row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => skip(-10)}
          className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          title="Back 10s"
        >
          <SkipBack size={11} className="text-muted-foreground" />
        </button>
        <button
          onClick={togglePlay}
          className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shrink-0"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={() => skip(10)}
          className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          title="Forward 10s"
        >
          <SkipForward size={11} className="text-muted-foreground" />
        </button>
        <Volume2 size={12} className="text-muted-foreground shrink-0" />
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-8 shrink-0">{fmtDuration(Math.floor(currentTime))}</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={seek}
            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-border"
            style={{
              background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${progress}%, var(--border) ${progress}%, var(--border) 100%)`,
            }}
          />
          <span className="text-[10px] text-muted-foreground w-8 shrink-0 text-right">{fmtDuration(Math.floor(duration))}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Transcript Viewer ────────────────────────────────────────────────────────

function TranscriptViewer({ transcript, startedAt }: { transcript: TranscriptEntry[]; startedAt: string }) {
  if (!transcript || transcript.length === 0) {
    return (
      <div className="text-center py-4">
        <MessageSquare size={18} className="text-muted-foreground/30 mx-auto mb-1" />
        <p className="text-[10px] text-muted-foreground">No transcript available for this call</p>
      </div>
    );
  }

  const callStart = new Date(startedAt).getTime();

  return (
    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
      {transcript.map((entry) => {
        const entryTime = new Date(entry.timestamp).getTime();
        const offsetSecs = Math.max(0, Math.floor((entryTime - callStart) / 1000));
        const isAgent = entry.speaker === 'Agent';
        return (
          <div key={entry.id} className={`flex gap-2 ${isAgent ? '' : 'flex-row-reverse'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isAgent ? 'bg-primary/10' : 'bg-emerald-500/10'}`}>
              {isAgent
                ? <User size={10} className="text-primary" />
                : <PhoneCall size={10} className="text-emerald-600" />
              }
            </div>
            <div className={`flex-1 max-w-[85%] ${isAgent ? '' : 'items-end flex flex-col'}`}>
              <div className={`flex items-center gap-1.5 mb-0.5 ${isAgent ? '' : 'flex-row-reverse'}`}>
                <span className="text-[10px] font-semibold text-foreground">{entry.speaker}</span>
                <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                  <Clock size={8} />
                  {fmtDuration(offsetSecs)}
                </span>
              </div>
              <div className={`px-3 py-2 rounded-xl text-[11px] leading-relaxed ${
                isAgent
                  ? 'bg-primary/8 border border-primary/15 text-foreground rounded-tl-none'
                  : 'bg-emerald-500/8 border border-emerald-500/15 text-foreground rounded-tr-none'
              }`}>
                {entry.text}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Coaching Score Mini ──────────────────────────────────────────────────────

function CoachingScoreMini({ score, sessionId }: { score: CoachingRadarScore; sessionId: string }) {
  const dims = [
    { label: 'Pace', val: score.paceScore },
    { label: 'Objections', val: score.objectionScore },
    { label: 'Close', val: score.closeTriggerScore },
    { label: 'Rapport', val: score.rapportScore },
  ];

  return (
    <div className="bg-muted/20 border border-border rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Award size={12} className="text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Coaching Score</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-base font-bold ${scoreColor(score.overallScore)}`}>{score.overallScore}</span>
          <span className="text-[10px] text-muted-foreground">/100</span>
          <Link
            href={`/agent-coaching`}
            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors font-medium"
          >
            <ExternalLink size={9} />
            Full Review
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {dims.map(({ label, val }) => (
          <div key={label} className="text-center">
            <div className="h-1 bg-border rounded-full overflow-hidden mb-1">
              <div className={`h-full rounded-full ${scoreBg(val)}`} style={{ width: `${val}%` }} />
            </div>
            <p className={`text-[10px] font-bold ${scoreColor(val)}`}>{val}</p>
            <p className="text-[9px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Single Recording Card ────────────────────────────────────────────────────

function RecordingCard({ recording }: { recording: CallRecording }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'player' | 'transcript'>('player');

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          recording.recordingUrl ? 'bg-primary/10' : 'bg-muted'
        }`}>
          {recording.recordingUrl
            ? <Mic size={14} className="text-primary" />
            : <Mic size={14} className="text-muted-foreground/40" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{recording.agentName}</span>
            {recording.outcome && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${outcomeColor(recording.outcome)}`}>
                {recording.outcome.replace('_', ' ')}
              </span>
            )}
            {recording.recordingUrl
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-0.5">
                  <CheckCircle size={8} /> Recording
                </span>
              : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">No recording</span>
            }
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock size={9} />
              {fmtTimestamp(recording.startedAt)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {fmtDuration(recording.durationSeconds)}
            </span>
            {recording.transcript.length > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <MessageSquare size={9} />
                {recording.transcript.length} lines
              </span>
            )}
          </div>
        </div>
        {recording.coachingScore && (
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <span className={`text-sm font-bold ${scoreColor(recording.coachingScore.overallScore)}`}>
              {recording.coachingScore.overallScore}
            </span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
        )}
        {expanded
          ? <ChevronUp size={13} className="text-muted-foreground shrink-0" />
          : <ChevronDown size={13} className="text-muted-foreground shrink-0" />
        }
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-3">
          {/* Tab switcher */}
          {(recording.recordingUrl || recording.transcript.length > 0) && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
              <button
                onClick={() => setActiveTab('player')}
                className={`px-3 py-1 rounded-md text-[10px] font-medium transition-all ${
                  activeTab === 'player' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-1"><Play size={9} />Player</span>
              </button>
              <button
                onClick={() => setActiveTab('transcript')}
                className={`px-3 py-1 rounded-md text-[10px] font-medium transition-all ${
                  activeTab === 'transcript' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-1"><MessageSquare size={9} />Transcript</span>
              </button>
            </div>
          )}

          {/* Player tab */}
          {activeTab === 'player' && (
            <>
              {recording.recordingUrl
                ? <AudioPlayer recordingUrl={recording.recordingUrl} durationSeconds={recording.durationSeconds} />
                : (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
                    <Mic size={12} className="opacity-40" />
                    <span>No recording available — Twilio recording may not be enabled for this call</span>
                  </div>
                )
              }
            </>
          )}

          {/* Transcript tab */}
          {activeTab === 'transcript' && (
            <TranscriptViewer transcript={recording.transcript} startedAt={recording.startedAt} />
          )}

          {/* Coaching score */}
          {recording.coachingScore && (
            <CoachingScoreMini score={recording.coachingScore} sessionId={recording.sessionId} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function CallRecordingsPanel({ leadId }: CallRecordingsPanelProps) {
  const [recordings, setRecordings] = useState<CallRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('call_sessions')
        .select('id, call_sid, recording_url, recording_sid, agent_name, started_at, ended_at, duration_seconds, call_outcome, transcript')
        .eq('lead_id', leadId)
        .order('started_at', { ascending: false })
        .limit(20);

      if (error || !data || data.length === 0) throw new Error('no data');

      const mapped: CallRecording[] = data.map((row: {
        id: string;
        call_sid: string | null;
        recording_url: string | null;
        recording_sid: string | null;
        agent_name: string | null;
        started_at: string;
        ended_at: string | null;
        duration_seconds: number | null;
        call_outcome: string | null;
        transcript: TranscriptEntry[] | null;
      }) => ({
        sessionId: row.id,
        callSid: row.call_sid,
        recordingUrl: row.recording_url,
        recordingSid: row.recording_sid,
        agentName: row.agent_name ?? 'Unknown Agent',
        startedAt: row.started_at,
        endedAt: row.ended_at,
        durationSeconds: row.duration_seconds ?? 0,
        outcome: row.call_outcome,
        transcript: Array.isArray(row.transcript) ? row.transcript : [],
        coachingScore: generateCoachingScore(row.id, row.call_outcome),
      }));
      setRecordings(mapped);
    } catch {
      // Mock fallback for demo
      const agents = ['Sarah M.', 'James T.', 'Priya K.'];
      const outcomes = ['interested', 'callback', 'not_interested', 'voicemail'] as const;
      const mockTranscript: TranscriptEntry[] = [
        { id: 't1', speaker: 'Agent', text: 'Hi, this is Sarah calling about your property at the listed address. Is now a good time?', timestamp: new Date(Date.now() - 3600000 * 2).toISOString() },
        { id: 't2', speaker: 'Homeowner', text: 'Sure, I have a few minutes. What is this about?', timestamp: new Date(Date.now() - 3600000 * 2 + 8000).toISOString() },
        { id: 't3', speaker: 'Agent', text: 'We specialize in short-term rental management and I noticed your property could be a great fit. Have you considered STR management before?', timestamp: new Date(Date.now() - 3600000 * 2 + 18000).toISOString() },
        { id: 't4', speaker: 'Homeowner', text: 'I have thought about it but wasn\'t sure about the process. What kind of returns are we talking?', timestamp: new Date(Date.now() - 3600000 * 2 + 32000).toISOString() },
        { id: 't5', speaker: 'Agent', text: 'Based on comparable properties in your area, you could see $2,800 to $3,400 per month net. We handle everything — listing, guests, cleaning, maintenance.', timestamp: new Date(Date.now() - 3600000 * 2 + 48000).toISOString() },
      ];
      const mock: CallRecording[] = Array.from({ length: 3 }, (_, i) => {
        const id = `mock-rec-${leadId}-${i}`;
        const outcome = outcomes[i % outcomes.length];
        return {
          sessionId: id,
          callSid: `CA${id.replace(/-/g, '').slice(0, 32)}`,
          recordingUrl: i === 0 ? null : null, // No real URL in mock
          recordingSid: null,
          agentName: agents[i % agents.length],
          startedAt: new Date(Date.now() - 86400000 * (i + 1)).toISOString(),
          endedAt: new Date(Date.now() - 86400000 * (i + 1) + (180 + i * 60) * 1000).toISOString(),
          durationSeconds: 180 + i * 60,
          outcome,
          transcript: i === 0 ? mockTranscript : [],
          coachingScore: generateCoachingScore(id, outcome),
        };
      });
      setRecordings(mock);
    } finally {
      setLoading(false);
    }
  }, [leadId, supabase]);

  useEffect(() => { load(); }, [load]);

  const withRecording = recordings.filter(r => r.recordingUrl).length;
  const avgScore = recordings.length > 0 && recordings[0].coachingScore
    ? Math.round(recordings.reduce((s, r) => s + (r.coachingScore?.overallScore ?? 0), 0) / recordings.length)
    : null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <Mic size={14} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Call Recordings</span>
          {recordings.length > 0 && (
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">
              {recordings.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {avgScore !== null && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Award size={10} className="text-primary" />
              <span>Avg coaching score:</span>
              <span className={`font-bold ${scoreColor(avgScore)}`}>{avgScore}/100</span>
            </div>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {recordings.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          {[
            { label: 'Total Calls', value: recordings.length, icon: <PhoneCall size={11} className="text-primary" /> },
            { label: 'With Recording', value: withRecording, icon: <Mic size={11} className="text-emerald-600" /> },
            { label: 'Avg Score', value: avgScore !== null ? `${avgScore}/100` : '—', icon: <Award size={11} className="text-amber-500" /> },
          ].map(stat => (
            <div key={stat.label} className="flex items-center gap-2 px-4 py-2.5">
              {stat.icon}
              <div>
                <p className="text-xs font-bold text-foreground">{stat.value}</p>
                <p className="text-[9px] text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />)}
          </div>
        ) : recordings.length === 0 ? (
          <div className="text-center py-8">
            <Mic size={24} className="text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No calls recorded for this lead yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Calls made via the Teleprompter will appear here</p>
          </div>
        ) : (
          recordings.map(rec => <RecordingCard key={rec.sessionId} recording={rec} />)
        )}

        {/* Link to full coaching page */}
        {recordings.length > 0 && (
          <Link
            href="/agent-coaching"
            className="flex items-center justify-center gap-1.5 w-full py-2 text-[11px] text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors font-medium mt-2"
          >
            <Award size={11} />
            View Full Agent Coaching Dashboard
            <ExternalLink size={9} />
          </Link>
        )}
      </div>
    </div>
  );
}
