'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, CalendarCheck } from 'lucide-react';
import type { EquipmentKey } from '@/lib/homeownerReportContent';

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'What permits will I need, and what do they cost?',
  'Which smart-home equipment is worth getting?',
  'What will I see in my owner dashboard?',
  'How does TRAVLR get paid?',
];

const GREETING: Msg = {
  role: 'assistant',
  content: 'Hi! I can answer questions about your report: permits, costs, equipment, the owner dashboard and how TRAVLR works. What would you like to know?',
};

/** Floating question assistant, grounded in the homeowner's own report. Hidden when printing. */
export default function ReportChat({ address, equipment, onTalkToPerson }: {
  address: string; equipment: EquipmentKey[] | null; onTalkToPerson: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, sending, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    // Keep the page behind a full-screen phone sheet from scrolling.
    const narrow = window.matchMedia('(max-width: 639px)').matches;
    const prev = document.body.style.overflow;
    if (narrow) document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  async function send(text: string) {
    const content = text.trim().slice(0, 500);
    if (!content || sending) return;
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages(next); setInput(''); setSending(true);
    try {
      const res = await fetch('/api/estimate/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, eq: equipment ? equipment.join(',') : undefined, messages: next.slice(1) }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.reply || data.error) setMessages(m => [...m, { role: 'assistant', content: data.reply || data.error }]);
      else setMessages(m => [...m, { role: 'assistant', content: 'Sorry, something went wrong. A TRAVLR specialist can answer that for you.' }]);
      if (data.handoff || !res.ok) setHandoff(true);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'I could not connect just now. Please try again, or ask a TRAVLR specialist.' }]);
      setHandoff(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="print:hidden">
      {!open && (
        <button
          onClick={() => setOpen(true)} aria-label="Ask a question about your report"
          title="Chat with our assistant" className="fixed z-40 right-4 bottom-[1.1rem] sm:right-6 sm:bottom-6 inline-flex items-center justify-center gap-2 w-14 h-14 lg:w-auto lg:h-12 lg:pl-4 lg:pr-5 rounded-full bg-white text-indigo-700 border-2 border-indigo-600 text-sm font-semibold shadow-xl hover:bg-indigo-50 transition-colors"
        >
          <MessageCircle size={22} className="lg:w-[18px] lg:h-[18px]" /> <span className="hidden lg:inline">Chat with our assistant</span>
        </button>
      )}

      {open && (
        <div role="dialog" aria-label="Ask a question about your report" aria-modal="false"
          className="fixed z-50 inset-0 sm:inset-auto sm:right-6 sm:bottom-6 sm:w-[380px] sm:h-[560px] sm:max-h-[calc(100vh-3rem)] flex flex-col bg-white sm:rounded-2xl sm:border sm:border-slate-200 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-indigo-700 text-white">
            <div>
              <p className="text-sm font-bold leading-tight">TRAVLR assistant</p>
              <p className="text-[11px] text-indigo-200 leading-tight">AI answers about your report</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="w-10 h-10 -mr-2 rounded-lg hover:bg-white/10 flex items-center justify-center"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <p className={`max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed px-3.5 py-2.5 rounded-2xl ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'}`}>{m.content}</p>
              </div>
            ))}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map(q => (
                  <button key={q} onClick={() => send(q)} className="text-left text-xs px-3 py-2 rounded-xl border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50">{q}</button>
                ))}
              </div>
            )}
            {sending && <div className="flex justify-start"><span className="inline-flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5"><Loader2 size={13} className="animate-spin" /> Thinking…</span></div>}
            {handoff && !sending && (
              <button onClick={() => { setOpen(false); onTalkToPerson(); }} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
                <CalendarCheck size={15} /> Talk to a TRAVLR specialist
              </button>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={e => { e.preventDefault(); send(input); }} className="border-t border-slate-200 bg-white p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef} value={input} onChange={e => setInput(e.target.value)} rows={1} maxLength={500}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Type your question…" aria-label="Your question"
                className="flex-1 resize-none max-h-28 px-3 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <button type="submit" disabled={sending || !input.trim()} aria-label="Send" className="w-11 h-11 shrink-0 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50"><Send size={16} /></button>
            </div>
            <p className="mt-2 text-[10px] text-slate-500 leading-snug">AI assistant. Answers are general and not legal or tax advice. Your specialist confirms the details.</p>
          </form>
        </div>
      )}
    </div>
  );
}
