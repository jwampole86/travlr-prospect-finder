'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FileText, User, CheckCircle, Clock, Eye, Send, XCircle, AlertCircle, Download, RefreshCw, ChevronDown, ChevronUp, Shield, Loader2, Trash2 } from 'lucide-react';
import EmbeddedSigningModal from './EmbeddedSigningModal';
import type { SignerInfo } from '@/lib/services/docusignService';

interface SigningSigner {
  id: string;
  session_id: string;
  signer_order: number;
  signer_name: string;
  signer_email: string;
  client_user_id: string;
  recipient_id: string;
  signer_status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined' | 'voided';
  viewed_at?: string;
  signed_at?: string;
  declined_at?: string;
  decline_reason?: string;
}

interface SigningSession {
  id: string;
  lead_id: string;
  envelope_id?: string;
  session_status: 'draft' | 'sent' | 'voided' | 'completed' | 'declined' | 'expired';
  prefill_data?: Record<string, string>;
  signed_pdf_url?: string;
  certificate_url?: string;
  docusign_completed_at?: string;
  voided_at?: string;
  voided_reason?: string;
  resend_count?: number;
  agent_notes?: string;
  created_at: string;
  signing_signers: SigningSigner[];
}

interface SigningStatusPanelProps {
  leadId: string;
  isAgentView?: boolean;
  onInitiateSigning?: () => void;
}

const SESSION_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'text-muted-foreground bg-muted', icon: <FileText size={11} /> },
  sent: { label: 'Sent', color: 'text-blue-600 bg-blue-500/10', icon: <Send size={11} /> },
  voided: { label: 'Voided', color: 'text-red-500 bg-red-500/10', icon: <XCircle size={11} /> },
  completed: { label: 'Signed', color: 'text-emerald-600 bg-emerald-500/10', icon: <CheckCircle size={11} /> },
  declined: { label: 'Declined', color: 'text-amber-600 bg-amber-500/10', icon: <AlertCircle size={11} /> },
  expired: { label: 'Expired', color: 'text-muted-foreground bg-muted', icon: <Clock size={11} /> },
};

const SIGNER_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'text-muted-foreground', icon: <Clock size={11} /> },
  sent: { label: 'Sent', color: 'text-blue-500', icon: <Send size={11} /> },
  viewed: { label: 'Viewed', color: 'text-amber-500', icon: <Eye size={11} /> },
  signed: { label: 'Signed', color: 'text-emerald-600', icon: <CheckCircle size={11} /> },
  declined: { label: 'Declined', color: 'text-red-500', icon: <XCircle size={11} /> },
  voided: { label: 'Voided', color: 'text-muted-foreground', icon: <XCircle size={11} /> },
};

export default function SigningStatusPanel({
  leadId,
  isAgentView = false,
  onInitiateSigning,
}: SigningStatusPanelProps) {
  const [sessions, setSessions] = useState<SigningSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [voidModal, setVoidModal] = useState<{ sessionId: string; envelopeId: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [signingModal, setSigningModal] = useState<{
    envelopeId: string;
    signer: SignerInfo;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/docusign/sessions?leadId=${encodeURIComponent(leadId)}`);
      const data = await res.json() as { sessions?: SigningSession[]; error?: string };
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function handleVoid() {
    if (!voidModal || !voidReason.trim()) return;
    setVoidLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/docusign/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...voidModal, reason: voidReason }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to void');
      setVoidModal(null);
      setVoidReason('');
      fetchSessions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setVoidLoading(false);
    }
  }

  function openSigningForSigner(session: SigningSession, signer: SigningSigner) {
    if (!session.envelope_id) return;
    setSigningModal({
      envelopeId: session.envelope_id,
      signer: {
        name: signer.signer_name,
        email: signer.signer_email,
        clientUserId: signer.client_user_id,
        recipientId: signer.recipient_id,
        order: signer.signer_order,
      },
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Partnership Agreement</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchSessions} className="p-1.5 rounded-lg hover:bg-muted transition-all">
            <RefreshCw size={13} className="text-muted-foreground" />
          </button>
          {isAgentView && onInitiateSigning && (
            <button
              onClick={onInitiateSigning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-all"
            >
              <Send size={12} />
              Initiate Signing
            </button>
          )}
        </div>
      </div>

      {/* No sessions */}
      {sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
            <FileText size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No signing sessions yet</p>
          <p className="text-xs text-muted-foreground">
            {isAgentView
              ? 'Initiate a signing session once deal terms are finalized.' :'Your agent will send the agreement for signing once terms are finalized.'}
          </p>
        </div>
      )}

      {/* Sessions list */}
      {sessions.map((session) => {
        const statusCfg = SESSION_STATUS_CONFIG[session.session_status] ?? SESSION_STATUS_CONFIG.draft;
        const isExpanded = expandedSession === session.id;
        const allSigned = session.signing_signers.every(s => s.signer_status === 'signed');
        const canVoid = isAgentView && ['sent', 'draft'].includes(session.session_status);

        return (
          <div key={session.id} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Session header */}
            <button
              onClick={() => setExpandedSession(isExpanded ? null : session.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <FileText size={14} className="text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">TRAVLR Partnership Agreement</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {session.resend_count ? ` · Resent ${session.resend_count}×` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                  {statusCfg.icon}
                  {statusCfg.label}
                </span>
                {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
              </div>
            </button>

            {/* Expanded details */}
            {isExpanded && (
              <div className="border-t border-border px-4 py-3 space-y-3">
                {/* Per-signer status */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Signers</p>
                  {session.signing_signers.map((signer) => {
                    const signerCfg = SIGNER_STATUS_CONFIG[signer.signer_status] ?? SIGNER_STATUS_CONFIG.pending;
                    const canSign = !isAgentView && ['sent', 'viewed'].includes(signer.signer_status) && session.session_status === 'sent';

                    return (
                      <div key={signer.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <User size={12} className="text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{signer.signer_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{signer.signer_email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`flex items-center gap-1 text-xs font-medium ${signerCfg.color}`}>
                            {signerCfg.icon}
                            {signerCfg.label}
                          </span>
                          {signer.signed_at && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(signer.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {canSign && (
                            <button
                              onClick={() => openSigningForSigner(session, signer)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-all"
                            >
                              <FileText size={11} />
                              Sign Now
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Signed documents */}
                {session.session_status === 'completed' && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Documents</p>
                    <div className="flex items-center gap-2">
                      {session.signed_pdf_url && (
                        <a
                          href={session.signed_pdf_url}
                          download="TRAVLR_Partnership_Agreement_Signed.pdf"
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-lg hover:bg-muted transition-all"
                        >
                          <Download size={12} />
                          Signed Agreement
                        </a>
                      )}
                      {session.certificate_url && (
                        <a
                          href={session.certificate_url}
                          download="TRAVLR_Certificate_of_Completion.pdf"
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-lg hover:bg-muted transition-all"
                        >
                          <Shield size={12} />
                          Certificate
                        </a>
                      )}
                    </div>
                    {session.docusign_completed_at && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1">
                        <CheckCircle size={11} />
                        Completed {new Date(session.docusign_completed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                )}

                {/* Void info */}
                {session.session_status === 'voided' && session.voided_reason && (
                  <div className="flex items-start gap-2 p-2.5 bg-red-500/5 border border-red-500/15 rounded-lg">
                    <XCircle size={12} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-600">Voided: {session.voided_reason}</p>
                  </div>
                )}

                {/* Agent notes */}
                {session.agent_notes && (
                  <p className="text-xs text-muted-foreground italic">Note: {session.agent_notes}</p>
                )}

                {/* Agent actions */}
                {isAgentView && canVoid && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setVoidModal({ sessionId: session.id, envelopeId: session.envelope_id! })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger border border-danger/30 rounded-lg hover:bg-danger/5 transition-all"
                    >
                      <Trash2 size={12} />
                      Void Session
                    </button>
                  </div>
                )}

                {actionError && (
                  <p className="text-xs text-danger">{actionError}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Void confirmation modal */}
      {voidModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-danger/10 flex items-center justify-center">
                <XCircle size={18} className="text-danger" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Void Signing Session</p>
                <p className="text-xs text-muted-foreground">This cannot be undone. You can resend after voiding.</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">Reason for voiding *</label>
              <textarea
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                rows={3}
                placeholder="e.g. Terms changed, homeowner requested revision..."
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            {actionError && <p className="text-xs text-danger">{actionError}</p>}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { setVoidModal(null); setVoidReason(''); setActionError(null); }}
                className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleVoid}
                disabled={!voidReason.trim() || voidLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-danger text-white rounded-xl hover:bg-danger/90 transition-all disabled:opacity-50"
              >
                {voidLoading ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                Void Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded signing modal */}
      {signingModal && (
        <EmbeddedSigningModal
          envelopeId={signingModal.envelopeId}
          signer={signingModal.signer}
          onComplete={() => { setSigningModal(null); fetchSessions(); }}
          onDecline={() => { setSigningModal(null); fetchSessions(); }}
          onClose={() => setSigningModal(null)}
        />
      )}
    </div>
  );
}
