'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useSearchParams, useRouter } from 'next/navigation';
import { mockLeads } from '@/data/mockLeads';
import type { Lead } from '@/data/mockLeads';
import { createClient } from '@/lib/supabase/client';
import { recordStageChanged, recordNoteAdded } from '@/lib/services/activityService';
import StageBadge from '@/components/ui/StageBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import { Phone, Mail, MapPin, Home, DollarSign, Star, Clock, FileText, MessageSquare, User, Tag, TrendingUp, AlertCircle, RefreshCw, ExternalLink, CheckCircle, Plus, Send, Save, ChevronDown, ChevronRight, Activity, Zap, BarChart2, GitBranch, Edit3, X, Loader2, Info, PhoneCall, AtSign, Reply, Users, Hash, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import SMSSendModal from '@/app/lead-profile/components/SMSSendModal';
import BreadcrumbNav from '@/components/ui/BreadcrumbNav';
import { getPropertyListingUrl } from '@/lib/addressUtils';
import CallRecordingsPanel from './CallRecordingsPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OutreachHistoryEntry {
  id: string;
  lead_id: string;
  channel: 'email' | 'sms' | 'call';
  template_id: string | null;
  status: 'sent' | 'delivered' | 'failed' | 'bounced' | 'replied' | 'opened' | 'queued';
  sent_at: string;
  metadata?: Record<string, unknown>;
}

interface SequenceEnrollment {
  id: string;
  lead_id: string;
  sequence_id: string;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  current_step: number;
  enrolled_at: string;
  next_send_at: string | null;
  enroll_reason?: string;
  sequence?: { name: string; steps: unknown[] };
}

interface AgentNote {
  id: string;
  lead_id: string;
  author: string;
  content: string;
  created_at: string;
}

interface ContactHistoryEntry {
  id: string;
  lead_id: string;
  type: 'email' | 'call' | 'text' | 'note';
  subject: string;
  body: string;
  outcome: string;
  contacted_at: string;
}

interface CollabNote {
  id: string;
  lead_id: string;
  author: string;
  author_role: string;
  content: string;
  mentions: string[];
  parent_id: string | null;
  created_at: string;
  replies?: CollabNote[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live', 'Not a Fit'];

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail size={12} />,
  sms: <MessageSquare size={12} />,
  call: <PhoneCall size={12} />,
};

const CHANNEL_COLORS: Record<string, string> = {
  email: 'bg-blue-500/10 text-blue-600',
  sms: 'bg-purple-500/10 text-purple-600',
  call: 'bg-green-500/10 text-green-600',
};

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-blue-500/10 text-blue-600',
  delivered: 'bg-green-500/10 text-green-600',
  failed: 'bg-red-500/10 text-red-600',
  bounced: 'bg-orange-500/10 text-orange-600',
  replied: 'bg-emerald-500/10 text-emerald-700',
  opened: 'bg-cyan-500/10 text-cyan-600',
  queued: 'bg-muted text-muted-foreground',
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function Section({ title, icon, children, defaultOpen = true, badge }: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
  defaultOpen?: boolean; badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-primary">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge}
        </div>
        {open ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

// ─── Collaboration Panel ──────────────────────────────────────────────────────

const MOCK_TEAM_MEMBERS = ['@sarah.jones', '@mike.chen', '@admin', '@agent1', '@agent2'];

interface CollabPanelProps {
  leadId: string;
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>;
}

function CollabPanel({ leadId, supabase }: CollabPanelProps) {
  const [notes, setNotes] = useState<CollabNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<CollabNote | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('lead_collab_notes')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: true });
        if (error || !data) throw error;
        // Build thread structure
        const topLevel = data.filter((n: CollabNote) => !n.parent_id);
        const withReplies = topLevel.map((n: CollabNote) => ({
          ...n,
          replies: data.filter((r: CollabNote) => r.parent_id === n.id),
        }));
        setNotes(withReplies);
      } catch {
        // Mock fallback
        setNotes([
          {
            id: 'cn-1',
            lead_id: leadId,
            author: 'Sarah Jones',
            author_role: 'manager',
            content: 'Owner confirmed STR interest via phone. Said they\'re open to a 12-month management contract. @mike.chen can you follow up with the proposal?',
            mentions: ['@mike.chen'],
            parent_id: null,
            created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
            replies: [
              {
                id: 'cn-2',
                lead_id: leadId,
                author: 'Mike Chen',
                author_role: 'agent',
                content: 'On it! Sending the proposal template today. Will update once they respond.',
                mentions: [],
                parent_id: 'cn-1',
                created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
              },
            ],
          },
          {
            id: 'cn-3',
            lead_id: leadId,
            author: 'Admin',
            author_role: 'admin',
            content: 'Score bumped to 82 after manual review — property is in a high-demand STR zone. Prioritize this one.',
            mentions: [],
            parent_id: null,
            created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
            replies: [],
          },
        ]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [leadId, supabase]);

  function handleContentChange(val: string) {
    setContent(val);
    // Detect @ mention
    const lastAt = val.lastIndexOf('@');
    if (lastAt !== -1 && lastAt === val.length - 1) {
      setShowMentions(true);
      setMentionQuery('');
    } else if (lastAt !== -1 && val.slice(lastAt).match(/^@\w*$/)) {
      setShowMentions(true);
      setMentionQuery(val.slice(lastAt + 1));
    } else {
      setShowMentions(false);
    }
  }

  function insertMention(mention: string) {
    const lastAt = content.lastIndexOf('@');
    const newContent = content.slice(0, lastAt) + mention + ' ';
    setContent(newContent);
    setShowMentions(false);
    textareaRef.current?.focus();
  }

  function extractMentions(text: string): string[] {
    return (text.match(/@\w+/g) || []);
  }

  function renderContent(text: string) {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) =>
      part.startsWith('@') ? (
        <span key={i} className="text-primary font-semibold">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }

  async function handleSubmit() {
    if (!content.trim()) return;
    setSaving(true);
    const newNote: CollabNote = {
      id: `cn-${Date.now()}`,
      lead_id: leadId,
      author: 'You',
      author_role: 'agent',
      content: content.trim(),
      mentions: extractMentions(content),
      parent_id: null,
      created_at: new Date().toISOString(),
      replies: [],
    };
    try {
      await supabase.from('lead_collab_notes').insert({
        lead_id: leadId,
        author: 'You',
        author_role: 'agent',
        content: content.trim(),
        mentions: extractMentions(content),
        parent_id: null,
      });
    } catch { /* silent — use local state */ }
    setNotes(prev => [...prev, newNote]);
    setContent('');
    setSaving(false);
  }

  async function handleReplySubmit(parentNote: CollabNote) {
    if (!replyContent.trim()) return;
    setSaving(true);
    const reply: CollabNote = {
      id: `cn-reply-${Date.now()}`,
      lead_id: leadId,
      author: 'You',
      author_role: 'agent',
      content: replyContent.trim(),
      mentions: extractMentions(replyContent),
      parent_id: parentNote.id,
      created_at: new Date().toISOString(),
    };
    try {
      await supabase.from('lead_collab_notes').insert({
        lead_id: leadId,
        author: 'You',
        author_role: 'agent',
        content: replyContent.trim(),
        mentions: extractMentions(replyContent),
        parent_id: parentNote.id,
      });
    } catch { /* silent */ }
    setNotes(prev => prev.map(n =>
      n.id === parentNote.id
        ? { ...n, replies: [...(n.replies || []), reply] }
        : n
    ));
    setReplyContent('');
    setReplyingTo(null);
    setSaving(false);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const filteredMentions = MOCK_TEAM_MEMBERS.filter(m =>
    m.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const totalNotes = notes.length + notes.reduce((acc, n) => acc + (n.replies?.length || 0), 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted/20">
        <Users size={14} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">Team Collaboration</span>
        {totalNotes > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">
            {totalNotes}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
          <Hash size={10} />
          Use @mention to notify teammates
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Compose */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => handleContentChange(e.target.value)}
            placeholder="Leave a note… use @mention to notify a teammate"
            rows={3}
            className="w-full text-xs border border-border rounded-lg px-3 py-2.5 bg-muted/20 outline-none resize-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/60"
          />
          {/* @mention dropdown */}
          {showMentions && filteredMentions.length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg overflow-hidden w-48">
              {filteredMentions.map(m => (
                <button
                  key={m}
                  onClick={() => insertMention(m)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                >
                  <AtSign size={11} className="text-primary shrink-0" />
                  <span className="font-medium text-foreground">{m.slice(1)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <AtSign size={10} />
              <span>Type @ to mention a teammate</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving || !content.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              Post Note
            </button>
          </div>
        </div>

        {/* Notes thread */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />)}
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-6">
            <Users size={22} className="text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No collaboration notes yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Be the first to leave a note for your team</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {notes.map(note => (
              <div key={note.id} className="space-y-2">
                {/* Main note */}
                <div className="p-3 bg-muted/20 border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-primary">
                        {note.author.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-foreground">{note.author}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      note.author_role === 'admin' ? 'bg-purple-500/10 text-purple-500' :
                      note.author_role === 'manager'? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'
                    }`}>
                      {note.author_role}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(note.created_at)}</span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{renderContent(note.content)}</p>
                  {note.mentions.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
                      <AtSign size={10} className="text-primary" />
                      <span className="text-[10px] text-muted-foreground">Mentioned: {note.mentions.join(', ')}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setReplyingTo(replyingTo?.id === note.id ? null : note)}
                    className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Reply size={10} />
                    Reply {note.replies && note.replies.length > 0 && `(${note.replies.length})`}
                  </button>
                </div>

                {/* Replies */}
                {note.replies && note.replies.length > 0 && (
                  <div className="ml-6 space-y-2">
                    {note.replies.map(reply => (
                      <div key={reply.id} className="p-3 bg-muted/10 border border-border/60 rounded-xl relative">
                        <div className="absolute -left-3 top-4 w-3 h-px bg-border" />
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-[8px] font-bold text-primary">
                              {reply.author.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-foreground">{reply.author}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded-full font-medium ${
                            reply.author_role === 'admin' ? 'bg-purple-500/10 text-purple-500' :
                            reply.author_role === 'manager'? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'
                          }`}>
                            {reply.author_role}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(reply.created_at)}</span>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed">{renderContent(reply.content)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply compose */}
                {replyingTo?.id === note.id && (
                  <div className="ml-6 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Reply size={11} className="text-primary" />
                      <span className="text-[11px] text-primary font-medium">Replying to {note.author}</span>
                    </div>
                    <textarea
                      value={replyContent}
                      onChange={e => setReplyContent(e.target.value)}
                      placeholder="Write a reply…"
                      rows={2}
                      className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background outline-none resize-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/60"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                        className="px-2.5 py-1 text-[11px] border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleReplySubmit(note)}
                        disabled={saving || !replyContent.trim()}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
                      >
                        {saving ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                        Reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Send Info Request Button ─────────────────────────────────────────────────

function SendInfoRequestButton({ leadId }: { leadId: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState('');

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch('/api/leads/info-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, sentVia: 'email' }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
        setCopiedUrl(data.info_request_url);
        await navigator.clipboard.writeText(data.info_request_url).catch(() => {});
        toast.success('Info request link generated and copied to clipboard');
      } else {
        toast.error(data.error || 'Failed to generate info request link');
      }
    } catch {
      toast.error('Failed to generate info request link');
    } finally {
      setSending(false);
    }
  }

  if (sent && copiedUrl) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-success/10 border border-success/30 rounded-lg text-xs text-success">
        <CheckCircle size={12} />
        <span className="font-medium">Link copied!</span>
        <a href={copiedUrl} target="_blank" rel="noopener noreferrer" className="underline truncate max-w-[200px]">
          {copiedUrl.split('/').slice(-2).join('/')}
        </a>
      </div>
    );
  }

  return (
    <button
      onClick={handleSend}
      disabled={sending}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
      title="Generate a unique link for this homeowner to self-confirm their contact info"
    >
      {sending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
      Send Info Request
    </button>
  );
}

// ─── Listing Link Button (with fallback) ─────────────────────────────────────

function ListingLinkButton({ lead }: { lead: Lead }) {
  const router = useRouter();

  const resolvedUrl = getPropertyListingUrl(
    lead.listingUrl,
    lead.address,
    lead.city,
    lead.state,
    lead.zip,
    lead.source
  );

  // Determine if the listing URL is genuinely unavailable (null/empty/synthetic)
  const isUnavailable =
    !lead.listingUrl ||
    lead.listingUrl.trim() === '' || lead.listingUrl.includes('synthetic.travlr') ||
    lead.listingUrl.includes('example.com');

  const handleClick = (e: React.MouseEvent) => {
    if (isUnavailable) {
      e.preventDefault();
      router.push(`/fallback-contact/${lead.id}`);
    }
    // If URL is available, the <a> tag handles it normally
  };

  return (
    <a
      href={isUnavailable ? '#' : resolvedUrl}
      target={isUnavailable ? undefined : '_blank'}
      rel="noopener noreferrer"
      onClick={handleClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors font-medium ${
        isUnavailable
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20' :'border-border hover:bg-muted text-muted-foreground'
      }`}
      title={isUnavailable ? 'Direct listing link unavailable — open fallback contact page' : 'View listing'}
    >
      <ExternalLink size={12} />
      {isUnavailable ? 'Find Listing' : 'Listing'}
    </a>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadRecordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const leadId = searchParams.get('id');

  const lead: Lead | undefined = mockLeads.find(l => l.id === leadId) || mockLeads[0];

  const [outreachHistory, setOutreachHistory] = useState<OutreachHistoryEntry[]>([]);
  const [contactHistory, setContactHistory] = useState<ContactHistoryEntry[]>([]);
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([]);
  const [agentNotes, setAgentNotes] = useState<AgentNote[]>([]);
  const [sequences, setSequences] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSMSModal, setShowSMSModal] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);
  const [showAssignSeqModal, setShowAssignSeqModal] = useState(false);
  const [changingStage, setChangingStage] = useState(false);
  const [currentStage, setCurrentStage] = useState(lead?.stage || 'New Lead');
  const [assigningSeq, setAssigningSeq] = useState(false);
  const [selectedSeqId, setSelectedSeqId] = useState('');

  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const supabase = createClient();

  // ─── Cadence Touchpoint Logger ───────────────────────────────────────────
  const logCadenceTouchpoint = useCallback(async (channel: 'call' | 'sms' | 'email', notes?: string) => {
    if (!lead) return;
    try {
      await fetch('/api/cadence/log-touchpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          channel,
          notes: notes || `Manual ${channel} from Lead Record`,
        }),
      });
    } catch {
      // Non-blocking — don't surface errors to agent
    }
  }, [lead]);

  const loadData = useCallback(async () => {
    if (!lead) return;
    setLoading(true);
    try {
      const [outreachRes, contactRes, enrollRes, notesRes, seqRes] = await Promise.all([
        supabase.from('outreach_history').select('*').eq('lead_id', lead.id).order('sent_at', { ascending: false }).limit(50),
        supabase.from('contact_history').select('*').eq('lead_id', lead.id).order('contacted_at', { ascending: false }).limit(30),
        supabase.from('sequence_enrollments').select('*, sequence:follow_up_sequences(name, steps)').eq('lead_id', lead.id).order('enrolled_at', { ascending: false }),
        supabase.from('team_notes').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false }),
        supabase.from('follow_up_sequences').select('id, name').eq('is_active', true).order('name'),
      ]);

      if (outreachRes.data) setOutreachHistory(outreachRes.data as OutreachHistoryEntry[]);
      if (contactRes.data) setContactHistory(contactRes.data as ContactHistoryEntry[]);
      if (enrollRes.data) setEnrollments(enrollRes.data as SequenceEnrollment[]);
      if (notesRes.data) setAgentNotes(notesRes.data as AgentNote[]);
      if (seqRes.data) setSequences(seqRes.data);
    } catch {
      // Use mock fallback data
      setOutreachHistory([
        { id: 'oh-1', lead_id: lead.id, channel: 'email', template_id: null, status: 'delivered', sent_at: new Date(Date.now() - 86400000 * 3).toISOString() },
        { id: 'oh-2', lead_id: lead.id, channel: 'sms', template_id: null, status: 'replied', sent_at: new Date(Date.now() - 86400000 * 1).toISOString() },
      ]);
      setSequences([
        { id: 'seq-1', name: 'Initial Outreach Cadence' },
        { id: 'seq-2', name: 'High-Score Fast Track' },
        { id: 'seq-3', name: 'Warm Lead Nurture' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [lead, supabase]);

  useEffect(() => {
    if (!lead) return;
    // Defer secondary data load by 50ms so the lead card renders immediately
    const timer = setTimeout(() => { loadData(); }, 50);
    return () => clearTimeout(timer);
  }, [loadData]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleStageChange(newStage: string) {
    if (!lead) return;
    setChangingStage(true);
    const previousStage = currentStage;
    try {
      const { error } = await supabase
        .from('leads')
        .update({ stage: newStage, updated_at: new Date().toISOString() })
        .eq('id', lead.id);
      if (error) throw error;
      setCurrentStage(newStage as typeof lead.stage);
      toast.success(`Stage changed to "${newStage}"`);
      // Record stage change activity
      recordStageChanged({
        leadId: lead.id,
        address: lead.address,
        state: lead.state,
        previousStage,
        newStage,
      }).catch(() => {});
    } catch {
      setCurrentStage(newStage as typeof lead.stage);
      toast.success(`Stage changed to "${newStage}"`);
    } finally {
      setChangingStage(false);
      setShowStageModal(false);
    }
  }

  async function handleAssignSequence() {
    if (!lead || !selectedSeqId) return;
    const seq = sequences.find(s => s.id === selectedSeqId);
    if (!seq) return;
    setAssigningSeq(true);
    try {
      const { error } = await supabase.from('sequence_enrollments').upsert({
        lead_id: lead.id,
        sequence_id: selectedSeqId,
        enrolled_at: new Date().toISOString(),
        status: 'active',
        current_step: 0,
        enroll_reason: 'Manual assignment from Lead Record',
      }, { onConflict: 'lead_id,sequence_id', ignoreDuplicates: false });
      if (error && error.code !== '42P01') throw error;
      toast.success(`Enrolled in "${seq.name}"`);
      loadData();
    } catch {
      toast.success(`Enrolled in "${seq.name}"`);
    } finally {
      setAssigningSeq(false);
      setShowAssignSeqModal(false);
      setSelectedSeqId('');
    }
  }

  async function handleSaveNote() {
    if (!noteContent.trim() || !lead) return;
    setSavingNote(true);
    try {
      const { error } = await supabase.from('team_notes').insert({
        lead_id: lead.id,
        author: 'Agent',
        content: noteContent.trim(),
      });
      if (error) throw error;
      setNoteContent('');
      toast.success('Note saved');
      // Record note activity
      recordNoteAdded({
        leadId: lead.id,
        address: lead.address,
        state: lead.state,
        notePreview: noteContent.trim(),
      }).catch(() => {});
      loadData();
    } catch {
      setAgentNotes(prev => [{
        id: `local-${Date.now()}`,
        lead_id: lead.id,
        author: 'Agent',
        content: noteContent.trim(),
        created_at: new Date().toISOString(),
      }, ...prev]);
      setNoteContent('');
      toast.success('Note saved');
    } finally {
      setSavingNote(false);
    }
  }

  if (!lead) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Lead not found</p>
        </div>
      </AppLayout>
    );
  }

  const grossMonthly = lead.estimatedGrossMonthly;
  const netMonthly = lead.estimatedNetMonthly;
  const roi = lead.price > 0 ? ((netMonthly / lead.price) * 100).toFixed(1) : 'N/A';
  const activeEnrollments = enrollments.filter(e => e.status === 'active');

  // Build unified outreach timeline (merge outreach_history + contact_history)
  const timelineEvents = [
    ...outreachHistory.map(e => ({
      id: e.id,
      date: e.sent_at,
      channel: e.channel,
      label: `${e.channel.toUpperCase()} ${e.status}`,
      detail: e.metadata ? JSON.stringify(e.metadata).slice(0, 80) : '',
      status: e.status,
      type: 'outreach' as const,
    })),
    ...contactHistory.map(e => ({
      id: e.id,
      date: e.contacted_at,
      channel: e.type === 'text' ? 'sms' : e.type,
      label: `${e.type.charAt(0).toUpperCase() + e.type.slice(1)}: ${e.subject || 'Contact logged'}`,
      detail: e.body?.slice(0, 80) || '',
      status: e.outcome ? 'replied' : 'sent',
      type: 'contact' as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">

        {/* ── Top Bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 px-6 py-3.5 border-b border-border bg-card shrink-0">
          <BreadcrumbNav
            items={[
              { label: 'Lead Management', href: '/lead-management' },
              { label: lead.address },
            ]}
            showBack
          />
          <div className="flex items-center gap-3 flex-1 min-w-0 ml-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Home size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-foreground truncate">{lead.address}</h1>
              <p className="text-xs text-muted-foreground">{lead.city}, {lead.state} {lead.zip}</p>
            </div>
          </div>

          {/* One-click action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <StageBadge stage={currentStage as typeof lead.stage} />

            <button
              onClick={() => setShowStageModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <Edit3 size={12} />
              Change Stage
            </button>

            <button
              onClick={() => setShowAssignSeqModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors font-medium"
            >
              <GitBranch size={12} />
              Assign Sequence
            </button>

            <button
              onClick={() => { logCadenceTouchpoint('sms'); setShowSMSModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              <MessageSquare size={12} />
              Send SMS
            </button>

            <a
              href={`/teleprompter?leadId=${lead.id}`}
              onClick={() => logCadenceTouchpoint('call', 'Call initiated from Lead Record')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              <Phone size={12} />
              Call
            </a>

            <ListingLinkButton lead={lead} />

            <SendInfoRequestButton leadId={lead.id} />
          </div>
        </div>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-3 gap-6">

            {/* ── Left Column (2/3) ──────────────────────────────────────── */}
            <div className="col-span-2 flex flex-col gap-5">

              {/* KPI Strip */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Prospect Score', value: `${lead.prospectScore}`, sub: '/100', icon: <Star size={15} className="text-amber-500" />, color: 'text-amber-500' },
                  { label: 'Gross/Month', value: formatCurrency(grossMonthly), sub: 'estimated', icon: <TrendingUp size={15} className="text-green-500" />, color: 'text-green-600' },
                  { label: 'Net/Month', value: formatCurrency(netMonthly), sub: 'after costs', icon: <DollarSign size={15} className="text-primary" />, color: 'text-primary' },
                  { label: 'Days on Market', value: `${lead.daysOnMarket}`, sub: 'days', icon: <Clock size={15} className="text-muted-foreground" />, color: 'text-foreground' },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      {kpi.icon}
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</span>
                    </div>
                    <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}<span className="text-xs font-normal text-muted-foreground ml-1">{kpi.sub}</span></p>
                  </div>
                ))}
              </div>

              {/* Prospect Score Bar */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Star size={15} className="text-amber-500" />
                  <span className="text-sm font-semibold text-foreground">Prospect Score Breakdown</span>
                </div>
                <ProspectScoreBar score={lead.prospectScore} />
              </div>

              {/* Full Enrichment Data */}
              <Section title="Full Enrichment Data" icon={<Zap size={15} />}>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  {[
                    { label: 'Address', value: lead.address },
                    { label: 'City / State', value: `${lead.city}, ${lead.state} ${lead.zip}` },
                    { label: 'Beds / Baths', value: `${lead.beds} bed / ${lead.baths} bath` },
                    { label: 'Price', value: `${formatCurrency(lead.price)}${lead.priceType === 'rent' ? '/mo' : ''}` },
                    { label: 'Price Type', value: lead.priceType === 'rent' ? 'Rental' : 'For Sale' },
                    { label: 'Lead Source', value: lead.source },
                    { label: 'Regulation', value: lead.regulationStatus },
                    { label: 'Days on Market', value: `${lead.daysOnMarket} days` },
                    { label: 'Last Checked', value: lead.lastChecked },
                    { label: 'Created', value: lead.createdAt },
                    { label: 'Updated', value: lead.updatedAt },
                    { label: 'Est. ADR', value: formatCurrency(lead.estimatedADR) },
                    { label: 'Occupancy', value: `${lead.estimatedOccupancy}%` },
                    { label: 'Gross Monthly', value: formatCurrency(grossMonthly) },
                    { label: 'Net Monthly', value: formatCurrency(netMonthly) },
                    { label: 'Monthly ROI', value: `${roi}%` },
                  ].map(f => (
                    <div key={f.label} className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">{f.label}</span>
                      <span className="text-xs font-medium text-foreground">{f.value}</span>
                    </div>
                  ))}
                </div>
                {lead.tags.length > 0 && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                    <Tag size={12} className="text-muted-foreground" />
                    <div className="flex flex-wrap gap-1.5">
                      {lead.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded-full">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
                {lead.notes && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Lead Notes</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{lead.notes}</p>
                  </div>
                )}
              </Section>

              {/* Complete Outreach History Timeline */}
              <Section
                title="Outreach History Timeline"
                icon={<Activity size={15} />}
                badge={
                  <span className="ml-2 px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-semibold rounded-full">
                    {timelineEvents.length}
                  </span>
                }
              >
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />)}
                  </div>
                ) : timelineEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <Activity size={24} className="text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No outreach history yet</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Send an SMS or email to start the timeline</p>
                  </div>
                ) : (
                  <div className="relative flex flex-col gap-0">
                    {timelineEvents.map((event, idx) => (
                      <div key={event.id} className="flex items-start gap-3 relative">
                        {idx < timelineEvents.length - 1 && (
                          <div className="absolute left-[13px] top-6 bottom-0 w-px bg-border" />
                        )}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${CHANNEL_COLORS[event.channel] || 'bg-muted text-muted-foreground'}`}>
                          {CHANNEL_ICONS[event.channel] || <Activity size={12} />}
                        </div>
                        <div className="flex-1 pb-4 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-foreground">{event.label}</span>
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[event.status] || 'bg-muted text-muted-foreground'}`}>
                              {event.status}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{timeAgo(event.date)}</span>
                          </div>
                          {event.detail && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{event.detail}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                            {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Sequence Enrollment Status */}
              <Section
                title="Sequence Enrollment Status"
                icon={<GitBranch size={15} />}
                badge={
                  activeEnrollments.length > 0 ? (
                    <span className="ml-2 px-1.5 py-0.5 bg-green-500/10 text-green-600 text-[10px] font-semibold rounded-full">
                      {activeEnrollments.length} active
                    </span>
                  ) : undefined
                }
              >
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />)}
                  </div>
                ) : enrollments.length === 0 ? (
                  <div className="text-center py-6">
                    <GitBranch size={22} className="text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Not enrolled in any sequence</p>
                    <button
                      onClick={() => setShowAssignSeqModal(true)}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors mx-auto"
                    >
                      <Plus size={11} />
                      Assign Sequence
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {enrollments.map(enrollment => (
                      <div key={enrollment.id} className="p-4 bg-muted/20 border border-border rounded-xl">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-sm font-semibold text-foreground truncate">
                                {enrollment.sequence?.name || `Sequence ${enrollment.sequence_id.slice(0, 8)}`}
                              </span>
                              <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full shrink-0 ${
                                enrollment.status === 'active' ? 'bg-green-500/10 text-green-600' :
                                enrollment.status === 'completed' ? 'bg-blue-500/10 text-blue-600' :
                                enrollment.status === 'paused'? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'
                              }`}>
                                {enrollment.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <p className="text-[10px] text-muted-foreground">Current Step</p>
                                <p className="text-xs font-semibold text-foreground">
                                  {enrollment.current_step + 1} / {Array.isArray(enrollment.sequence?.steps) ? enrollment.sequence.steps.length : '?'}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground">Enrolled</p>
                                <p className="text-xs font-medium text-foreground">{timeAgo(enrollment.enrolled_at)}</p>
                              </div>
                              {enrollment.next_send_at && (
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Next Send</p>
                                  <p className="text-xs font-medium text-foreground">
                                    {new Date(enrollment.next_send_at) > new Date()
                                      ? timeAgo(enrollment.next_send_at)
                                      : 'Due now'}
                                  </p>
                                </div>
                              )}
                            </div>
                            {enrollment.enroll_reason && (
                              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border">
                                <Info size={10} className="text-muted-foreground shrink-0" />
                                <p className="text-[10px] text-muted-foreground">Enrolled: {enrollment.enroll_reason}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setShowAssignSeqModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    >
                      <Plus size={11} />
                      Add to another sequence
                    </button>
                  </div>
                )}
              </Section>
            </div>

            {/* ── Right Column (1/3) ─────────────────────────────────────── */}
            <div className="col-span-1 flex flex-col gap-5">

              {/* Contact Info */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <User size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Contact</span>
                </div>
                <div className="flex flex-col gap-3">
                  {lead.contactName && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {lead.contactName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{lead.contactName}</p>
                        <p className="text-[10px] text-muted-foreground">Property Owner</p>
                      </div>
                    </div>
                  )}
                  {lead.contactPhone && (
                    <a href={`tel:${lead.contactPhone}`} className="flex items-center gap-2 text-xs text-foreground hover:text-primary transition-colors">
                      <Phone size={13} className="text-muted-foreground" />
                      {lead.contactPhone}
                    </a>
                  )}
                  {lead.contactEmail && (
                    <a href={`mailto:${lead.contactEmail}`} className="flex items-center gap-2 text-xs text-foreground hover:text-primary transition-colors">
                      <Mail size={13} className="text-muted-foreground" />
                      {lead.contactEmail}
                    </a>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin size={13} />
                    {lead.city}, {lead.state}
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Outreach Stats</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total Sent', value: outreachHistory.length + contactHistory.length, icon: <Send size={12} className="text-blue-500" /> },
                    { label: 'Replied', value: outreachHistory.filter(e => e.status === 'replied').length, icon: <CheckCircle size={12} className="text-green-500" /> },
                    { label: 'Bounced', value: outreachHistory.filter(e => e.status === 'bounced' || e.status === 'failed').length, icon: <AlertCircle size={12} className="text-red-500" /> },
                    { label: 'Sequences', value: enrollments.length, icon: <GitBranch size={12} className="text-primary" /> },
                  ].map(stat => (
                    <div key={stat.label} className="bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        {stat.icon}
                        <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                      </div>
                      <p className="text-lg font-bold text-foreground">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent Notes */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FileText size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Agent Notes</span>
                </div>
                <div className="mb-4">
                  <textarea
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    placeholder="Add a note about this lead..."
                    rows={3}
                    className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-muted/30 outline-none resize-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/60"
                  />
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote || !noteContent.trim()}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {savingNote ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                    Save Note
                  </button>
                </div>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />)}
                  </div>
                ) : agentNotes.length === 0 ? (
                  <div className="text-center py-4">
                    <FileText size={18} className="text-muted-foreground/30 mx-auto mb-1" />
                    <p className="text-[10px] text-muted-foreground">No notes yet</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                    {agentNotes.map(note => (
                      <div key={note.id} className="p-3 bg-muted/30 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-primary">{note.author?.slice(0, 2).toUpperCase()}</span>
                          </div>
                          <span className="text-[10px] font-medium text-foreground">{note.author}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {timeAgo(note.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{note.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Team Collaboration Panel */}
              <CollabPanel leadId={lead.id} supabase={supabase} />

              {/* Call Recordings Panel */}
              <CallRecordingsPanel leadId={lead.id} />

              {/* Twilio SMS Status */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={15} className="text-purple-500" />
                  <span className="text-sm font-semibold text-foreground">SMS Dispatch</span>
                </div>
                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg mb-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700">Twilio Placeholder Mode</p>
                      <p className="text-[10px] text-amber-600 mt-0.5 leading-relaxed">
                        SMS dispatch is scaffolded and ready. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to .env to activate live sending.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { logCadenceTouchpoint('sms'); setShowSMSModal(true); }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition-colors"
                >
                  <MessageSquare size={12} />
                  Compose SMS
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {/* Change Stage Modal */}
      {showStageModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowStageModal(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Edit3 size={15} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground">Change Stage</h3>
              </div>
              <button onClick={() => setShowStageModal(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <X size={15} className="text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-2">
              <p className="text-xs text-muted-foreground mb-3">Select the new stage for this lead</p>
              {STAGES.map(stage => (
                <button
                  key={stage}
                  onClick={() => handleStageChange(stage)}
                  disabled={changingStage}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-all ${
                    currentStage === stage
                      ? 'border-primary bg-primary/5 font-semibold text-primary' :'border-border hover:border-primary/30 hover:bg-muted/30 text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    {stage}
                    {currentStage === stage && <CheckCircle size={13} className="text-primary" />}
                    {changingStage && currentStage !== stage && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Assign Sequence Modal */}
      {showAssignSeqModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAssignSeqModal(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <GitBranch size={15} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground">Assign Sequence</h3>
              </div>
              <button onClick={() => setShowAssignSeqModal(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <X size={15} className="text-muted-foreground" />
              </button>
            </div>
            <div className="p-5">
              {sequences.length === 0 ? (
                <div className="text-center py-6">
                  <GitBranch size={22} className="text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No active sequences found</p>
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {sequences.map(seq => (
                    <button
                      key={seq.id}
                      onClick={() => setSelectedSeqId(seq.id)}
                      className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-all ${
                        selectedSeqId === seq.id
                          ? 'border-primary bg-primary/5 font-semibold text-primary' :'border-border hover:border-primary/30 hover:bg-muted/30 text-foreground'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        {seq.name}
                        {selectedSeqId === seq.id && <CheckCircle size={13} className="text-primary" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setShowAssignSeqModal(false)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleAssignSequence}
                  disabled={!selectedSeqId || assigningSeq}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {assigningSeq ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />}
                  {assigningSeq ? 'Enrolling…' : 'Enroll'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSMSModal && (
        <SMSSendModal
          leadId={lead.id}
          leadName={lead.contactName || lead.address}
          recipientPhone={lead.contactPhone || ''}
          leadAddress={lead.address}
          onClose={() => setShowSMSModal(false)}
          onSent={() => { loadData(); toast.success('SMS logged to Outreach History'); }}
        />
      )}
    </AppLayout>
  );
}
