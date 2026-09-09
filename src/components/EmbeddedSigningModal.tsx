'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, CheckCircle, AlertCircle, RefreshCw, Shield } from 'lucide-react';
import type { SignerInfo } from '@/lib/services/docusignService';

interface EmbeddedSigningModalProps {
  envelopeId: string;
  signer: SignerInfo;
  onComplete: () => void;
  onDecline: () => void;
  onClose: () => void;
}

type SigningState = 'loading' | 'ready' | 'completed' | 'declined' | 'error';

export default function EmbeddedSigningModal({
  envelopeId,
  signer,
  onComplete,
  onDecline,
  onClose,
}: EmbeddedSigningModalProps) {
  const [state, setState] = useState<SigningState>('loading');
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetchSigningUrl();
  }, [envelopeId, signer.clientUserId]);

  // Listen for DocuSign return URL navigation (postMessage or URL change)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // DocuSign sends postMessage events from the signing iframe
      if (typeof event.data === 'string') {
        if (event.data.includes('signing_complete') || event.data.includes('completed')) {
          setState('completed');
          setTimeout(onComplete, 1500);
        } else if (event.data.includes('decline') || event.data.includes('declined')) {
          setState('declined');
          setTimeout(onDecline, 1500);
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onComplete, onDecline]);

  async function fetchSigningUrl() {
    setState('loading');
    setError(null);
    try {
      const baseUrl = window.location.origin;
      const returnUrl = `${baseUrl}/homeowner/documents?signing=complete&envelopeId=${envelopeId}`;

      const res = await fetch('/api/docusign/signing-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envelopeId, signer, returnUrl }),
      });

      const data = await res.json() as { url?: string; error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Failed to get signing URL');
      }

      setSigningUrl(data.url!);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }

  // Poll for completion via URL change detection on the iframe
  function handleIframeLoad() {
    try {
      const iframeUrl = iframeRef.current?.contentWindow?.location?.href ?? '';
      if (iframeUrl.includes('signing=complete') || iframeUrl.includes('event=signing_complete')) {
        setState('completed');
        setTimeout(onComplete, 1500);
      } else if (iframeUrl.includes('event=decline') || iframeUrl.includes('event=cancel')) {
        setState('declined');
        setTimeout(onDecline, 1500);
      }
    } catch {
      // Cross-origin iframe — can't read URL, rely on postMessage
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">TRAVLR Partnership Agreement</p>
              <p className="text-xs text-muted-foreground">Signing as: {signer.name} · {signer.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border">
              Secured by DocuSign
            </span>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-all">
              <X size={15} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 relative overflow-hidden rounded-b-2xl">
          {/* Loading */}
          {state === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-card">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Preparing your signing session…</p>
            </div>
          )}

          {/* Error */}
          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-card px-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center">
                <AlertCircle size={24} className="text-danger" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground mb-1">Unable to load signing session</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <button
                onClick={fetchSigningUrl}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 transition-all"
              >
                <RefreshCw size={14} />
                Try Again
              </button>
            </div>
          )}

          {/* Completed */}
          {state === 'completed' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-card">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle size={28} className="text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground mb-1">Agreement Signed!</p>
                <p className="text-sm text-muted-foreground">
                  Your signature has been captured. DocuSign will send a confirmation email with the signed copy.
                </p>
              </div>
            </div>
          )}

          {/* Declined */}
          {state === 'declined' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-card">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <AlertCircle size={28} className="text-amber-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground mb-1">Signing Declined</p>
                <p className="text-sm text-muted-foreground">
                  You have declined to sign. Please contact your TRAVLR agent if you have questions.
                </p>
              </div>
            </div>
          )}

          {/* DocuSign iframe */}
          {state === 'ready' && signingUrl && (
            <iframe
              ref={iframeRef}
              src={signingUrl}
              className="w-full h-full border-0"
              title="TRAVLR Partnership Agreement — DocuSign Signing"
              onLoad={handleIframeLoad}
              allow="camera; microphone"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
            />
          )}
        </div>
      </div>
    </div>
  );
}
