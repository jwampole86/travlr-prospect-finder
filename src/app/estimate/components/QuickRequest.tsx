'use client';

import React, { useState } from 'react';
import { CheckCircle, Loader2, MessageSquare, Phone } from 'lucide-react';
import { getTrackingContext } from '@/lib/estimateTracking';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * One tap, no fields: for visitors who arrived from our text (the link code says who they are), so we already have their number.
 * Hidden for anyone without that code, who keeps the regular form.
 */
export default function QuickRequest() {
  const { t } = useLanguage();
  const [ctx] = useState(() => getTrackingContext());
  const [busy, setBusy] = useState<'text' | 'call' | null>(null);
  const [done, setDone] = useState<{ mode: 'text' | 'call'; last4: string } | null>(null);
  const [error, setError] = useState(false);
  if (!ctx) return null;

  async function send(mode: 'text' | 'call') {
    setBusy(mode); setError(false);
    try {
      const res = await fetch('/api/estimate/quick-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c: ctx!.code, mode }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'failed');
      setDone({ mode, last4: String(j.last4 ?? '') });
    } catch { setError(true); } finally { setBusy(null); }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 flex items-start gap-2" role="status">
        <CheckCircle size={16} className="mt-0.5 shrink-0" />
        <span>{t(done.mode === 'call' ? 'estimate.quickSentCall' : 'estimate.quickSentText', { last4: done.last4 || '----' })}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{t('estimate.quickTitle')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{t('estimate.quickBody')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => send('text')} disabled={!!busy} className="py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
          {busy === 'text' ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}{t('estimate.textMe')}
        </button>
        <button onClick={() => send('call')} disabled={!!busy} className="py-3 rounded-xl border border-primary text-primary text-sm font-semibold hover:bg-primary/5 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
          {busy === 'call' ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}{t('estimate.callMe')}
        </button>
      </div>
      {error && <p className="text-xs text-red-600" role="alert">{t('estimate.quickError')}</p>}
    </div>
  );
}
