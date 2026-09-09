'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Lead, LeadStage } from '@/data/mockLeads';
import { stageOrder } from '@/data/mockLeads';
import { createClient } from '@/lib/supabase/client';
import { recordNoteAdded } from '@/lib/services/activityService';
import StageBadge from '@/components/ui/StageBadge';
import RegulationBadge from '@/components/ui/RegulationBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import { X, Phone, Mail, ExternalLink, MessageSquare, Clock, Calendar, ChevronDown, Plus, Send, Bell, CheckCircle, Trash2, Edit3, FileText, Home, DollarSign, Star, MapPin, User, Tag, ShieldCheck, ShieldAlert, RefreshCw, AlertCircle, PhoneCall, TrendingUp, ThumbsUp, ThumbsDown, Loader2, Play, Pause, Volume2, Shield, Award, AlertTriangle, Flag, MessageCircle, ExternalLink as LinkIcon } from 'lucide-react';
import { useRealtime } from '@/components/RealtimeProvider';

import { resolveLocalBlurb } from '@/lib/localBlurbs';
import EnrichmentPanel from './EnrichmentPanel';
import { placeOutboundCall, addRecentCall } from '@/lib/services/twilioVoiceService';
import { getPropertyListingUrl } from '@/lib/addressUtils';
import { callSessionService, type CallSession, type CallOutcome, type CallSummary } from '@/lib/services/callSessionService';
import SigningPortal from '@/components/SigningPortal';
import SigningStatusPanel from '@/components/SigningStatusPanel';
import ContractDealModal from '@/components/ContractDealModal';
import PipelineStatusBadge, { PIPELINE_STATUS_CONFIG, PIPELINE_STATUS_ORDER, type PipelineStatus } from '@/components/ui/PipelineStatusBadge';
import ConfidenceBandBadge, { getConfidenceBand, CONFIDENCE_BAND_CONFIG } from '@/components/ui/ConfidenceBandBadge';
import Icon from '@/components/ui/AppIcon';



interface ContactHistoryEntry {
  id: string;
  lead_id: string;
  type: 'email' | 'call' | 'text' | 'note';
  subject: string;
  body: string;
  outcome: string;
  contacted_at: string;
  created_at: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
}

interface Reminder {
  id: string;
  lead_id: string;
  title: string;
  due_date: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
}

interface OutreachCadence {
  id: string;
  lead_id: string;
  step_number: number;
  channel: string;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'skipped';
}

interface LeadDetailPanelProps {
  lead: Lead;
  onClose: () => void;
  onStageChange: (id: string, stage: LeadStage) => void;
  onDelete: (id: string) => void;
}

interface ContactVerification {
  phoneStatus: 'unverified' | 'verified' | 'invalid' | 'verifying';
  emailStatus: 'unverified' | 'verified' | 'invalid' | 'verifying';
  phoneEnriched?: string;
  emailEnriched?: string;
  lastVerifiedAt?: string;
}

function VerificationBadge({ status }: { status: ContactVerification['phoneStatus'] }) {
  if (status === 'verifying') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
        <RefreshCw size={9} className="animate-spin" />Checking…
      </span>
    );
  }
  if (status === 'verified') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
        <ShieldCheck size={9} />Verified
      </span>
    );
  }
  if (status === 'invalid') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
        <ShieldAlert size={9} />Invalid
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
      <AlertCircle size={9} />Unverified
    </span>
  );
}

const typeIcons: Record<string, React.ReactNode> = {
  email: <Mail size={13} />,
  call: <Phone size={13} />,
  text: <MessageSquare size={13} />,
  note: <FileText size={13} />,
};

const typeColors: Record<string, string> = {
  email: 'text-blue-500 bg-blue-500/10',
  call: 'text-green-500 bg-green-500/10',
  text: 'text-purple-500 bg-purple-500/10',
  note: 'text-amber-500 bg-amber-500/10',
};

const priorityColors: Record<string, string> = {
  low: 'text-muted-foreground border-border',
  medium: 'text-warning border-warning/40',
  high: 'text-danger border-danger/40',
};

function formatCurrency(n: number) {
  return '$' + n.toLocaleString('en-US');
}

function fillTemplate(body: string, lead: Lead, senderName?: string): string {
  const { blurb } = resolveLocalBlurb(lead.city, lead.state);
  return body
    .replace(/{{address}}/g, lead.address)
    .replace(/{{contactName}}/g, lead.contactName?.split(' ')[0] || 'there')
    .replace(/{{price}}/g, formatCurrency(lead.price))
    .replace(/{{senderName}}/g, senderName || 'Your Name')
    .replace(/{{localBlurb}}/g, blurb)
    .replace(/{{city}}/g, lead.city)
    .replace(/{{beds}}/g, String(lead.beds))
    .replace(/{{baths}}/g, String(lead.baths))
    .replace(/{{source}}/g, lead.source);
}

function fillSubject(subject: string, lead: Lead): string {
  return subject
    .replace(/{{address}}/g, lead.address)
    .replace(/{{contactName}}/g, lead.contactName?.split(' ')[0] || 'there')
    .replace(/{{city}}/g, lead.city);
}

type TabKey = 'overview' | 'history' | 'templates' | 'cadence' | 'reminders' | 'enrichment' | 'calls' | 'signing';

const CALL_OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  interested: { label: 'Interested', color: 'text-emerald-600 bg-emerald-500/10' },
  callback: { label: 'Callback', color: 'text-blue-600 bg-blue-500/10' },
  not_interested: { label: 'Not Interested', color: 'text-red-500 bg-red-500/10' },
  voicemail: { label: 'Voicemail', color: 'text-amber-600 bg-amber-500/10' },
  no_answer: { label: 'No Answer', color: 'text-muted-foreground bg-muted' },
  other: { label: 'Other', color: 'text-purple-600 bg-purple-500/10' },
};

const SENTIMENT_ICONS: Record<string, React.ReactNode> = {
  positive: <ThumbsUp size={11} className="text-emerald-600" />,
  negative: <ThumbsDown size={11} className="text-red-500" />,
  neutral: <TrendingUp size={11} className="text-muted-foreground" />,
  mixed: <TrendingUp size={11} className="text-amber-500" />,
};

// ─── QA Flag Types ────────────────────────────────────────────────────────────

type QAFlag = 'excellently_handled' | 'needs_coaching' | 'escalate_for_review' | null;

const QA_FLAG_CONFIG: Record<NonNullable<QAFlag>, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  excellently_handled: { label: 'Excellently Handled', color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: Award },
  needs_coaching: { label: 'Needs Coaching', color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/30', icon: AlertTriangle },
  escalate_for_review: { label: 'Escalate for Review', color: 'text-red-600', bg: 'bg-red-500/10 border-red-500/30', icon: Flag },
};

// ─── Platform Message Modal ───────────────────────────────────────────────────

function PlatformMessageModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new';
  const estimateUrl = `${siteUrl}/estimate?address=${encodeURIComponent(lead.address)}`;
  const [copied, setCopied] = useState(false);

  const messageTemplate = `Hi! I came across your listing at ${lead.address} and wanted to reach out — I'm with TRAVLR Vacation Homes, a property management company. If you're ever curious what ${lead.address} could earn as a managed vacation rental, here's a free instant estimate, no strings attached: ${estimateUrl}`;

  function handleCopy() {
    navigator.clipboard.writeText(messageTemplate).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Message on Platform</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Pre-filled outreach with TRAVLR estimate link</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-muted/40 border border-border rounded-lg p-3">
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{messageTemplate}</p>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-primary/5 border border-primary/20 rounded-lg">
            <LinkIcon size={12} className="text-primary shrink-0" />
            <span className="text-[11px] text-primary font-mono truncate">{estimateUrl}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Copy this message and send it manually via the listing platform's messaging system. Each message must be sent individually to comply with platform terms.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {copied ? <CheckCircle size={14} /> : <MessageCircle size={14} />}
              {copied ? 'Copied!' : 'Copy Message'}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CallSessionCard ──────────────────────────────────────────────────────────

function CallSessionCard({ session }: { session: CallSession }) {
  const [expanded, setExpanded] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [qaFlag, setQaFlag] = useState<QAFlag>((session as any).qa_flag ?? null);
  const [coachingNotes, setCoachingNotes] = useState<string>((session as any).coaching_notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingQA, setSavingQA] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const supabase = createClient();

  const duration = session.duration_seconds
    ? `${Math.floor(session.duration_seconds / 60)}:${String(session.duration_seconds % 60).padStart(2, '0')}`
    : '—';

  const recordingUrl = session.call_sid
    ? `/api/twilio/voice/recording-status?callSid=${encodeURIComponent(session.call_sid)}&action=playback`
    : null;

  function handleAudioToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (audioPlaying) {
      audioRef.current.pause();
      setAudioPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setAudioPlaying(true);
    }
  }

  function handleTimeUpdate() {
    if (!audioRef.current) return;
    setAudioProgress(audioRef.current.currentTime);
  }

  function handleLoadedMetadata() {
    if (!audioRef.current) return;
    setAudioDuration(audioRef.current.duration);
  }

  function handleEnded() {
    setAudioPlaying(false);
    setAudioProgress(0);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (!audioRef.current) return;
    const t = parseFloat(e.target.value);
    audioRef.current.currentTime = t;
    setAudioProgress(t);
  }

  function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  async function handleQAFlag(flag: QAFlag) {
    setSavingQA(true);
    const newFlag = qaFlag === flag ? null : flag;
    setQaFlag(newFlag);
    try {
      await supabase.from('call_sessions').update({ qa_flag: newFlag } as any).eq('id', session.id);
    } catch { /* silent */ }
    setSavingQA(false);
  }

  async function handleSaveNotes() {
    setSavingQA(true);
    try {
      await supabase.from('call_sessions').update({ coaching_notes: coachingNotes } as any).eq('id', session.id);
      setEditingNotes(false);
    } catch { /* silent */ }
    setSavingQA(false);
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <Phone size={13} className="text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="text-[10px] text-muted-foreground">{duration}</span>
            {session.call_outcome && CALL_OUTCOME_LABELS[session.call_outcome] && (
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${CALL_OUTCOME_LABELS[session.call_outcome].color}`}>
                {CALL_OUTCOME_LABELS[session.call_outcome].label}
              </span>
            )}
            {session.call_summary?.sentiment && (
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                {SENTIMENT_ICONS[session.call_summary.sentiment]}
                <span className="capitalize">{session.call_summary.sentiment}</span>
              </span>
            )}
            {session.call_sid && (
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                <Volume2 size={9} />Recorded
              </span>
            )}
            {/* QA Flag badge */}
            {qaFlag && QA_FLAG_CONFIG[qaFlag] && (
              <span className={`flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${QA_FLAG_CONFIG[qaFlag].bg} ${QA_FLAG_CONFIG[qaFlag].color}`}>
                {React.createElement(QA_FLAG_CONFIG[qaFlag].icon, { size: 9 })}
                {QA_FLAG_CONFIG[qaFlag].label}
              </span>
            )}
          </div>
          {session.agent_name && (
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <User size={9} />
              {session.agent_name}
            </p>
          )}
          {session.call_summary?.summary_text ? (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{session.call_summary.summary_text}</p>
          ) : session.disposition_notes ? (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 italic">{session.disposition_notes}</p>
          ) : null}
        </div>
        <ChevronDown size={13} className={`text-muted-foreground shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/10">
          {/* ── Audio Playback ── */}
          {session.call_sid && (
            <div className="px-4 py-3 border-b border-border/50">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Volume2 size={10} />Call Recording
              </p>
              <div className="flex items-center gap-3 bg-background border border-border rounded-lg px-3 py-2">
                <button
                  onClick={handleAudioToggle}
                  className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
                  aria-label={audioPlaying ? 'Pause recording' : 'Play recording'}
                >
                  {audioPlaying ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <div className="flex-1 min-w-0">
                  <input
                    type="range"
                    min={0}
                    max={audioDuration || session.duration_seconds || 100}
                    value={audioProgress}
                    onChange={handleSeek}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full h-1.5 accent-primary cursor-pointer"
                    aria-label="Seek recording"
                  />
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{fmtTime(audioProgress)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {audioDuration > 0 ? fmtTime(audioDuration) : duration}
                    </span>
                  </div>
                </div>
                <audio
                  ref={audioRef}
                  src={recordingUrl ?? undefined}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                  preload="metadata"
                />
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                Dual-channel recording · For QA, coaching, and dispute resolution
              </p>
            </div>
          )}

          {/* ── QA / Coaching Flags ── */}
          <div className="px-4 py-3 border-b border-border/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Award size={10} />QA &amp; Coaching
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(Object.entries(QA_FLAG_CONFIG) as [NonNullable<QAFlag>, typeof QA_FLAG_CONFIG[NonNullable<QAFlag>]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={(e) => { e.stopPropagation(); handleQAFlag(key); }}
                  disabled={savingQA}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                    qaFlag === key
                      ? `${cfg.bg} ${cfg.color} border-current`
                      : 'bg-background border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {React.createElement(cfg.icon, { size: 11 })}
                  {cfg.label}
                </button>
              ))}
            </div>
            {/* Coaching Notes */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-medium text-muted-foreground">Coaching Notes</p>
                {!editingNotes && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    {coachingNotes ? 'Edit' : '+ Add note'}
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div onClick={e => e.stopPropagation()}>
                  <textarea
                    value={coachingNotes}
                    onChange={e => setCoachingNotes(e.target.value)}
                    placeholder="Add coaching notes for this call..."
                    rows={3}
                    className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                  <div className="flex gap-2 mt-1.5">
                    <button
                      onClick={handleSaveNotes}
                      disabled={savingQA}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-[11px] font-medium hover:bg-primary/90 transition-colors"
                    >
                      {savingQA ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingNotes(false); setCoachingNotes((session as any).coaching_notes ?? ''); }}
                      className="px-3 py-1.5 border border-border rounded-md text-[11px] text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : coachingNotes ? (
                <p className="text-xs text-foreground bg-background border border-border rounded-lg px-3 py-2 leading-relaxed">{coachingNotes}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">No coaching notes yet.</p>
              )}
            </div>
          </div>

          {/* ── Summary ── */}
          {session.call_summary && (
            <div className="px-4 py-4 space-y-3">
              {session.call_summary.key_points?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Key Points</p>
                  <ul className="space-y-1">
                    {session.call_summary.key_points.map((pt, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                        <span className="text-primary mt-0.5 shrink-0">•</span>{pt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {session.call_summary.objections?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Objections</p>
                  <ul className="space-y-1">
                    {session.call_summary.objections.map((obj, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                        <span className="text-red-500 mt-0.5 shrink-0">•</span>{obj}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {session.call_summary.next_steps?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Next Steps</p>
                  <ul className="space-y-1">
                    {session.call_summary.next_steps.map((step, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                        <span className="text-emerald-600 mt-0.5 shrink-0">→</span>{step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {session.disposition_notes && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Agent Notes</p>
                  <p className="text-xs text-foreground bg-muted/40 rounded-lg px-3 py-2">{session.disposition_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* ── No summary fallback ── */}
          {!session.call_summary && (session.disposition_notes || session.transcript?.length > 0) && (
            <div className="px-4 py-3">
              {session.disposition_notes && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Agent Notes</p>
                  <p className="text-xs text-foreground bg-muted/40 rounded-lg px-3 py-2">{session.disposition_notes}</p>
                </div>
              )}
              {session.transcript?.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Transcript Snippet</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {session.transcript.slice(0, 4).map((t, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-muted-foreground">{t.speaker}: </span>
                        <span className="text-foreground">{t.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state when no summary and no notes */}
          {!session.call_summary && !session.disposition_notes && !session.transcript?.length && !session.call_sid && (
            <div className="px-4 py-3 text-xs text-muted-foreground italic">
              No summary or notes recorded for this call.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LeadDetailPanel({ lead, onClose, onStageChange, onDelete }: LeadDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [history, setHistory] = useState<ContactHistoryEntry[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [cadences, setCadences] = useState<OutreachCadence[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [callSessions, setCallSessions] = useState<CallSession[]>([]);
  const [loadingCallSessions, setLoadingCallSessions] = useState(false);

  // Contact verification state
  const [verification, setVerification] = useState<ContactVerification>({
    phoneStatus: 'unverified',
    emailStatus: 'unverified',
  });

  // Add contact log form
  const [logType, setLogType] = useState<'email' | 'call' | 'text' | 'note'>('note');
  const [logSubject, setLogSubject] = useState('');
  const [logBody, setLogBody] = useState('');
  const [logOutcome, setLogOutcome] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingLog, setSavingLog] = useState(false);

  // Add reminder form
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderPriority, setReminderPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [savingReminder, setSavingReminder] = useState(false);

  // Stage dropdown
  const [stageOpen, setStageOpen] = useState(false);

  // Call state
  const [calling, setCalling] = useState(false);
  const [callPlaced, setCallPlaced] = useState(false);

  // Template preview
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  // Add cadence form
  const [cadenceChannel, setCadenceChannel] = useState('email');
  const [cadenceDate, setCadenceDate] = useState('');
  const [savingCadence, setSavingCadence] = useState(false);

  const [showSigningPortal, setShowSigningPortal] = useState(false);
  const [signingEnvelopeCreated, setSigningEnvelopeCreated] = useState<{ sessionId: string; envelopeId: string } | null>(null);
  const [showPlatformMessage, setShowPlatformMessage] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);

  // ── Pipeline status state ─────────────────────────────────────────────────
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>(null);
  const [savingPipelineStatus, setSavingPipelineStatus] = useState(false);

  const supabase = createClient();

  // ── Real-time update banner ───────────────────────────────────────────────
  const { lastUpdate } = useRealtime();
  const [realtimeBanner, setRealtimeBanner] = useState<{ message: string; field: string } | null>(null);
  const [localLead, setLocalLead] = useState(lead);

  useEffect(() => {
    if (!lastUpdate) return;
    if (lastUpdate.table !== 'leads') return;
    const updatedId = String(lastUpdate.record?.id ?? '');
    if (updatedId !== lead.id) return;

    const newRecord = lastUpdate.record;
    const oldRecord = lastUpdate.oldRecord;

    // Detect what changed
    const changes: string[] = [];
    if (oldRecord?.stage !== newRecord?.stage) changes.push(`Stage → ${newRecord?.stage}`);
    if (oldRecord?.status !== newRecord?.status) changes.push(`Status → ${newRecord?.status}`);
    if (oldRecord?.notes !== newRecord?.notes) changes.push('Notes updated');

    if (changes.length > 0) {
      setRealtimeBanner({ message: changes.join(' · '), field: changes[0] });
      // Auto-dismiss after 8 seconds
      const t = setTimeout(() => setRealtimeBanner(null), 8000);
      return () => clearTimeout(t);
    }
  }, [lastUpdate, lead.id]);

  const loadData = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [histRes, tplRes, remRes, cadRes] = await Promise.all([
        supabase.from('contact_history').select('*').eq('lead_id', lead.id).order('contacted_at', { ascending: false }),
        supabase.from('email_templates').select('*').order('category'),
        supabase.from('lead_reminders').select('*').eq('lead_id', lead.id).order('due_date'),
        supabase.from('outreach_cadences').select('*').eq('lead_id', lead.id).order('step_number'),
      ]);
      if (histRes.data) setHistory(histRes.data as ContactHistoryEntry[]);
      if (tplRes.data) setTemplates(tplRes.data as EmailTemplate[]);
      if (remRes.data) setReminders(remRes.data as Reminder[]);
      if (cadRes.data) setCadences(cadRes.data as OutreachCadence[]);
    } catch {
      // silent
    } finally {
      setLoadingHistory(false);
    }
  }, [lead.id, supabase]);

  const loadCallSessions = useCallback(async () => {
    setLoadingCallSessions(true);
    try {
      const sessions = await callSessionService.getForLead(lead.id);
      setCallSessions(sessions);
    } finally {
      setLoadingCallSessions(false);
    }
  }, [lead.id]);

  useEffect(() => {
    loadData();
    loadCallSessions();
  }, [loadData, loadCallSessions]);

  useEffect(() => {
    if (activeTab === 'calls') {
      loadCallSessions();
    }
  }, [activeTab, loadCallSessions]);

  // Load pipeline status on mount
  useEffect(() => {
    supabase
      .from('leads')
      .select('pipeline_status')
      .eq('id', lead.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.pipeline_status) setPipelineStatus(data.pipeline_status as PipelineStatus);
      })
      .catch(() => {});
  }, [lead.id]);

  async function handlePipelineStatusChange(status: PipelineStatus) {
    const newStatus = pipelineStatus === status ? null : status;
    setSavingPipelineStatus(true);
    try {
      await supabase.from('leads').update({
        pipeline_status: newStatus,
        pipeline_status_updated_at: new Date().toISOString(),
      } as Record<string, unknown>).eq('id', lead.id);
      setPipelineStatus(newStatus);
    } catch { /* silent */ }
    setSavingPipelineStatus(false);
  }

  async function saveContactLog() {
    if (!logBody.trim()) return;
    setSavingLog(true);
    try {
      const { error } = await supabase.from('contact_history').insert({
        id: crypto.randomUUID(),
        lead_id: lead.id,
        type: logType,
        subject: logSubject,
        body: logBody,
        outcome: logOutcome,
        contacted_at: logDate,
      });
      if (!error) {
        // Record note activity when a note is genuinely saved
        if (logType === 'note') {
          recordNoteAdded({
            leadId: lead.id,
            address: lead.address,
            state: lead.state,
            notePreview: logBody.trim(),
          }).catch(() => {});
        }
        setLogSubject(''); setLogBody(''); setLogOutcome('');
        setLogDate(new Date().toISOString().split('T')[0]);
        await loadData();
      }
    } finally {
      setSavingLog(false);
    }
  }

  async function saveReminder() {
    if (!reminderTitle.trim() || !reminderDate) return;
    setSavingReminder(true);
    try {
      const { error } = await supabase.from('lead_reminders').insert({
        id: crypto.randomUUID(),
        lead_id: lead.id,
        title: reminderTitle,
        due_date: reminderDate,
        priority: reminderPriority,
        completed: false,
      });
      if (!error) {
        setReminderTitle(''); setReminderDate('');
        await loadData();
      }
    } finally {
      setSavingReminder(false);
    }
  }

  async function toggleReminder(rem: Reminder) {
    await supabase.from('lead_reminders').update({ completed: !rem.completed }).eq('id', rem.id);
    setReminders((prev) => prev.map((r) => r.id === rem.id ? { ...r, completed: !r.completed } : r));
  }

  async function deleteReminder(id: string) {
    await supabase.from('lead_reminders').delete().eq('id', id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  async function saveCadenceStep() {
    if (!cadenceDate) return;
    setSavingCadence(true);
    try {
      const nextStep = cadences.length + 1;
      const { error } = await supabase.from('outreach_cadences').insert({
        id: crypto.randomUUID(),
        lead_id: lead.id,
        step_number: nextStep,
        channel: cadenceChannel,
        scheduled_at: cadenceDate,
        status: 'pending',
      });
      if (!error) {
        setCadenceDate('');
        await loadData();
      }
    } finally {
      setSavingCadence(false);
    }
  }

  async function updateCadenceStatus(id: string, status: 'pending' | 'sent' | 'skipped') {
    await supabase.from('outreach_cadences').update({ status }).eq('id', id);
    setCadences((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
  }

  async function handleCallLead() {
    if (!lead.contactPhone) return;
    setCalling(true);
    try {
      const call = await placeOutboundCall(lead.contactPhone);
      setCallPlaced(true);
      await addRecentCall(lead.id, 'call', lead.contactPhone);
    } finally {
      setCalling(false);
    }
  }

  async function handleCallLead() {
    const phone = lead.contactPhone;
    if (!phone) return;
    setCalling(true);
    try {
      const result = await placeOutboundCall({
        to: phone,
        leadId: lead.id,
      });
      addRecentCall({
        to: phone,
        contactName: lead.contactName || undefined,
        address: lead.address,
        callSid: result.callSid,
        status: result.configured ? 'completed' : 'placeholder',
        duration: 0,
        startedAt: new Date().toISOString(),
        leadId: lead.id,
      });
      setCallPlaced(true);
      setTimeout(() => setCallPlaced(false), 4000);
    } finally {
      setCalling(false);
    }
  }

  async function runContactVerification() {
    setVerification((prev) => ({ ...prev, phoneStatus: 'verifying', emailStatus: 'verifying' }));
    // Simulate enrichment from source sync (in production, call your data enrichment API)
    await new Promise((res) => setTimeout(res, 1800));
    const phoneValid = lead.contactPhone ? /^\+?[\d\s\-().]{7,}$/.test(lead.contactPhone) : false;
    const emailValid = lead.contactEmail ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.contactEmail) : false;
    setVerification({
      phoneStatus: lead.contactPhone ? (phoneValid ? 'verified' : 'invalid') : 'unverified',
      emailStatus: lead.contactEmail ? (emailValid ? 'verified' : 'invalid') : 'unverified',
      phoneEnriched: phoneValid ? lead.contactPhone : undefined,
      emailEnriched: emailValid ? lead.contactEmail : undefined,
      lastVerifiedAt: new Date().toLocaleTimeString(),
    });
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Home size={13} /> },
    { key: 'enrichment', label: 'Enrichment', icon: <User size={13} /> },
    { key: 'calls', label: `Calls (${callSessions.length})`, icon: <Phone size={13} /> },
    { key: 'history', label: `History (${history.length})`, icon: <Clock size={13} /> },
    { key: 'templates', label: 'Templates', icon: <Mail size={13} /> },
    { key: 'cadence', label: 'Cadence', icon: <Calendar size={13} /> },
    { key: 'reminders', label: `Reminders (${reminders.filter(r => !r.completed).length})`, icon: <Bell size={13} /> },
    { key: 'signing', label: 'Agreement', icon: <Shield size={13} /> },
  ];

  // Wrap onStageChange to show contract modal when moving to Live
  function handleStageChange(id: string, stage: LeadStage) {
    onStageChange(id, stage);
    if (stage === 'Live') {
      setContractModalOpen(true);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch" role="dialog" aria-modal="true" aria-label={`Lead detail: ${lead.address}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-3xl bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden fade-in">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            {/* Breadcrumb back navigation */}
            <div className="flex items-center gap-1.5 mb-2">
              <button
                onClick={onClose}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Back to lead list"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Lead Management
              </button>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
              <span className="text-[11px] text-foreground font-medium truncate max-w-[200px]">{lead.address}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-foreground truncate">{lead.address}</h2>
              {lead.listingUrl && lead.listingUrl !== '' ? (
                <a href={getPropertyListingUrl(lead.listingUrl, lead.address, lead.city, lead.state, lead.zip, lead.source)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0">
                  <ExternalLink size={11} /> View listing on {lead.source}
                </a>
              ) : (
                <a href={getPropertyListingUrl(lead.listingUrl, lead.address, lead.city, lead.state, lead.zip, lead.source)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0">
                  <ExternalLink size={11} /> Search on {lead.source}
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              <MapPin size={10} className="inline mr-1" />
              {lead.city}, {lead.state} {lead.zip}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Stage dropdown */}
              <div className="relative">
                <button onClick={() => setStageOpen(v => !v)} className="flex items-center gap-1 cursor-pointer">
                  <StageBadge stage={lead.stage} size="sm" />
                  <ChevronDown size={11} className="text-muted-foreground" />
                </button>
                {stageOpen && (
                  <div className="absolute z-30 left-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                    {stageOrder.map((stage) => (
                      <button key={stage} onClick={() => { handleStageChange(lead.id, stage); setStageOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${stage === lead.stage ? 'bg-muted/60 font-semibold' : ''}`}>
                        {stage}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <RegulationBadge status={lead.regulationStatus} size="sm" />
              <span className="text-xs text-muted-foreground">{lead.source}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors shrink-0" aria-label="Close panel">
            <X size={18} />
          </button>
        </div>

        {/* Quick stats bar */}
        <div className="grid grid-cols-4 divide-x divide-border border-b border-border bg-muted/30 shrink-0">
          {[
            { label: 'Price/mo', value: formatCurrency(lead.price), icon: <DollarSign size={12} /> },
            { label: 'Beds/Ba', value: `${lead.beds}bd/${lead.baths}ba`, icon: <Home size={12} /> },
            { label: 'Score', value: `${lead.prospectScore}/100`, icon: <Star size={12} /> },
            { label: 'DOM', value: `${lead.daysOnMarket}d`, icon: <Clock size={12} /> },
          ].map((stat) => (
            <div key={stat.label} className="px-4 py-2.5 flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 text-muted-foreground">{stat.icon}<span className="text-[10px] uppercase tracking-wide">{stat.label}</span></div>
              <span className="font-mono-data text-sm font-semibold text-foreground">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Real-time update banner */}
        {realtimeBanner && (
          <div className="flex items-center gap-2 px-6 py-2 bg-blue-500/10 border-b border-blue-500/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <p className="text-xs text-blue-600 flex-1">
              <span className="font-semibold">Live update:</span> Another agent changed this lead — {realtimeBanner.message}
            </p>
            <button
              onClick={() => setRealtimeBanner(null)}
              className="text-blue-400 hover:text-blue-600 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-border bg-card shrink-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── SIGNING ── */}
          {activeTab === 'signing' && (
            <div className="p-6">
              <SigningStatusPanel
                leadId={lead.id}
                isAgentView={true}
                onInitiateSigning={() => setShowSigningPortal(true)}
              />
            </div>
          )}

          {/* ── CALLS ── */}
          {activeTab === 'calls' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Phone size={12} />Call History
                </h3>
                <button
                  onClick={loadCallSessions}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={12} className={loadingCallSessions ? 'animate-spin' : ''} />
                </button>
              </div>

              {loadingCallSessions ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              ) : callSessions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <Phone size={28} className="mx-auto mb-2 opacity-20" />
                  <p>No call sessions recorded for this lead yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {callSessions.map(session => (
                    <CallSessionCard key={session.id} session={session} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ENRICHMENT ── */}
          {activeTab === 'enrichment' && (
            <div className="p-6">
              <EnrichmentPanel lead={lead} />
            </div>
          )}

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="p-6 space-y-5">
              {/* Compact Call History Strip */}
              {callSessions.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <PhoneCall size={12} />Recent Calls
                    </h3>
                    <button
                      onClick={() => setActiveTab('calls')}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1"
                    >
                      View all ({callSessions.length})
                      <ChevronDown size={10} className="-rotate-90" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {callSessions.slice(0, 3).map((session) => {
                      const duration = session.duration_seconds
                        ? `${Math.floor(session.duration_seconds / 60)}:${String(session.duration_seconds % 60).padStart(2, '0')}`
                        : '—';
                      return (
                        <div key={session.id} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                          <div className="w-6 h-6 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                            <Phone size={10} className="text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-medium text-foreground">
                                {new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{duration}</span>
                              {session.call_outcome && CALL_OUTCOME_LABELS[session.call_outcome] && (
                                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${CALL_OUTCOME_LABELS[session.call_outcome].color}`}>
                                  {CALL_OUTCOME_LABELS[session.call_outcome].label}
                                </span>
                              )}
                            </div>
                            {session.agent_name && (
                              <p className="text-[10px] text-muted-foreground">{session.agent_name}</p>
                            )}
                          </div>
                          {session.call_summary?.sentiment && (
                            <span className="shrink-0">{SENTIMENT_ICONS[session.call_summary.sentiment]}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Contact info */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><User size={12} />Contact</h3>
                  {(lead as any).contactInfoRequested && (
                    <button
                      onClick={runContactVerification}
                      disabled={verification.phoneStatus === 'verifying' || verification.emailStatus === 'verifying'}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-muted hover:bg-muted/80 text-muted-foreground border border-border transition-all disabled:opacity-60"
                    >
                      <RefreshCw size={11} className={verification.phoneStatus === 'verifying' ? 'animate-spin' : ''} />
                      {verification.phoneStatus === 'verifying' ? 'Verifying…' : 'Verify Contact'}
                    </button>
                  )}
                </div>
                {/* Contact gating: only show contact details after homeowner consent */}
                {!(lead as any).contactInfoRequested ? (
                  <div className="flex flex-col gap-2 py-2">
                    <div className="flex items-center gap-2 text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                      <Shield size={14} className="shrink-0" />
                      <p className="text-xs font-medium leading-snug">
                        Contact info available after homeowner submits estimate form.
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      To protect homeowner privacy, contact details are only revealed once the homeowner has submitted the estimate form and given consent.
                    </p>
                    <a
                      href={`/info-request-dashboard`}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink size={10} />View Info Request Dashboard
                    </a>
                  </div>
                ) : lead.contactName ? (
                  <div className="space-y-2.5">
                    <p className="text-sm font-medium text-foreground">{lead.contactName}</p>

                    {/* Phone row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Phone size={13} className="text-muted-foreground shrink-0" />
                        {lead.contactPhone ? (
                          <a href={`tel:${lead.contactPhone}`} className="text-sm text-primary hover:underline truncate">
                            {verification.phoneEnriched || lead.contactPhone}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">No phone on file</span>
                        )}
                      </div>
                      <VerificationBadge status={verification.phoneStatus} />
                    </div>

                    {/* ── CALL BUTTON ── */}
                    {lead.contactPhone && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={handleCallLead}
                          disabled={calling}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold text-sm transition-all active:scale-95 shadow-sm"
                        >
                          <PhoneCall size={15} />
                          {calling ? 'Calling…' : callPlaced ? 'Call Placed ✓' : `Call ${lead.contactName?.split(' ')[0] || 'Homeowner'}`}
                        </button>
                        <a
                          href={`/teleprompter?phone=${encodeURIComponent(lead.contactPhone)}&contactName=${encodeURIComponent(lead.contactName || '')}&address=${encodeURIComponent(lead.address)}&city=${encodeURIComponent(lead.city)}&state=${encodeURIComponent(lead.state)}&leadId=${encodeURIComponent(lead.id)}`}
                          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-colors whitespace-nowrap"
                          title="Open teleprompter pre-filled with lead info"
                        >
                          <FileText size={13} />
                          Teleprompter
                        </a>
                        <button
                          onClick={() => setShowPlatformMessage(true)}
                          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-colors whitespace-nowrap"
                          title="Send templated platform message with estimate link"
                        >
                          <MessageCircle size={13} />
                          Message on Platform
                        </button>
                      </div>
                    )}

                    {/* Email row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail size={13} className="text-muted-foreground shrink-0" />
                        {lead.contactEmail ? (
                          <a href={`mailto:${lead.contactEmail}`} className="text-sm text-primary hover:underline truncate">
                            {verification.emailEnriched || lead.contactEmail}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">No email on file</span>
                        )}
                      </div>
                      <VerificationBadge status={verification.emailStatus} />
                    </div>

                    {verification.lastVerifiedAt && (
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        Last verified at {verification.lastVerifiedAt} · Data sourced from {lead.source}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">No contact info on file</p>
                    <button
                      onClick={runContactVerification}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <RefreshCw size={11} />Enrich from {lead.source} sync
                    </button>
                  </div>
                )}
              </div>

              {/* Score bar */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Star size={12} />Prospect Score</h3>
                  <ConfidenceBandBadge score={lead.prospectScore} showRange />
                </div>
                <ProspectScoreBar score={lead.prospectScore} showBand />
              </div>

              {/* ── Conversion Pipeline Status ── */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp size={12} />Pipeline Status
                  </h3>
                  {pipelineStatus && <PipelineStatusBadge status={pipelineStatus} size="sm" />}
                </div>
                <div className="flex flex-wrap gap-2">
                  {PIPELINE_STATUS_ORDER.map(status => {
                    const cfg = PIPELINE_STATUS_CONFIG[status];
                    const Icon = cfg.icon;
                    const isActive = pipelineStatus === status;
                    return (
                      <button
                        key={status}
                        onClick={() => handlePipelineStatusChange(status)}
                        disabled={savingPipelineStatus}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                          isActive
                            ? `${cfg.bg} ${cfg.color} ${cfg.border}`
                            : 'bg-background border-border text-muted-foreground hover:bg-muted'
                        } ${savingPipelineStatus ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Icon size={10} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2.5 p-2 bg-muted/30 rounded-lg">
                  <p className="text-[10px] text-muted-foreground">
                    Score: <span className="font-medium text-foreground">{lead.prospectScore}</span> ·{' '}
                    Band: <span className="font-medium text-foreground capitalize">{getConfidenceBand(lead.prospectScore)}</span> ·{' '}
                    {pipelineStatus === 'signed' ? (
                      <span className="text-emerald-600 font-medium">✓ Converted</span>
                    ) : pipelineStatus === 'rejected' ? (
                      <span className="text-red-500 font-medium">✗ Did not convert</span>
                    ) : pipelineStatus ? (
                      <span className="text-primary font-medium">In progress</span>
                    ) : (
                      <span className="text-muted-foreground">No status set</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Revenue estimates */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><DollarSign size={12} />Revenue Estimates</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Est. ADR', value: formatCurrency(lead.estimatedADR) },
                    { label: 'Occupancy', value: `${lead.estimatedOccupancy}%` },
                    { label: 'Gross/mo', value: formatCurrency(lead.estimatedGrossMonthly) },
                    { label: 'Net/mo', value: formatCurrency(lead.estimatedNetMonthly) },
                  ].map((item) => (
                    <div key={item.label} className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
                      <p className="font-mono-data text-sm font-bold text-foreground mt-0.5">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><Edit3 size={12} />Notes</h3>
                <p className="text-sm text-foreground whitespace-pre-wrap">{lead.notes || 'No notes yet.'}</p>
              </div>

              {/* Tags */}
              {lead.tags.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><Tag size={12} />Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {lead.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Danger zone */}
              <div className="bg-danger-bg border border-danger/20 rounded-xl p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-danger/70 mb-3">Danger Zone</h3>
                <button onClick={() => onDelete(lead.id)}
                  className="flex items-center gap-2 text-sm text-danger hover:text-danger/80 font-medium transition-colors">
                  <Trash2 size={14} />Delete this lead permanently
                </button>
              </div>
            </div>
          )}

          {/* ── HISTORY ── */}
          {activeTab === 'history' && (
            <div className="p-6 space-y-5">
              {/* Log new contact */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Plus size={12} />Log Contact</h3>
                <div className="flex gap-2">
                  {(['note', 'email', 'call', 'text'] as const).map((t) => (
                    <button key={t} onClick={() => setLogType(t)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${logType === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                      {typeIcons[t]}{t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
                {logType !== 'note' && (
                  <input value={logSubject} onChange={(e) => setLogSubject(e.target.value)}
                    placeholder="Subject / topic"
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                )}
                <textarea value={logBody} onChange={(e) => setLogBody(e.target.value)}
                  placeholder={logType === 'note' ? 'Add a note...' : 'Summary of the interaction...'}
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                <div className="flex gap-2">
                  <input value={logOutcome} onChange={(e) => setLogOutcome(e.target.value)}
                    placeholder="Outcome (e.g. 'Interested, call back Friday')"
                    className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                  <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)}
                    className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <button onClick={saveContactLog} disabled={savingLog || !logBody.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all">
                  <Send size={13} />{savingLog ? 'Saving...' : 'Save Log Entry'}
                </button>
              </div>

              {/* History timeline */}
              {loadingHistory ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : history.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No contact history yet. Log your first interaction above.</div>
              ) : (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div key={entry.id} className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`p-1.5 rounded-md ${typeColors[entry.type]}`}>{typeIcons[entry.type]}</span>
                          <div>
                            <p className="text-xs font-semibold text-foreground capitalize">{entry.type}{entry.subject ? ` — ${entry.subject}` : ''}</p>
                            <p className="text-[10px] text-muted-foreground">{entry.contacted_at}</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{entry.body}</p>
                      {entry.outcome && (
                        <p className="text-xs text-muted-foreground mt-2 bg-muted/40 rounded px-2 py-1">
                          <span className="font-medium">Outcome:</span> {entry.outcome}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TEMPLATES ── */}
          {activeTab === 'templates' && (
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground">Click a template to preview it filled with this lead's data. Copy and send via your email client.</p>
              {templates.map((tpl) => (
                <div key={tpl.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button onClick={() => setPreviewTemplate(previewTemplate?.id === tpl.id ? null : tpl)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-2 text-left">
                      <Mail size={13} className="text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{tpl.category.replace('_', ' ')}</p>
                      </div>
                    </div>
                    <ChevronDown size={14} className={`text-muted-foreground transition-transform ${previewTemplate?.id === tpl.id ? 'rotate-180' : ''}`} />
                  </button>
                  {previewTemplate?.id === tpl.id && (
                    <div className="border-t border-border px-4 py-4 space-y-3 bg-muted/20">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Subject</p>
                        <p className="text-sm font-medium text-foreground bg-background border border-border rounded px-3 py-2">{fillSubject(tpl.subject, lead)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Body</p>
                        <pre className="text-sm text-foreground bg-background border border-border rounded px-3 py-2 whitespace-pre-wrap font-sans">{fillTemplate(tpl.body, lead)}</pre>
                      </div>
                      <button onClick={() => {
                        navigator.clipboard.writeText(`Subject: ${fillSubject(tpl.subject, lead)}\n\n${fillTemplate(tpl.body, lead)}`);
                      }} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all">
                        <FileText size={12} />Copy to Clipboard
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── CADENCE ── */}
          {activeTab === 'cadence' && (
            <div className="p-6 space-y-5">
              {/* Add step */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Plus size={12} />Schedule Outreach Step</h3>
                <div className="flex gap-2 flex-wrap">
                  {['email', 'call', 'text'].map((ch) => (
                    <button key={ch} onClick={() => setCadenceChannel(ch)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${cadenceChannel === ch ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                      {ch === 'email' ? <Mail size={12} /> : ch === 'call' ? <Phone size={12} /> : <MessageSquare size={12} />}
                      {ch.charAt(0).toUpperCase() + ch.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="date" value={cadenceDate} onChange={(e) => setCadenceDate(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                  <button onClick={saveCadenceStep} disabled={savingCadence || !cadenceDate}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all">
                    <Plus size={13} />{savingCadence ? 'Adding...' : 'Add Step'}
                  </button>
                </div>
              </div>

              {/* Cadence steps */}
              {cadences.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No outreach steps scheduled. Add your first step above.</div>
              ) : (
                <div className="space-y-2">
                  {cadences.map((step) => (
                    <div key={step.id} className={`bg-card border rounded-xl p-4 flex items-center gap-3 ${step.status === 'sent' ? 'border-success/30 bg-success/5' : step.status === 'skipped' ? 'border-border opacity-50' : 'border-border'}`}>
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-muted-foreground">{step.step_number}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground capitalize">{step.channel} outreach</p>
                        <p className="text-[10px] text-muted-foreground">{step.scheduled_at}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {step.status === 'pending' && (
                          <>
                            <button onClick={() => updateCadenceStatus(step.id, 'sent')}
                              className="px-2 py-1 text-[10px] font-medium bg-success/10 text-success rounded hover:bg-success/20 transition-colors">
                              Mark Sent
                            </button>
                            <button onClick={() => updateCadenceStatus(step.id, 'skipped')}
                              className="px-2 py-1 text-[10px] font-medium bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors">
                              Skip
                            </button>
                          </>
                        )}
                        {step.status === 'sent' && <span className="text-[10px] font-medium text-success flex items-center gap-1"><CheckCircle size={11} />Sent</span>}
                        {step.status === 'skipped' && <span className="text-[10px] text-muted-foreground">Skipped</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── REMINDERS ── */}
          {activeTab === 'reminders' && (
            <div className="p-6 space-y-5">
              {/* Add reminder */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Plus size={12} />Add Reminder</h3>
                <input value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)}
                  placeholder="e.g. Follow up if no reply by Friday"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                <div className="flex gap-2">
                  <input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                  <select value={reminderPriority} onChange={(e) => setReminderPriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <button onClick={saveReminder} disabled={savingReminder || !reminderTitle.trim() || !reminderDate}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all">
                    <Bell size={13} />{savingReminder ? 'Saving...' : 'Add'}
                  </button>
                </div>
              </div>

              {/* Reminders list */}
              {reminders.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No reminders set. Add one above to stay on top of this lead.</div>
              ) : (
                <div className="space-y-2">
                  {reminders.map((rem) => (
                    <div key={rem.id} className={`bg-card border rounded-xl p-4 flex items-center gap-3 ${rem.completed ? 'opacity-50' : ''} ${priorityColors[rem.priority]} border`}>
                      <button onClick={() => toggleReminder(rem)}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${rem.completed ? 'bg-success border-success' : 'border-current hover:bg-muted'}`}>
                        {rem.completed && <CheckCircle size={12} className="text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${rem.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{rem.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Due: {rem.due_date} · <span className="capitalize">{rem.priority} priority</span></p>
                      </div>
                      <button onClick={() => deleteReminder(rem.id)}
                        className="p-1 rounded text-muted-foreground hover:text-danger transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Signing Portal Modal */}
      {showSigningPortal && (
        <SigningPortal
          lead={lead}
          onClose={() => setShowSigningPortal(false)}
          onEnvelopeCreated={(sessionId, envelopeId) => {
            setShowSigningPortal(false);
            setSigningEnvelopeCreated({ sessionId, envelopeId });
            setActiveTab('signing');
          }}
        />
      )}

      {showPlatformMessage && (
        <PlatformMessageModal lead={lead} onClose={() => setShowPlatformMessage(false)} />
      )}

      {contractModalOpen && (
        <ContractDealModal
          leadId={lead.id}
          leadAddress={lead.address}
          onClose={() => setContractModalOpen(false)}
          onSaved={() => setContractModalOpen(false)}
        />
      )}
    </div>
  );
}
