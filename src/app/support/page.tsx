'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MessageSquare, Bug, Lightbulb, HelpCircle, Mail, ExternalLink, CheckCircle, Loader2, AlertCircle, ChevronDown, Ticket, Clock, RefreshCw, Hash, CheckCircle2, Circle,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type FeedbackCategory = 'bug' | 'suggestion' | 'question' | 'other';
type TicketStatus = 'open' | 'in_progress' | 'resolved';

interface SupportTicket {
  id: string;
  ticket_number: string;
  category: FeedbackCategory;
  related_page: string;
  subject: string;
  message: string;
  ticket_status: TicketStatus;
  created_at: string;
  updated_at: string;
}

const PAGE_OPTIONS = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'lead-management', label: 'Lead Management' },
  { value: 'pipeline', label: 'Pipeline Board' },
  { value: 'data-sync', label: 'Data Sync' },
  { value: 'sync-health', label: 'Sync Health' },
  { value: 'source-intelligence', label: 'Source Intelligence' },
  { value: 'lead-sources', label: 'Lead Sources' },
  { value: 'property-screening', label: 'Property Screening' },
  { value: 'questionnaires', label: 'Questionnaires' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'campaign-analytics', label: 'Campaign Analytics' },
  { value: 'sms-delivery', label: 'SMS Delivery' },
  { value: 'csv-export', label: 'CSV Export' },
  { value: 'alert-hub', label: 'Alert Hub' },
  { value: 'retry-queue', label: 'Retry Queue' },
  { value: 'follow-up-sequences', label: 'Follow-Up Sequences' },
  { value: 'email-templates', label: 'Email Templates' },
  { value: 'scoring-rules', label: 'Scoring Rules' },
  { value: 'team-performance', label: 'Team Performance' },
  { value: 'settings', label: 'Settings' },
  { value: 'executive-overview', label: 'Executive Overview' },
  { value: 'other', label: 'Other / General' },
];

const CATEGORY_CONFIG: Record<FeedbackCategory, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  bug: { label: 'Bug Report', icon: <Bug size={15} />, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30' },
  suggestion: { label: 'Feature Suggestion', icon: <Lightbulb size={15} />, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/30' },
  question: { label: 'Question', icon: <HelpCircle size={15} />, color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/30' },
  other: { label: 'Other', icon: <MessageSquare size={15} />, color: 'text-muted-foreground', bg: 'bg-muted border-border' },
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  open: { label: 'Open', icon: <Circle size={11} />, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  in_progress: { label: 'In Progress', icon: <Clock size={11} />, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  resolved: { label: 'Resolved', icon: <CheckCircle2 size={11} />, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SupportPage() {
  const supabase = createClient();
  const { user } = useAuth();

  const [activeView, setActiveView] = useState<'form' | 'history'>('form');
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [page, setPage] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{ ticket_number: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    setLoadingTickets(true);
    setTicketsError(null);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, ticket_number, category, related_page, subject, message, ticket_status, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTickets(data || []);
    } catch (e: unknown) {
      setTicketsError(e instanceof Error ? e.message : 'Failed to load tickets');
    } finally {
      setLoadingTickets(false);
    }
  }, [supabase, user]);

  useEffect(() => {
    if (activeView === 'history') loadTickets();
  }, [activeView, loadTickets]);

  // Real-time subscription for ticket status updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('support-tickets-user')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as SupportTicket;
          setTickets((prev) =>
            prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
          );
          const statusCfg = STATUS_CONFIG[updated.ticket_status];
          toast.info(`Ticket ${updated.ticket_number} status: ${statusCfg?.label || updated.ticket_status}`);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!subject.trim()) { setFormError('Please enter a subject.'); return; }
    if (!message.trim()) { setFormError('Please describe the issue or suggestion.'); return; }
    if (message.trim().length < 20) { setFormError('Please provide at least 20 characters of detail.'); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: user?.id ?? null,
          user_email: user?.email || '',
          category,
          related_page: page || '',
          subject: subject.trim(),
          message: message.trim(),
          ticket_status: 'open',
          ticket_number: '',
        })
        .select('ticket_number')
        .single();
      if (error) throw error;

      // Trigger email notification via API
      if (user?.email) {
        fetch('/api/support/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketNumber: data.ticket_number,
            userEmail: user.email,
            subject: subject.trim(),
            category,
            status: 'open',
            eventType: 'created',
          }),
        }).catch(() => {/* non-blocking */});
      }

      setSubmittedTicket(data);
      setSubmitted(true);
      toast.success(`Ticket ${data.ticket_number} submitted!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit feedback';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setCategory('bug');
    setPage('');
    setSubject('');
    setMessage('');
    setFormError(null);
    setSubmitted(false);
    setSubmittedTicket(null);
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Support &amp; Feedback</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Report bugs, suggest features, or ask questions — we read every submission.
            </p>
          </div>
          {/* View toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted border border-border">
            <button
              onClick={() => setActiveView('form')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeView === 'form' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare size={12} /> Submit
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeView === 'history' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Ticket size={12} /> My Tickets
              {tickets.length > 0 && (
                <span className="ml-1 text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                  {tickets.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeView === 'form' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Feedback Form — 2 cols */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <MessageSquare size={15} className="text-primary" />
                Submit Feedback
              </h2>

              {submitted && submittedTicket ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle size={28} className="text-emerald-500" />
                  </div>
                  <p className="text-base font-semibold text-foreground">Feedback received!</p>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/5 border border-primary/20">
                    <Hash size={14} className="text-primary" />
                    <span className="text-sm font-mono font-semibold text-primary">{submittedTicket.ticket_number}</span>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Your ticket has been logged. You&apos;ll receive email updates when the status changes.
                    Track it in <strong>My Tickets</strong>.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => { setActiveView('history'); loadTickets(); }}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-muted hover:bg-muted/80 transition-colors"
                    >
                      <Ticket size={13} /> View My Tickets
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Submit another
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Category */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2">Category</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(Object.keys(CATEGORY_CONFIG) as FeedbackCategory[]).map((cat) => {
                        const cfg = CATEGORY_CONFIG[cat];
                        const active = category === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setCategory(cat)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                              active ? `${cfg.bg} ${cfg.color}` : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {cfg.icon} {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Page */}
                  <div>
                    <label htmlFor="page-select" className="block text-xs font-medium text-muted-foreground mb-1">
                      Related Page <span className="text-muted-foreground/60">(optional)</span>
                    </label>
                    <div className="relative">
                      <select
                        id="page-select"
                        value={page}
                        onChange={(e) => setPage(e.target.value)}
                        className="w-full appearance-none px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-8"
                      >
                        <option value="">Select a page…</option>
                        {PAGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label htmlFor="subject" className="block text-xs font-medium text-muted-foreground mb-1">
                      Subject <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="subject"
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Brief description of the issue or suggestion"
                      maxLength={120}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  {/* Message */}
                  <div>
                    <label htmlFor="message" className="block text-xs font-medium text-muted-foreground mb-1">
                      Details <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      id="message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        category === 'bug' ?'Steps to reproduce, expected vs actual behavior, any error messages…'
                          : category === 'suggestion' ?'Describe the feature you\'d like and how it would help your workflow…' :'Describe your question or issue in detail…'
                      }
                      rows={5}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                    <p className="text-xs text-muted-foreground mt-1 text-right">{message.length} chars</p>
                  </div>

                  {formError && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs">
                      <AlertCircle size={13} /> {formError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                    {submitting ? 'Submitting…' : 'Submit Feedback'}
                  </button>
                </form>
              )}
            </div>

            {/* Right panel */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <HelpCircle size={14} className="text-blue-500" />
                  Help &amp; Documentation
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Browse guides, FAQs, and how-to articles for TRAVLR Prospect Finder.
                </p>
                <a
                  href="https://docs.travlr.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                >
                  <ExternalLink size={12} /> Open Help Docs
                </a>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Mail size={14} className="text-emerald-500" />
                  Email Support
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  For urgent issues or account-level questions, reach our support team directly.
                </p>
                <a
                  href="mailto:support@travlr.com"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                >
                  <Mail size={12} /> support@travlr.com
                </a>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Lightbulb size={14} className="text-amber-500" />
                  Tips for faster resolution
                </h3>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    Select the related page so we can reproduce quickly
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    For bugs, include steps to reproduce and any error messages
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    For feature requests, describe the workflow problem it solves
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          /* ── My Tickets History ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Ticket size={14} className="text-primary" />
                My Submission History
              </h2>
              <button
                onClick={loadTickets}
                disabled={loadingTickets}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
              >
                {loadingTickets ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Refresh
              </button>
            </div>

            {ticketsError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs">
                <AlertCircle size={13} /> {ticketsError}
              </div>
            )}

            {loadingTickets ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-16 text-center rounded-xl border border-border bg-card">
                <Ticket size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground">No tickets yet</p>
                <p className="text-xs text-muted-foreground mt-1">Submit feedback to create your first ticket.</p>
                <button
                  onClick={() => setActiveView('form')}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mx-auto"
                >
                  <MessageSquare size={13} /> Submit Feedback
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => {
                  const catCfg = CATEGORY_CONFIG[ticket.category];
                  const statusCfg = STATUS_CONFIG[ticket.ticket_status];
                  return (
                    <div key={ticket.id} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-mono font-semibold text-primary flex items-center gap-1">
                              <Hash size={10} /> {ticket.ticket_number}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusCfg.bg} ${statusCfg.color}`}>
                              {statusCfg.icon} {statusCfg.label}
                            </span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${catCfg.bg} ${catCfg.color}`}>
                              {catCfg.label}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-foreground truncate">{ticket.subject}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ticket.message}</p>
                          {ticket.related_page && (
                            <p className="text-[10px] text-muted-foreground/70 mt-1">
                              Page: {ticket.related_page}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">{timeAgo(ticket.created_at)}</p>
                          {ticket.updated_at !== ticket.created_at && (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              Updated {timeAgo(ticket.updated_at)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
