'use client';

import React, { useState, useCallback } from 'react';
import {
  Sparkles, ChevronDown, ChevronUp, Loader2, RefreshCw,
  MessageSquare, Shield, Phone, Zap, Star, AlertTriangle,
  ChevronRight, Copy, CheckCircle, Brain
} from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface ObjectionHandler {
  objection: string;
  handler: string;
}

interface CallPathStep {
  step: string;
  guidance: string;
}

interface AIEnrichment {
  openingLines: string[];
  objectionHandlers: ObjectionHandler[];
  callPath: CallPathStep[];
  talkingPoints: string[];
  confidenceBooster: string;
}

interface LeadContext {
  contactName?: string;
  address?: string;
  city?: string;
  state?: string;
  luxuryClassification?: string;
  regulationState?: string;
  estimatedNetMonthly?: number;
  prospectScore?: number;
  propertyType?: string;
  bedrooms?: number;
  scriptId?: string;
  callCount?: number;
}

interface AIEnrichmentPanelProps {
  leadContext: LeadContext;
  isCallActive?: boolean;
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
      title="Copy to clipboard"
    >
      {copied
        ? <CheckCircle className="w-3 h-3 text-emerald-500" />
        : <Copy className="w-3 h-3 text-gray-400" />
      }
    </button>
  );
}

// ─── Section Accordion ────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  iconColor,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
        <span className="text-xs font-semibold text-gray-700 flex-1">{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIEnrichmentPanel({ leadContext, isCallActive }: AIEnrichmentPanelProps) {
  const [enrichment, setEnrichment] = useState<AIEnrichment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOpeningLine, setActiveOpeningLine] = useState<number | null>(null);

  const generateEnrichment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/teleprompter/ai-enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadContext }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Generation failed');
      setEnrichment(data.enrichment);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [leadContext]);

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!enrichment && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center px-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-3">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <p className="text-sm font-semibold text-gray-800 mb-1">AI Call Prep</p>
        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
          Generate personalized opening lines, objection handlers, and a call path tailored to this prospect.
        </p>
        {error && (
          <p className="text-xs text-red-500 mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        <button
          onClick={generateEnrichment}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Generate with Claude AI
        </button>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Loader2 className="w-6 h-6 text-violet-500 animate-spin mb-3" />
        <p className="text-sm font-semibold text-gray-700">Generating call prep…</p>
        <p className="text-xs text-gray-400 mt-1">Personalizing for {leadContext.contactName || 'this prospect'}</p>
      </div>
    );
  }

  // ── Enrichment content ─────────────────────────────────────────────────────

  return (
    <div className="space-y-2.5">
      {/* Confidence booster */}
      {enrichment?.confidenceBooster && (
        <div className="flex items-start gap-2.5 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100 rounded-xl px-3 py-2.5">
          <Star className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-violet-800 font-medium leading-relaxed">{enrichment.confidenceBooster}</p>
        </div>
      )}

      {/* Opening Lines */}
      <Section title="Opening Lines" icon={MessageSquare} iconColor="text-blue-500" defaultOpen>
        <div className="space-y-2">
          {enrichment?.openingLines?.map((line, i) => (
            <div
              key={i}
              onClick={() => setActiveOpeningLine(activeOpeningLine === i ? null : i)}
              className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-colors ${
                activeOpeningLine === i ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-gray-100 hover:bg-gray-50'
              }`}
            >
              <span className={`text-xs font-bold mt-0.5 flex-shrink-0 w-4 ${activeOpeningLine === i ? 'text-blue-600' : 'text-gray-400'}`}>
                {i + 1}
              </span>
              <p className={`text-xs leading-relaxed flex-1 ${activeOpeningLine === i ? 'text-blue-800 font-medium' : 'text-gray-700'}`}>
                "{line}"
              </p>
              <CopyButton text={line} />
            </div>
          ))}
        </div>
      </Section>

      {/* Objection Handlers */}
      <Section title="Objection Handlers" icon={Shield} iconColor="text-amber-500" defaultOpen>
        <div className="space-y-2.5">
          {enrichment?.objectionHandlers?.map((oh, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-lg p-2.5">
              <div className="flex items-start gap-1.5 mb-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs font-semibold text-gray-700">"{oh.objection}"</p>
              </div>
              <div className="flex items-start gap-1.5 pl-4">
                <ChevronRight className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-600 leading-relaxed flex-1">"{oh.handler}"</p>
                <CopyButton text={oh.handler} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Call Path */}
      <Section title="Call Path" icon={Phone} iconColor="text-emerald-500">
        <div className="space-y-2">
          {enrichment?.callPath?.map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-800">{step.step}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.guidance}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Talking Points */}
      <Section title="Key Talking Points" icon={Zap} iconColor="text-orange-500">
        <div className="space-y-1.5">
          {enrichment?.talkingPoints?.map((point, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
              <p className="text-xs text-gray-700 leading-relaxed">{point}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Regenerate */}
      <button
        onClick={generateEnrichment}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <RefreshCw className="w-3 h-3" />
        Regenerate
      </button>
    </div>
  );
}
