import React, { useEffect, useRef } from 'react';
import { Terminal, Trash2 } from 'lucide-react';
import type { LogEntry } from '../lib/types';

const LEVEL_STYLE: Record<LogEntry['level'], string> = {
  info: 'text-muted-foreground',
  ok: 'text-success',
  warn: 'text-warning',
  error: 'text-danger',
};

const LEVEL_DOT: Record<LogEntry['level'], string> = {
  info: 'bg-muted-foreground/50',
  ok: 'bg-success',
  warn: 'bg-warning',
  error: 'bg-danger',
};

export default function ActivityLog({
  title,
  entries,
  onClear,
  emptyText,
  className = '',
}: {
  title: string;
  entries: LogEntry[];
  onClear: () => void;
  emptyText: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-card ${className}`}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Terminal size={14} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{entries.length} events</span>
        <button
          onClick={onClear}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Clear log"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div ref={ref} className="min-h-[320px] max-h-[620px] flex-1 space-y-1 overflow-y-auto bg-muted/5 p-3 font-mono text-[11px]">
        {entries.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">{emptyText}</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex items-start gap-2 leading-relaxed">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[e.level]}`} />
              <span className="shrink-0 text-muted-foreground/60">{e.ts}</span>
              <span className={LEVEL_STYLE[e.level]}>{e.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
