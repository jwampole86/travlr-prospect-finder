'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import ReportChat from '@/app/estimate/components/ReportChat';
import ReportActions from '@/app/estimate/components/ReportActions';
import { parseEquipment } from '@/lib/homeownerReportContent';
import HomeownerReportView from '@/app/estimate/components/HomeownerReport';
import ContactRequestModal, { type ContactMode } from '@/app/estimate/components/ContactRequestModal';
import type { HomeownerEstimate } from '@/lib/homeownerEstimateTypes';
import { useForceLightTheme } from '@/lib/hooks/useForceLightTheme';

function ReportContent() {
  useForceLightTheme();
  const params = useSearchParams();
  const address = params.get('address') ?? '';
  const contactParam = params.get('contact');
  const confirmToken = params.get('c');
  const equipment = parseEquipment(params.get('eq'));
  const [contactOpen, setContactOpen] = useState(false);
  const [contactMode, setContactMode] = useState<ContactMode>('call');
  const openContact = (mode: ContactMode) => { setContactMode(mode); setContactOpen(true); };
  const [estimate, setEstimate] = useState<HomeownerEstimate | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  // Opening the signed link from the email proves the homeowner received it.
  useEffect(() => {
    if (!confirmToken) return;
    fetch('/api/estimate/confirm-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: confirmToken }) }).catch(() => {});
  }, [confirmToken]);

  useEffect(() => {
    if (address.trim().length < 5) { setState('error'); return; }
    let cancelled = false;
    fetch('/api/estimate/property', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) })
      .then(r => r.json())
      .then(d => { if (cancelled) return; if (d.estimate) { setEstimate(d.estimate); setState('ready'); if (contactParam === 'call' || contactParam === 'question') openContact(contactParam); } else setState('error'); })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  if (state === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 size={26} className="animate-spin text-indigo-600" /></div>;
  }
  if (state === 'error' || !estimate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center space-y-2">
          <AlertCircle size={24} className="mx-auto text-amber-500" />
          <p className="font-semibold text-slate-900">We couldn&apos;t open this report</p>
          <p className="text-sm text-slate-500">The link may be incomplete. Request a fresh estimate at <a className="text-indigo-600 underline" href="/estimate">staytrvlr.com/estimate</a>.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-100 print:bg-white py-6 sm:py-10 px-3 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <ReportActions address={address} equipment={equipment} onSchedule={() => openContact('call')} />
        </div>
        <HomeownerReportView report={estimate.report} variant="full" equipment={equipment} onContact={openContact} onPrint={() => window.print()} />
      </div>
      <ReportChat address={address} equipment={equipment} onTalkToPerson={() => openContact('question')} />
      <ContactRequestModal open={contactOpen} onClose={() => setContactOpen(false)} address={address} initialMode={contactMode} />
    </div>
  );
}

export default function EstimateReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 size={26} className="animate-spin text-indigo-600" /></div>}>
      <ReportContent />
    </Suspense>
  );
}
