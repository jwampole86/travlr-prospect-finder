'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Download, Printer, Link2, Check, Loader2, CalendarCheck, Share2 } from 'lucide-react';
import type { EquipmentKey } from '@/lib/homeownerReportContent';

type Flash = { kind: 'ok' | 'error'; text: string } | null;

export function buildShareUrl(address: string, equipment: EquipmentKey[] | null): string {
  const params = new URLSearchParams({ address });
  if (equipment) params.set('eq', equipment.join(','));
  return `${window.location.origin}/estimate/report?${params.toString()}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    const el = document.createElement('textarea');
    el.value = text; el.setAttribute('readonly', ''); el.style.position = 'fixed'; el.style.opacity = '0';
    document.body.appendChild(el); el.select(); el.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch { return false; }
}

/** Download, print and share controls for the report. Hidden when printing. */
export default function ReportActions({ address, equipment, onSchedule, align = 'end' }: {
  address: string; equipment: EquipmentKey[] | null; onSchedule?: () => void; align?: 'start' | 'center' | 'end';
}) {
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [canShare, setCanShare] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const say = (f: Flash) => { setFlash(f); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setFlash(null), 6000); };

  async function download() {
    if (downloading) return;
    setDownloading(true);
    const params = new URLSearchParams({ address });
    if (equipment) params.set('eq', equipment.join(','));
    try {
      const res = await fetch(`/api/estimate/report-pdf?${params.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (blob.type !== 'application/pdf') throw new Error('not a pdf');
      const disposition = res.headers.get('content-disposition') ?? '';
      const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      const name = (star ? decodeURIComponent(star) : /filename="([^"]+)"/i.exec(disposition)?.[1]) ?? 'TRAVLR - Property Revenue Report.pdf';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      say({ kind: 'ok', text: 'Your PDF is downloading. Check your Downloads folder.' });
    } catch {
      say({ kind: 'error', text: 'We could not create the PDF just now. Please try again, or use Print and choose Save as PDF.' });
    } finally {
      setDownloading(false);
    }
  }

  async function share() {
    const url = buildShareUrl(address, equipment);
    if (canShare) {
      try { await navigator.share({ title: 'My TRAVLR revenue report', url }); return; } catch (e) { if ((e as Error)?.name === 'AbortError') return; }
    }
    if (await copyText(url)) {
      setCopied(true); setTimeout(() => setCopied(false), 2500);
      say({ kind: 'ok', text: 'Link copied. Anyone with it can view this report.' });
    } else {
      window.prompt('Copy this link', url);
    }
  }

  const btn = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px] disabled:opacity-60';
  const justify = align === 'center' ? 'justify-center' : align === 'start' ? 'justify-start' : 'justify-end';

  return (
    <div className="print:hidden">
      <div className={`flex flex-wrap gap-2 ${justify}`}>
        {onSchedule && (
          <button onClick={onSchedule} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}><CalendarCheck size={15} /> Schedule a call</button>
        )}
        <button onClick={download} disabled={downloading} className={`${btn} bg-white border border-slate-300 text-slate-800 hover:bg-slate-50`}>
          {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
        <button onClick={() => window.print()} className={`${btn} bg-white border border-slate-300 text-slate-800 hover:bg-slate-50`}><Printer size={15} /> Print</button>
        <button onClick={share} className={`${btn} bg-white border border-slate-300 text-slate-800 hover:bg-slate-50`}>
          {copied ? <Check size={15} className="text-emerald-600" /> : canShare ? <Share2 size={15} /> : <Link2 size={15} />} {copied ? 'Link copied' : canShare ? 'Share link' : 'Copy link'}
        </button>
      </div>
      <p role="status" aria-live="polite" className={`mt-2 text-xs ${flash?.kind === 'error' ? 'text-rose-600' : 'text-emerald-700'} ${align === 'center' ? 'text-center' : align === 'start' ? 'text-left' : 'text-right'} min-h-[1rem]`}>{flash?.text ?? ''}</p>
    </div>
  );
}
