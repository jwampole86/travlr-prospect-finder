'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, PhoneOff, X, Minimize2, Delete, Clock, Star, StarOff, Mic, MicOff, Volume2, VolumeX, ChevronRight, Hash, RotateCcw, Search, Filter, Play, Loader2, Maximize2 } from 'lucide-react';
import {
  getFavorites, addFavorite, removeFavorite, isFavorite,
  placeOutboundCall, formatDuration, formatPhoneDisplay,
  type FavoriteContact,
} from '@/lib/services/twilioVoiceService';
import {
  callSessionService,
  type CallSession,
  type CallOutcome,
} from '@/lib/services/callSessionService';
import { activityService } from '@/lib/services/activityService';
import CallOutcomeModal from './CallOutcomeModal';
import ImmersiveCallView from './ImmersiveCallView';

// ─── Types ────────────────────────────────────────────────────────────────────

type DialerTab = 'keypad' | 'recent' | 'favorites';
type CallStatus = 'idle' | 'connecting' | 'in-call' | 'ended' | 'error';

interface FloatingDialerProps {
  onClose: () => void;
}

// ─── Keypad keys ──────────────────────────────────────────────────────────────

const KEYPAD_KEYS = [
  { digit: '1', sub: '' }, { digit: '2', sub: 'ABC' }, { digit: '3', sub: 'DEF' },
  { digit: '4', sub: 'GHI' }, { digit: '5', sub: 'JKL' }, { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' }, { digit: '8', sub: 'TUV' }, { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: '' }, { digit: '0', sub: '+' }, { digit: '#', sub: '' },
];

const OUTCOME_LABELS: Record<CallOutcome, { label: string; color: string }> = {
  interested: { label: 'Interested', color: 'text-emerald-600 bg-emerald-500/10' },
  callback: { label: 'Callback', color: 'text-blue-600 bg-blue-500/10' },
  not_interested: { label: 'Not Interested', color: 'text-red-500 bg-red-500/10' },
  voicemail: { label: 'Voicemail', color: 'text-amber-600 bg-amber-500/10' },
  no_answer: { label: 'No Answer', color: 'text-muted-foreground bg-muted' },
  other: { label: 'Other', color: 'text-purple-600 bg-purple-500/10' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FloatingDialer({ onClose }: FloatingDialerProps) {
  const router = useRouter();
  const [minimized, setMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<DialerTab>('keypad');
  const [dialInput, setDialInput] = useState('');
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callSid, setCallSid] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [recentSessions, setRecentSessions] = useState<CallSession[]>([]);
  const [favorites, setFavorites] = useState<FavoriteContact[]>([]);
  const [currentCallTo, setCurrentCallTo] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<CallOutcome | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  // Outcome modal
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [pendingCallInfo, setPendingCallInfo] = useState<{
    contactName?: string; address?: string; duration: number;
  } | null>(null);
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [currentLeadInfo, setCurrentLeadInfo] = useState<{
    contactName?: string; address?: string; phone?: string; leadId?: string; sessionId?: string;
  }>({});

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load recent sessions from Supabase
  const loadRecentSessions = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const sessions = await callSessionService.getRecent({
        search: searchQuery || undefined,
        outcome: filterOutcome || undefined,
        limit: 30,
      });
      setRecentSessions(sessions);
    } finally {
      setLoadingRecent(false);
    }
  }, [searchQuery, filterOutcome]);

  useEffect(() => {
    setFavorites(getFavorites());
    fetch('/api/twilio/status')
      .then(r => r.json())
      .then(d => setConfigured(d.ok === true))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'recent') {
      loadRecentSessions();
    }
  }, [activeTab, loadRecentSessions]);

  // Call timer
  useEffect(() => {
    if (callStatus === 'in-call') {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callStatus]);

  const handleKeyPress = useCallback((digit: string) => {
    setDialInput(prev => prev + digit);
  }, []);

  const handleBackspace = useCallback(() => {
    setDialInput(prev => prev.slice(0, -1));
  }, []);

  const handleCall = useCallback(async (to?: string, contactName?: string, address?: string, leadId?: string) => {
    const number = to || dialInput;
    if (!number.trim()) return;

    setCurrentCallTo(number);
    setCallStatus('connecting');

    // Create Supabase session
    const session = await callSessionService.create({
      phoneNumber: number,
      contactName: contactName || undefined,
      leadAddress: address || undefined,
      leadId: leadId || undefined,
    });
    if (session) setCurrentSessionId(session.id);

    const result = await placeOutboundCall({ to: number, leadId });

    if (result.error && result.status === 'error') {
      setCallStatus('error');
      if (session) await callSessionService.update(session.id, { isInProgress: false });
      setTimeout(() => setCallStatus('idle'), 3000);
      return;
    }

    if (result.callSid && session) {
      await callSessionService.update(session.id, { callSid: result.callSid });
    }
    setCallSid(result.callSid);
    setCurrentLeadInfo({
      contactName: contactName,
      address: address,
      phone: number,
      leadId: leadId,
      sessionId: session?.id,
    });

    if (!result.configured) {
      setTimeout(() => {
        setCallStatus('in-call');
        setTimeout(() => {
          setCallStatus('ended');
          setPendingCallInfo({ contactName, address, duration: 5 });
          setShowOutcomeModal(true);
        }, 5000);
      }, 1500);
    } else {
      setCallStatus('in-call');
    }
  }, [dialInput]);

  const handleHangUp = useCallback(() => {
    setCallStatus('ended');
    setPendingCallInfo({ duration: callDuration });
    setShowOutcomeModal(true);
  }, [callDuration]);

  const handleOutcomeSubmit = useCallback(async (outcome: CallOutcome, dispositionNotes: string) => {
    setSavingOutcome(true);
    try {
      const duration = pendingCallInfo?.duration ?? callDuration;

      if (currentSessionId) {
        await callSessionService.endSession(
          currentSessionId,
          duration,
          [],
          outcome,
          dispositionNotes
        );

        // Log to activity feed
        activityService.record({
          eventType: 'call_completed',
          description: `Call ended — ${OUTCOME_LABELS[outcome].label}`,
          detail: dispositionNotes || undefined,
          source: 'dialer',
          metadata: { sessionId: currentSessionId, outcome, duration },
        }).catch(() => {});

        // Trigger Claude summarization in background (non-blocking)
        callSessionService.generateSummary(currentSessionId, []).catch(() => {});
      }

      setShowOutcomeModal(false);
      setPendingCallInfo(null);
      setCurrentSessionId(null);
      setCurrentCallTo('');
      setCallSid(null);
      setTimeout(() => setCallStatus('idle'), 500);

      // Refresh recent if on that tab
      if (activeTab === 'recent') loadRecentSessions();
    } finally {
      setSavingOutcome(false);
    }
  }, [currentSessionId, pendingCallInfo, callDuration, activeTab, loadRecentSessions]);

  const handleOutcomeSkip = useCallback(async () => {
    if (currentSessionId) {
      await callSessionService.endSession(currentSessionId, pendingCallInfo?.duration ?? callDuration, []);
    }
    setShowOutcomeModal(false);
    setPendingCallInfo(null);
    setCurrentSessionId(null);
    setCurrentCallTo('');
    setCallSid(null);
    setTimeout(() => setCallStatus('idle'), 500);
    if (activeTab === 'recent') loadRecentSessions();
  }, [currentSessionId, pendingCallInfo, callDuration, activeTab, loadRecentSessions]);

  const handleResumeSession = useCallback((session: CallSession) => {
    // Navigate to teleprompter with session context
    const params = new URLSearchParams();
    if (session.phone_number) params.set('phone', session.phone_number);
    if (session.contact_name) params.set('contactName', session.contact_name);
    if (session.lead_address) params.set('address', session.lead_address);
    if (session.lead_id) params.set('leadId', session.lead_id);
    if (session.id) params.set('sessionId', session.id);
    router.push(`/teleprompter?${params.toString()}`);
  }, [router]);

  const handleOpenTeleprompter = useCallback((phone?: string, contactName?: string, address?: string) => {
    const params = new URLSearchParams();
    if (phone) params.set('phone', phone);
    if (contactName) params.set('contactName', contactName);
    if (address) params.set('address', address);
    router.push(`/teleprompter?${params.toString()}`);
  }, [router]);

  const toggleFavorite = useCallback((contact: { phone: string; contactName?: string; address?: string; leadId?: string }) => {
    if (isFavorite(contact.phone)) {
      const favs = getFavorites();
      const fav = favs.find(f => f.phone === contact.phone);
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({
        phone: contact.phone,
        contactName: contact.contactName || contact.phone,
        address: contact.address,
        leadId: contact.leadId,
      });
    }
    setFavorites(getFavorites());
  }, []);

  const isInCall = callStatus === 'in-call' || callStatus === 'connecting';

  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-[9999]">
        <button
          onClick={() => setMinimized(false)}
          className={`flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl text-white font-semibold text-sm transition-all ${
            isInCall ? 'bg-green-600 hover:bg-green-700 animate-pulse' : 'bg-gray-900 hover:bg-gray-800'
          }`}
        >
          <Phone size={16} />
          {isInCall ? <span>{formatDuration(callDuration)}</span> : <span>Dialer</span>}
        </button>
      </div>
    );
  }

  return (
    <>
      {showOutcomeModal && pendingCallInfo && (
        <CallOutcomeModal
          contactName={pendingCallInfo.contactName}
          address={pendingCallInfo.address}
          durationSeconds={pendingCallInfo.duration}
          onSubmit={handleOutcomeSubmit}
          onSkip={handleOutcomeSkip}
          isSubmitting={savingOutcome}
        />
      )}

      {immersiveOpen && isInCall && (
        <ImmersiveCallView
          leadInfo={{
            leadId: currentLeadInfo.leadId,
            contactName: currentLeadInfo.contactName,
            address: currentLeadInfo.address,
            phone: currentLeadInfo.phone,
            sessionId: currentLeadInfo.sessionId,
            baseScript: 'Initial outreach call to homeowner.',
            scriptId: 'initial_outreach',
          }}
          callDuration={callDuration}
          muted={muted}
          speakerOff={speakerOff}
          recording={recording}
          onMuteToggle={() => setMuted(m => !m)}
          onSpeakerToggle={() => setSpeakerOff(s => !s)}
          onRecordingToggle={() => setRecording(r => !r)}
          onHangUp={() => { setImmersiveOpen(false); handleHangUp(); }}
          onMinimize={() => setImmersiveOpen(false)}
          onClose={() => setImmersiveOpen(false)}
        />
      )}

      <div className="fixed bottom-6 right-6 z-[9999] w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
          <div className="flex items-center gap-2">
            <Phone size={15} />
            <span className="text-sm font-semibold">
              {isInCall ? (callStatus === 'connecting' ? 'Connecting…' : `In Call · ${formatDuration(callDuration)}`) : 'Dialer'}
            </span>
            {configured === false && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/30">
                Placeholder
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setMinimized(true)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" aria-label="Minimize dialer">
              <Minimize2 size={14} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" aria-label="Close dialer">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* In-call overlay */}
        {isInCall && (
          <div className="px-4 py-3 bg-green-950/80 border-b border-green-800/40">
            <p className="text-xs text-green-300 font-medium truncate">{formatPhoneDisplay(currentCallTo)}</p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setMuted(m => !m)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  muted ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {muted ? <MicOff size={12} /> : <Mic size={12} />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                onClick={() => setSpeakerOff(s => !s)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  speakerOff ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {speakerOff ? <VolumeX size={12} /> : <Volume2 size={12} />}
                Speaker
              </button>
              <button
                onClick={() => setImmersiveOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
                title="Expand to full-screen call view"
              >
                <Maximize2 size={12} />
                Expand
              </button>
              <button
                onClick={handleHangUp}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                <PhoneOff size={12} />
                End
              </button>
            </div>
          </div>
        )}

        {/* Ended state */}
        {callStatus === 'ended' && (
          <div className="px-4 py-3 bg-muted/50 border-b border-border text-center">
            <p className="text-xs text-muted-foreground font-medium">Call ended · {formatDuration(callDuration)}</p>
          </div>
        )}

        {/* Tabs */}
        {!isInCall && (
          <div className="flex border-b border-border bg-muted/30">
            {(['keypad', 'recent', 'favorites'] as DialerTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab ? 'text-primary border-b-2 border-primary bg-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'keypad' && <Hash size={11} />}
                {tab === 'recent' && <Clock size={11} />}
                {tab === 'favorites' && <Star size={11} />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Keypad tab */}
        {activeTab === 'keypad' && !isInCall && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3 px-2 py-2 bg-muted/40 rounded-xl border border-border min-h-[40px]">
              <span className="font-mono text-lg font-semibold text-foreground tracking-widest flex-1 text-center">
                {dialInput ? formatPhoneDisplay(dialInput) : <span className="text-muted-foreground text-sm font-normal">Enter number</span>}
              </span>
              {dialInput && (
                <button onClick={handleBackspace} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <Delete size={16} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {KEYPAD_KEYS.map(({ digit, sub }) => (
                <button
                  key={digit}
                  onClick={() => handleKeyPress(digit)}
                  className="flex flex-col items-center justify-center py-3 rounded-xl bg-muted/40 hover:bg-muted border border-border transition-colors active:scale-95"
                >
                  <span className="text-base font-semibold text-foreground leading-none">{digit}</span>
                  {sub && <span className="text-[9px] text-muted-foreground mt-0.5 tracking-widest">{sub}</span>}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleCall()}
              disabled={!dialInput.trim()}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Phone size={16} />
              Call
            </button>
            {dialInput && (
              <button
                onClick={() => handleOpenTeleprompter(dialInput)}
                className="w-full mt-2 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex items-center justify-center gap-1.5"
              >
                Open Teleprompter for this number
                <ChevronRight size={12} />
              </button>
            )}
          </div>
        )}

        {/* Recent calls tab */}
        {activeTab === 'recent' && !isInCall && (
          <div className="flex flex-col">
            {/* Search + filter bar */}
            <div className="px-3 py-2 border-b border-border bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/40 border border-border rounded-lg">
                  <Search size={11} className="text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search name, address, phone…"
                    className="flex-1 text-[11px] bg-transparent outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <button
                  onClick={() => setShowFilters(f => !f)}
                  className={`p-1.5 rounded-lg border transition-colors ${showFilters ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
                >
                  <Filter size={11} />
                </button>
              </div>
              {showFilters && (
                <select
                  value={filterOutcome}
                  onChange={e => setFilterOutcome(e.target.value as CallOutcome | '')}
                  className="w-full text-[11px] px-2 py-1.5 bg-muted/40 border border-border rounded-lg outline-none"
                >
                  <option value="">All outcomes</option>
                  {Object.entries(OUTCOME_LABELS).map(([val, outcomeInfo]) => (
                    <option key={val} value={val}>{outcomeInfo.label}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex-1 overflow-y-auto max-h-64">
              {loadingRecent ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              ) : recentSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Clock size={28} className="mb-2 opacity-30" />
                  <p className="text-xs">No recent calls</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentSessions.map(session => (
                    <div key={session.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-medium text-foreground truncate">
                            {session.contact_name || formatPhoneDisplay(session.phone_number || '')}
                          </p>
                          {session.call_outcome && (
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${OUTCOME_LABELS[session.call_outcome].color}`}>
                              {OUTCOME_LABELS[session.call_outcome].label}
                            </span>
                          )}
                          {session.is_in_progress && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 animate-pulse">
                              In Progress
                            </span>
                          )}
                        </div>
                        {session.lead_address && (
                          <p className="text-[11px] text-muted-foreground truncate">{session.lead_address}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {session.duration_seconds ? formatDuration(session.duration_seconds) : '—'} ·{' '}
                          {new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        {session.call_summary?.summary_text && (
                          <p className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-1 italic">
                            {session.call_summary.summary_text}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {session.is_in_progress && (
                          <button
                            onClick={() => handleResumeSession(session)}
                            className="p-1.5 rounded-lg bg-green-600/10 hover:bg-green-600/20 text-green-600 transition-colors"
                            title="Resume call"
                          >
                            <Play size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => toggleFavorite({
                            phone: session.phone_number || '',
                            contactName: session.contact_name || undefined,
                            address: session.lead_address || undefined,
                            leadId: session.lead_id || undefined,
                          })}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-amber-500 transition-colors"
                          title="Add to favorites"
                        >
                          {isFavorite(session.phone_number || '') ? (
                            <Star size={13} className="text-amber-500 fill-amber-500" />
                          ) : (
                            <Star size={13} />
                          )}
                        </button>
                        <button
                          onClick={() => handleCall(session.phone_number || '', session.contact_name || undefined, session.lead_address || undefined, session.lead_id || undefined)}
                          className="p-1.5 rounded-lg bg-green-600/10 hover:bg-green-600/20 text-green-600 transition-colors"
                          title="Call back"
                        >
                          <RotateCcw size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Favorites tab */}
        {activeTab === 'favorites' && !isInCall && (
          <div className="flex-1 overflow-y-auto max-h-72">
            {favorites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Star size={28} className="mb-2 opacity-30" />
                <p className="text-xs">No favorites yet</p>
                <p className="text-[11px] mt-1 text-center px-4">Star contacts from Recent Calls to add them here</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {favorites.map(fav => (
                  <div key={fav.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Star size={14} className="text-amber-500 fill-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{fav.contactName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{formatPhoneDisplay(fav.phone)}</p>
                      {fav.address && <p className="text-[10px] text-muted-foreground truncate">{fav.address}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenTeleprompter(fav.phone, fav.contactName, fav.address)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                        title="Open teleprompter"
                      >
                        <ChevronRight size={13} />
                      </button>
                      <button
                        onClick={() => { removeFavorite(fav.id); setFavorites(getFavorites()); }}
                        className="p-1.5 rounded-lg hover:bg-muted text-amber-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove from favorites"
                      >
                        <StarOff size={13} />
                      </button>
                      <button
                        onClick={() => handleCall(fav.phone, fav.contactName, fav.address, fav.leadId)}
                        className="p-1.5 rounded-lg bg-green-600/10 hover:bg-green-600/20 text-green-600 transition-colors"
                        title="Call"
                      >
                        <Phone size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
