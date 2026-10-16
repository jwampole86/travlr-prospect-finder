'use client';

import React from 'react';
import { EmptyState, StatusPill, inputClass } from '@/components/ops';
import { ListOrdered } from 'lucide-react';
import type { CadenceSequence } from './types';

export default function CadenceSequenceList({
  sequences,
  activeSeqId,
  onSelect,
  search,
  onSearchChange,
}: {
  sequences: CadenceSequence[];
  activeSeqId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className={inputClass}
        placeholder="Search sequences"
      />

      {sequences.length === 0 ? (
        <EmptyState icon={ListOrdered} title="No cadence sequences found" hint="Create a new sequence to start defining nurture steps." />
      ) : (
        <div className="space-y-2">
          {sequences.map((sequence) => (
            <button
              key={sequence.id}
              type="button"
              onClick={() => onSelect(sequence.id)}
              className={`w-full rounded-2xl border p-4 text-left transition-colors ${activeSeqId === sequence.id ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:bg-muted/20'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{sequence.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{sequence.description || 'No description yet.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sequence.is_default && <StatusPill tone="primary">Default</StatusPill>}
                  <StatusPill tone={sequence.is_active ? 'success' : 'default'}>{sequence.is_active ? 'Active' : 'Paused'}</StatusPill>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>{sequence.steps.length} steps</span>
                <span>•</span>
                <span>trigger_stage: {sequence.trigger_stage || 'unset'}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
