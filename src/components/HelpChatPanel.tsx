'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Bot, User, Loader2, RotateCcw } from 'lucide-react';
import { useChat } from '@/lib/hooks/useChat';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface HelpChatPanelProps {
  onClose?: () => void;
  embedded?: boolean;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the TRAVLR Pro AI assistant — a knowledgeable, concise support agent for the TRAVLR short-term rental (STR) lead management platform.

Your role:
- Answer questions about TRAVLR Pro features: Lead Management, Pipeline Board, Teleprompter/Dialer, Cadence Engine, SMS/Email Templates, DocuSign e-signature, Compliance Audit, Data Sync, Agent Performance, Commissions, and all other modules.
- Help agents understand how to use specific features, navigate the platform, and troubleshoot common issues.
- Explain compliance concepts (TCPA, DNC, A2P 10DLC, call-recording consent) in plain language.
- Guide agents through workflows like enriching leads, sending sequences, running cadences, and closing deals via DocuSign.

Rules:
- Keep answers concise and actionable (2-4 sentences unless a step-by-step is needed).
- For legal/compliance questions, explain the concept but always recommend consulting a licensed attorney for specific legal advice.
- Never fabricate specific lead data, agent stats, or real-time metrics — tell the user to check the relevant dashboard page.
- If asked about a feature you are unsure about, say so and direct them to the relevant page in the sidebar.
- Use bullet points for multi-step instructions.
- Be friendly and professional.`;

// ─── Suggested Questions ─────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  "How do I enrich a lead's contact info?",
  'What is A2P 10DLC and why does it matter?',
  'How does the cadence engine work?',
  'What triggers a commission payout?',
  'How do I check TCPA compliance for a lead?',
  'What does the DNC flag mean?',
];

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-emerald-500/10 border border-emerald-500/20'
      }`}>
        {isUser ? <User size={12} /> : <Bot size={12} className="text-emerald-600" />}
      </div>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
        isUser
          ? 'bg-primary text-primary-foreground rounded-tr-sm'
          : 'bg-muted/60 border border-border text-foreground rounded-tl-sm'
      }`}>
        {message.content.split('\n').map((line, i, arr) => (
          <React.Fragment key={i}>
            {line}
            {i < arr.length - 1 && <br />}
          </React.Fragment>
        ))}
        <p className={`text-[9px] mt-1 ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          {message.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HelpChatPanel({ onClose, embedded = false }: HelpChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm the TRAVLR AI assistant. Ask me anything about the platform — features, compliance, workflows, or how to use any module.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevLoadingRef = useRef(false);

  const { response, isLoading, error, sendMessage } = useChat('ANTHROPIC', 'claude-sonnet-4-6', true);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, response]);

  useEffect(() => {
    if (error) toast.error('AI assistant error. Please try again.');
  }, [error]);

  useEffect(() => {
    if (!isLoading && prevLoadingRef.current && response) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: response, timestamp: new Date() },
      ]);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, response]);

  function buildApiMessages(history: Message[], userText: string) {
    const apiMsgs: Array<{ role: string; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];
    history.forEach(m => apiMsgs.push({ role: m.role, content: m.content }));
    apiMsgs.push({ role: 'user', content: userText });
    return apiMsgs;
  }

  function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || isLoading) return;
    const userMessage: Message = { role: 'user', content: msg, timestamp: new Date() };
    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInput('');
    setShowSuggestions(false);
    sendMessage(buildApiMessages(messages, msg), { max_tokens: 800, temperature: 0.5 });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleReset() {
    setMessages([
      {
        role: 'assistant',
        content: "Hi! I'm the TRAVLR AI assistant. Ask me anything about the platform — features, compliance, workflows, or how to use any module.",
        timestamp: new Date(),
      },
    ]);
    setShowSuggestions(true);
    setInput('');
  }

  const panelClass = embedded
    ? 'flex flex-col h-full' :'fixed right-0 top-0 h-full w-[360px] z-[9990] flex flex-col bg-card border-l border-border shadow-2xl';

  return (
    <div className={panelClass}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Bot size={14} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">TRAVLR AI Assistant</p>
            <p className="text-[10px] text-muted-foreground">Powered by Claude</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            title="Reset conversation"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw size={12} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Close"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {/* Streaming indicator */}
        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={12} className="text-emerald-600" />
            </div>
            <div className="bg-muted/60 border border-border rounded-xl rounded-tl-sm px-3 py-2 max-w-[85%]">
              {response ? (
                <p className="text-xs text-foreground leading-relaxed">{response}</p>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Thinking…</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Suggested questions */}
        {showSuggestions && messages.length === 1 && !isLoading && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1">Suggested questions</p>
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSend(q)}
                className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border bg-card shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about TRAVLR…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none text-xs bg-muted/40 border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 disabled:opacity-60 max-h-24 overflow-y-auto scrollbar-thin"
            style={{ minHeight: '36px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
          >
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
        <p className="text-[9px] text-muted-foreground mt-1.5 text-center">
          For legal advice, consult a licensed attorney.
        </p>
      </div>
    </div>
  );
}
