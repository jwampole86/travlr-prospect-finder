'use client';

import React, { useState, useEffect } from 'react';
import HomeownerLayout from '../layout';
import { FileText, Download, CheckCircle, Plus, X, Send, Shield, Eye, Clock, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { SignerInfo } from '@/lib/services/docusignService';

// Lazy-load EmbeddedSigningModal — the DocuSign iframe should only be fetched
// when the homeowner actually opens the signing flow, not on every page load.
const EmbeddedSigningModal = dynamic(() => import('@/components/EmbeddedSigningModal'), {
  ssr: false,
  loading: () => null,
});


interface SigningSigner {
  id: string;
  signer_name: string;
  signer_email: string;
  client_user_id: string;
  recipient_id: string;
  signer_order: number;
  signer_status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined' | 'voided';
  signed_at?: string;
}

interface SigningSession {
  id: string;
  envelope_id?: string;
  session_status: 'draft' | 'sent' | 'voided' | 'completed' | 'declined' | 'expired';
  signed_pdf_url?: string;
  certificate_url?: string;
  docusign_completed_at?: string;
  created_at: string;
  signing_signers: SigningSigner[];
}

interface HomeownerDocument {
  id: string;
  title: string;
  document_type: string;
  file_url: string;
  signed: boolean;
  signed_at?: string;
  created_at: string;
}

interface SpecialRequest {
  id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
  description?: string;
}

const reqStatusConfig: Record<string, string> = {
  submitted: 'bg-muted text-muted-foreground',
  in_review: 'bg-warning/10 text-warning border border-warning/20',
  approved: 'bg-success/10 text-success border border-success/20',
  completed: 'bg-primary/10 text-primary border border-primary/20',
  declined: 'bg-danger/10 text-danger border border-danger/20',
};

const SIGNER_STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock size={12} className="text-muted-foreground" />,
  sent: <Send size={12} className="text-blue-500" />,
  viewed: <Eye size={12} className="text-amber-500" />,
  signed: <CheckCircle size={12} className="text-emerald-600" />,
  declined: <AlertCircle size={12} className="text-red-500" />,
  voided: <X size={12} className="text-muted-foreground" />,
};

export default function HomeownerDocumentsPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'documents' | 'requests'>('documents');
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Maintenance');
  const [newDesc, setNewDesc] = useState('');
  const [signingSessions, setSigningSessions] = useState<SigningSession[]>([]);
  const [signingLoading, setSigningLoading] = useState(true);
  const [signingModal, setSigningModal] = useState<{ envelopeId: string; signer: SignerInfo } | null>(null);
  const [documents, setDocuments] = useState<HomeownerDocument[]>([]);
  const [requests, setRequests] = useState<SpecialRequest[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      setCurrentUserId(userRes.user.id);

      // Get homeowner's primary lead_id
      const { data: propLinks } = await supabase
        .from('property_homeowners')
        .select('lead_id')
        .eq('homeowner_user_id', userRes.user.id)
        .limit(1);

      const primaryLeadId = propLinks?.[0]?.lead_id || null;
      setLeadId(primaryLeadId);

      if (primaryLeadId) {
        // Fetch homeowner documents
        const { data: docs } = await supabase
          .from('homeowner_documents')
          .select('*')
          .eq('lead_id', primaryLeadId)
          .order('created_at', { ascending: false });
        if (docs) setDocuments(docs);

        // Fetch special requests
        const { data: reqs } = await supabase
          .from('special_requests')
          .select('*')
          .eq('lead_id', primaryLeadId)
          .order('created_at', { ascending: false });
        if (reqs) setRequests(reqs);
      }
    };
    init();
  }, [supabase]);

  useEffect(() => {
    if (leadId) fetchSigningSessions();
  }, [leadId]);

  async function fetchSigningSessions() {
    if (!leadId) return;
    setSigningLoading(true);
    try {
      const res = await fetch(`/api/docusign/sessions?leadId=${leadId}`);
      const data = await res.json() as { sessions?: SigningSession[] };
      setSigningSessions(data.sessions ?? []);
    } catch {
      setSigningSessions([]);
    } finally {
      setSigningLoading(false);
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

  async function handleSubmitRequest() {
    if (!newTitle.trim() || !leadId || !currentUserId) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('special_requests').insert({
      lead_id: leadId,
      homeowner_user_id: currentUserId,
      title: newTitle,
      category: newCategory,
      description: newDesc,
      status: 'submitted',
    }).select().single();
    if (!error && data) {
      setRequests(prev => [data, ...prev]);
      setNewTitle('');
      setNewCategory('Maintenance');
      setNewDesc('');
      setShowNewRequest(false);
    }
    setSubmitting(false);
  }

  // Build the agreement document row from signing sessions
  const agreementDoc = signingSessions.length > 0 ? signingSessions[0] : null;
  const agreementSigned = agreementDoc?.session_status === 'completed';

  return (
    <HomeownerLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Documents & Requests</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Signed agreements, statements, and special requests</p>
          </div>
          {activeTab === 'requests' && (
            <button
              onClick={() => setShowNewRequest(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-all"
            >
              <Plus size={14} />
              New Request
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-fit">
          {(['documents', 'requests'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all capitalize ${
                activeTab === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'documents' && (
          <div className="space-y-4">
            {/* Partnership Agreement — from DocuSign */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Shield size={14} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">Partnership Agreement</span>
                <span className="text-xs text-muted-foreground ml-auto">Powered by DocuSign</span>
                <button onClick={fetchSigningSessions} className="p-1 rounded hover:bg-muted transition-all">
                  <RefreshCw size={12} className="text-muted-foreground" />
                </button>
              </div>

              {signingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              ) : !leadId ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No property linked to your account yet.
                </div>
              ) : agreementDoc ? (
                <div className="divide-y divide-border">
                  {/* Session row */}
                  <div className="px-4 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText size={16} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">TRAVLR Partnership Agreement</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              Sent {new Date(agreementDoc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {agreementSigned && (
                              <span className="flex items-center gap-1 text-xs text-emerald-600">
                                <CheckCircle size={11} />
                                Fully Executed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {agreementSigned && agreementDoc.signed_pdf_url && (
                        <a
                          href={agreementDoc.signed_pdf_url}
                          download="TRAVLR_Partnership_Agreement_Signed.pdf"
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-all"
                        >
                          <Download size={12} />
                          Download
                        </a>
                      )}
                    </div>

                    {/* Per-signer status */}
                    <div className="space-y-2 pl-12">
                      {agreementDoc.signing_signers.map((signer) => {
                        const canSign = ['sent', 'viewed'].includes(signer.signer_status) && agreementDoc.session_status === 'sent';
                        return (
                          <div key={signer.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {SIGNER_STATUS_ICON[signer.signer_status]}
                              <span className="text-xs text-foreground">{signer.signer_name}</span>
                              <span className="text-xs text-muted-foreground capitalize">{signer.signer_status}</span>
                              {signer.signed_at && (
                                <span className="text-xs text-muted-foreground">
                                  · {new Date(signer.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                            {canSign && (
                              <button
                                onClick={() => openSigningForSigner(agreementDoc, signer)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-all"
                              >
                                <FileText size={11} />
                                Review & Sign
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Certificate download */}
                    {agreementSigned && agreementDoc.certificate_url && (
                      <div className="mt-3 pl-12">
                        <a
                          href={agreementDoc.certificate_url}
                          download="TRAVLR_Certificate_of_Completion.pdf"
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <Shield size={11} />
                          Download Certificate of Completion
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No signing session found. Contact your TRAVLR property manager.
                </div>
              )}
            </div>

            {/* Other Documents from homeowner_documents table */}
            {documents.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Property Documents</h3>
                </div>
                <div className="divide-y divide-border">
                  {documents.map(doc => (
                    <div key={doc.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText size={14} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{doc.title}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {doc.document_type} · {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {doc.signed && <span className="ml-2 text-success">· Signed</span>}
                          </p>
                        </div>
                      </div>
                      {doc.file_url ? (
                        <a
                          href={doc.file_url}
                          download
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Download size={12} />
                          Download
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pending</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-4">
            {showNewRequest && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">New Request</h3>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Brief title for your request"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none">
                    <option>Maintenance</option>
                    <option>Improvement</option>
                    <option>Cleaning</option>
                    <option>Personal Use</option>
                    <option>Pricing</option>
                    <option>General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                  <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3} placeholder="Details..." className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none resize-none" />
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => setShowNewRequest(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                  <button onClick={handleSubmitRequest} disabled={submitting || !newTitle.trim()} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60">
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            )}

            {requests.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
                No requests yet. Click "New Request" to submit one.
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map(r => (
                  <div key={r.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground">{r.title || r.category}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${reqStatusConfig[r.status] || reqStatusConfig.submitted}`}>
                            {r.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{r.category} · {new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Embedded signing modal */}
      {signingModal && (
        <EmbeddedSigningModal
          envelopeId={signingModal.envelopeId}
          signer={signingModal.signer}
          onComplete={() => { setSigningModal(null); fetchSigningSessions(); }}
          onDecline={() => { setSigningModal(null); fetchSigningSessions(); }}
          onClose={() => setSigningModal(null)}
        />
      )}
    </HomeownerLayout>
  );
}
