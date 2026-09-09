'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, DollarSign, BarChart2, Shield, Loader2, MessageSquare, Copy, Check, Send, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface PropertyEstimatePanelProps {
  address?: string;
  city?: string;
  state?: string;
  contactName?: string;
  contactPhone?: string;
  leadId?: string;
  agentId?: string;
}

interface EstimateResult {
  estimatedADR: number;
  estimatedOccupancy: number;
  grossMonthly: number;
  netMonthly: number;
  annualNet: number;
  regulationSummary: string;
  regulationStatus: 'permitted' | 'restricted' | 'unknown';
}

const PUBLIC_ESTIMATE_URL = 'https://staytrvlr.com/estimate';

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export default function PropertyEstimatePanel({ address, city, state, contactName, contactPhone, leadId, agentId }: PropertyEstimatePanelProps) {
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullAddress = [address, city, state].filter(Boolean).join(', ');
  const shareUrl = `${PUBLIC_ESTIMATE_URL}?address=${encodeURIComponent(fullAddress)}`;

  const loadEstimate = useCallback(async () => {
    if (!fullAddress.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/estimate/property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: fullAddress }),
      });
      const data = await res.json();
      if (data.estimate) setEstimate(data.estimate);
    } catch {
      // non-fatal — agent can still share the public estimate link
    } finally {
      setLoading(false);
    }
  }, [fullAddress]);

  useEffect(() => { loadEstimate(); }, [loadEstimate]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Estimate link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  const handleTextLink = async () => {
    if (!contactPhone || !leadId) return;
    setSending(true);
    try {
      const message = `Hi ${contactName || 'there'} — here's the free property estimate we discussed for ${address || 'your property'}: ${shareUrl}`;
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, to: contactPhone, message, agentId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Estimate link texted to homeowner');
      } else {
        toast.error(data.error || 'Failed to send text');
      }
    } catch {
      toast.error('Failed to send text');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
        <p className="text-xs font-semibold text-foreground">STR Revenue Estimate</p>
      </div>

      {!fullAddress.trim() ? (
        <p className="text-xs text-muted-foreground">Add a property address to generate an estimate.</p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Calculating estimate…
        </div>
      ) : estimate ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-muted/30 p-2.5">
              <p className="text-[10px] text-muted-foreground">Avg Daily Rate</p>
              <p className="text-sm font-bold text-foreground">${estimate.estimatedADR}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-2.5">
              <p className="text-[10px] text-muted-foreground">Occupancy</p>
              <p className="text-sm font-bold text-foreground">{estimate.estimatedOccupancy}%</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-2.5">
              <p className="text-[10px] text-muted-foreground">Gross / mo</p>
              <p className="text-sm font-bold text-foreground">{fmt(estimate.grossMonthly)}</p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
              <p className="text-[10px] text-muted-foreground">Net / mo</p>
              <p className="text-sm font-bold text-primary">{fmt(estimate.netMonthly)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground">Estimated Annual Net</p>
              <p className="text-base font-bold text-primary">{fmt(estimate.annualNet)}</p>
            </div>
            <DollarSign className="w-4 h-4 text-primary/60" />
          </div>

          <div className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5">
            <Shield className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">{estimate.regulationSummary}</p>
          </div>

          <div className="pt-1 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Share with the homeowner</p>
            <button
              onClick={handleTextLink}
              disabled={!contactPhone || !leadId || sending}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Text Estimate Link
            </button>
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              Copy Estimate Link
            </button>
            <a
              href={PUBLIC_ESTIMATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open staytrvlr.com/estimate
            </a>
          </div>

          <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
            <MessageSquare className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
              Talking point: "I can run your numbers right now, or you can do it yourself anytime at staytrvlr.com — just scroll to 'Partner with TRAVLR to maximize your property's potential' and click 'Get Your Estimate.'"
            </p>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Could not calculate an estimate for this address.</p>
      )}
    </div>
  );
}
