'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';
import { EmptyState, Panel } from '@/components/ops';
import { formatRelativeTime, type CoachingNoteItem } from '../data';

export default function CoachingNotesPanel({ notes }: { notes: CoachingNoteItem[] }) {
  return (
    <Panel title="Recent coaching notes" icon={BookOpen}>
      {notes.length === 0 ? (
        <EmptyState icon={BookOpen} title="No coaching notes saved" hint="Manager notes written to call_sessions.coaching_notes will appear here." />
      ) : (
        <div className="space-y-3">
          {notes.slice(0, 8).map((note) => (
            <div key={note.sessionId} className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{note.agentName}</p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(note.startedAt)}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">{new Date(note.startedAt).toLocaleDateString()}</span>
              </div>
              <p className="mt-3 text-sm text-foreground">{note.note}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
