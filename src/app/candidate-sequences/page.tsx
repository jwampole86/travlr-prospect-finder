'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Mail, Send, CheckCircle, Clock, User, Briefcase, RefreshCw, Search, Filter, X, Copy, Eye, AlertTriangle, Users, Star, MessageSquare, ArrowRight, Check,  } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface CandidateProfile {
  id: string;
  candidate_name: string;
  role_id: string;
  role_title: string;
  interview_date: string;
  overall_score: 'strong_yes' | 'yes' | 'maybe' | 'no' | null;
  follow_up_status: 'pending' | 'scheduled' | 'completed' | 'rejected' | 'hired';
  notes: string;
  created_at: string;
}

type SequenceType = 'second_interview' | 'offer_pending' | 'rejection' | 'congratulations';

interface EmailSequence {
  type: SequenceType;
  subject: string;
  body: string;
}

interface SelectedCandidate {
  profile: CandidateProfile;
  sequence: EmailSequence | null;
  sent: boolean;
  sending: boolean;
}

// ─── Sequence Templates ───────────────────────────────────────────────────────

const SEQUENCE_CONFIGS: Record<SequenceType, { label: string; description: string; color: string; icon: React.ElementType; stages: CandidateProfile['follow_up_status'][] }> = {
  second_interview: {
    label: 'Second Interview Request',
    description: 'Invite promising candidates for a follow-up interview',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    icon: MessageSquare,
    stages: ['pending', 'scheduled'],
  },
  offer_pending: {
    label: 'Offer Pending',
    description: 'Notify candidates their offer is being prepared',
    color: 'bg-amber-50 border-amber-200 text-amber-700',
    icon: Clock,
    stages: ['scheduled', 'completed'],
  },
  rejection: {
    label: 'Rejection with Reapply CTA',
    description: 'Respectful rejection encouraging future applications',
    color: 'bg-red-50 border-red-200 text-red-700',
    icon: X,
    stages: ['rejected'],
  },
  congratulations: {
    label: 'Congratulations on Hire',
    description: 'Welcome email for newly hired candidates',
    color: 'bg-green-50 border-green-200 text-green-700',
    icon: Star,
    stages: ['hired'],
  },
};

function generateSequenceEmail(type: SequenceType, candidate: CandidateProfile): EmailSequence {
  const name = candidate.candidate_name.split(' ')[0] || candidate.candidate_name;
  const role = candidate.role_title;

  switch (type) {
    case 'second_interview':
      return {
        type,
        subject: `Next Steps — ${role} at TRAVLR`,
        body: `Hi ${name},

Thank you for taking the time to interview with us for the ${role} position. We were impressed by your background and would love to learn more about you.

We'd like to invite you for a second interview with our team. This will be an opportunity to dive deeper into your experience and discuss how you'd approach the role.

Please reply to this email with your availability over the next week, and we'll coordinate a time that works for everyone.

Looking forward to connecting again!

Warm regards,
Jennifer Wampole
Head of People Operations · TRAVLR Inc.`,
      };

    case 'offer_pending':
      return {
        type,
        subject: `Your TRAVLR Offer — ${role}`,
        body: `Hi ${name},

We're excited to share that we're preparing a formal offer for you for the ${role} position at TRAVLR!

Our team has been thoroughly impressed throughout the interview process, and we believe you'd be a fantastic addition to our team.

You can expect to receive the official offer letter within the next 1–2 business days. In the meantime, please don't hesitate to reach out if you have any questions about the role, compensation, or next steps.

We're really looking forward to having you on board!

Warm regards,
Jennifer Wampole
Head of People Operations · TRAVLR Inc.`,
      };

    case 'rejection':
      return {
        type,
        subject: `Your Application — ${role} at TRAVLR`,
        body: `Hi ${name},

Thank you so much for your time and interest in the ${role} position at TRAVLR. We genuinely enjoyed learning about your background and experience throughout our conversations.

After careful consideration, we've decided to move forward with another candidate whose experience more closely aligns with our current needs. This was a difficult decision — you made a strong impression on our team.

We'd love to stay in touch. TRAVLR is growing quickly, and we anticipate new openings in the coming months. We encourage you to keep an eye on our careers page and apply again when a role that fits your profile opens up.

Thank you again for considering TRAVLR, and we wish you all the best in your search.

Warm regards,
Jennifer Wampole
Head of People Operations · TRAVLR Inc.

P.S. — Visit our careers page to see future openings: travlr.com/careers`,
      };

    case 'congratulations':
      return {
        type,
        subject: `Welcome to TRAVLR, ${name}! 🎉`,
        body: `Hi ${name},

On behalf of the entire TRAVLR team — welcome aboard! We are absolutely thrilled to have you joining us as our new ${role}.

You've made a fantastic impression throughout the process, and we can't wait to see the impact you'll make. Here's what to expect next: • You'll receive your official onboarding documents within 24 hours
• Your manager will reach out to schedule your first-day orientation
• Our IT team will set up your accounts and equipment before your start date

If you have any questions before your first day, please don't hesitate to reach out. We're here to make your transition as smooth as possible.

Welcome to the family!

Warm regards,
Jennifer Wampole
Head of People Operations · TRAVLR Inc.`,
      };
  }
}

// ─── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: CandidateProfile['overall_score'] }) {
  if (!score) return <span className="text-xs text-gray-400 italic">Not rated</span>;
  const cfg: Record<string, string> = {
    strong_yes: 'bg-green-100 text-green-800 border-green-200',
    yes: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    maybe: 'bg-amber-100 text-amber-800 border-amber-200',
    no: 'bg-red-100 text-red-800 border-red-200',
  };
  const labels: Record<string, string> = { strong_yes: 'Strong Yes', yes: 'Yes', maybe: 'Maybe', no: 'No' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg[score]}`}>
      {labels[score]}
    </span>
  );
}

// ─── Email Preview Modal ──────────────────────────────────────────────────────

function EmailPreviewModal({ sequence, candidateName, onClose, onSend, sending }: {
  sequence: EmailSequence;
  candidateName: string;
  onClose: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`Subject: ${sequence.subject}\n\n${sequence.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">Email Preview — {candidateName}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 pb-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Subject</p>
            <p className="text-sm font-semibold text-gray-900">{sequence.subject}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Body</p>
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono text-xs">
              {sequence.body}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onSend}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending…' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CandidateSequencesPage() {
  const supabase = createClient();
  const [profiles, setProfiles] = useState<CandidateProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSequenceType, setActiveSequenceType] = useState<SequenceType>('second_interview');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [previewCandidate, setPreviewCandidate] = useState<CandidateProfile | null>(null);
  const [bulkSending, setBulkSending] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('candidate_profiles')
      .select('id,candidate_name,role_id,role_title,interview_date,overall_score,follow_up_status,notes,created_at')
      .order('created_at', { ascending: false });
    setProfiles((data || []) as CandidateProfile[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const config = SEQUENCE_CONFIGS[activeSequenceType];

  // Filter candidates by stage and search
  const filteredProfiles = profiles.filter(p => {
    const matchesStage = config.stages.includes(p.follow_up_status);
    const matchesSearch = !search || p.candidate_name.toLowerCase().includes(search.toLowerCase()) || p.role_title.toLowerCase().includes(search.toLowerCase());
    return matchesStage && matchesSearch;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProfiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProfiles.map(p => p.id)));
    }
  };

  const simulateSend = async (candidateId: string): Promise<boolean> => {
    // Simulate email send (in production, call an API route)
    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
    return true;
  };

  const handleSendIndividual = async (profile: CandidateProfile) => {
    setSendingIds(prev => new Set([...prev, profile.id]));
    setPreviewCandidate(null);
    try {
      const ok = await simulateSend(profile.id);
      if (ok) {
        setSentIds(prev => new Set([...prev, profile.id]));
        toast.success(`Email sent to ${profile.candidate_name}`);
      }
    } catch {
      toast.error(`Failed to send to ${profile.candidate_name}`);
    } finally {
      setSendingIds(prev => { const n = new Set(prev); n.delete(profile.id); return n; });
    }
  };

  const handleBulkSend = async () => {
    if (selectedIds.size === 0) { toast.error('Select at least one candidate'); return; }
    setBulkSending(true);
    let successCount = 0;
    for (const id of selectedIds) {
      const profile = profiles.find(p => p.id === id);
      if (!profile || sentIds.has(id)) continue;
      setSendingIds(prev => new Set([...prev, id]));
      try {
        const ok = await simulateSend(id);
        if (ok) { setSentIds(prev => new Set([...prev, id])); successCount++; }
      } catch { /* continue */ }
      setSendingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
    setBulkSending(false);
    setSelectedIds(new Set());
    toast.success(`Sent ${successCount} email${successCount !== 1 ? 's' : ''} successfully`);
  };

  const unsent = filteredProfiles.filter(p => !sentIds.has(p.id));
  const allSelected = filteredProfiles.length > 0 && selectedIds.size === filteredProfiles.length;

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Candidate Sequences</h1>
            <p className="text-sm text-gray-500 mt-0.5">Auto-generate and send templated follow-up emails by pipeline stage</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/candidate-profiles" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <Users className="w-4 h-4" /> Profiles
            </Link>
            <Link href="/hiring-analytics" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <Star className="w-4 h-4" /> Analytics
            </Link>
            <button onClick={fetchProfiles} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Sequence Type Selector */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {(Object.entries(SEQUENCE_CONFIGS) as [SequenceType, typeof SEQUENCE_CONFIGS[SequenceType]][]).map(([type, cfg]) => {
            const Icon = cfg.icon;
            const count = profiles.filter(p => cfg.stages.includes(p.follow_up_status)).length;
            const isActive = activeSequenceType === type;
            return (
              <button
                key={type}
                onClick={() => { setActiveSequenceType(type); setSelectedIds(new Set()); }}
                className={`text-left p-4 rounded-2xl border-2 transition-all ${
                  isActive ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {count}
                  </span>
                </div>
                <p className={`text-xs font-bold leading-tight ${isActive ? 'text-white' : 'text-gray-900'}`}>{cfg.label}</p>
                <p className={`text-[11px] mt-1 leading-tight ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>{cfg.description}</p>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search candidates…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkSend}
              disabled={bulkSending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              {bulkSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {bulkSending ? 'Sending…' : `Send to ${selectedIds.size} selected`}
            </button>
          )}
        </div>

        {/* Candidate List */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <RefreshCw className="w-8 h-8 text-gray-300 animate-spin" />
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-base font-semibold text-gray-700 mb-1">No candidates in this stage</p>
            <p className="text-sm text-gray-400 mb-4">
              Candidates with status <span className="font-semibold">{config.stages.join(' or ')}</span> will appear here.
            </p>
            <Link href="/candidate-profiles" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors">
              View all profiles <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Table header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <button
                onClick={toggleSelectAll}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  allSelected ? 'bg-gray-900 border-gray-900' : 'border-gray-300 hover:border-gray-500'
                }`}
              >
                {allSelected && <Check className="w-3 h-3 text-white" />}
              </button>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">
                {filteredProfiles.length} candidate{filteredProfiles.length !== 1 ? 's' : ''} · {config.label}
              </span>
              <span className="text-xs text-gray-400">{sentIds.size} sent this session</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {filteredProfiles.map(profile => {
                const isSelected = selectedIds.has(profile.id);
                const isSent = sentIds.has(profile.id);
                const isSending = sendingIds.has(profile.id);
                const sequence = generateSequenceEmail(activeSequenceType, profile);

                return (
                  <div
                    key={profile.id}
                    className={`flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50/40' : ''}`}
                  >
                    <button
                      onClick={() => !isSent && toggleSelect(profile.id)}
                      disabled={isSent}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSent ? 'bg-green-500 border-green-500 cursor-default' : isSelected ?'bg-gray-900 border-gray-900' : 'border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {(isSelected || isSent) && <Check className="w-3 h-3 text-white" />}
                    </button>

                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-gray-500" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{profile.candidate_name}</p>
                        <ScoreBadge score={profile.overall_score} />
                        {isSent && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" /> Sent
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                        <Briefcase className="w-3 h-3 flex-shrink-0" />
                        {profile.role_title}
                      </p>
                    </div>

                    {/* Email subject preview */}
                    <div className="hidden md:block flex-1 min-w-0 max-w-xs">
                      <p className="text-xs text-gray-500 truncate">{sequence.subject}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setPreviewCandidate(profile)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
                      </button>
                      <button
                        onClick={() => handleSendIndividual(profile)}
                        disabled={isSending || isSent}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          isSent ? 'bg-green-100 text-green-700 cursor-default' : 'bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60'
                        }`}
                      >
                        {isSending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> :
                         isSent ? <CheckCircle className="w-3.5 h-3.5" /> :
                         <Send className="w-3.5 h-3.5" />}
                        {isSending ? 'Sending…' : isSent ? 'Sent' : 'Send'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info banner */}
        <div className="mt-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-800">Email sending requires Resend configuration</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Connect your Resend API key and configure a sending domain to enable live email delivery. Preview and copy are always available.
            </p>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewCandidate && (
        <EmailPreviewModal
          sequence={generateSequenceEmail(activeSequenceType, previewCandidate)}
          candidateName={previewCandidate.candidate_name}
          onClose={() => setPreviewCandidate(null)}
          onSend={() => handleSendIndividual(previewCandidate)}
          sending={sendingIds.has(previewCandidate.id)}
        />
      )}
    </AppLayout>
  );
}
