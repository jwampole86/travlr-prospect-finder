'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Mail, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Panel, StatusPill, buttonPrimary, buttonSecondary, inputClass } from '@/components/ops';

export interface EmailPreset {
  id: string;
  name: string;
  recipients: string;
}

interface DraftPreset {
  id?: string;
  name: string;
  recipients: string;
}

export default function EmailPresetPanel({
  presets,
  sendingId,
  sendMessage,
  onSave,
  onDelete,
  onSend,
}: {
  presets: EmailPreset[];
  sendingId: string | null;
  sendMessage: string | null;
  onSave: (preset: EmailPreset) => void;
  onDelete: (presetId: string) => void;
  onSend: (preset: EmailPreset) => Promise<void>;
}) {
  const [draft, setDraft] = useState<DraftPreset | null>(null);

  useEffect(() => {
    if (!draft && presets.length === 0) {
      setDraft({ name: '', recipients: '' });
    }
  }, [draft, presets.length]);

  const isValid = !!draft?.name.trim() && !!draft?.recipients.trim();

  return (
    <Panel
      title="Manual email presets"
      icon={Mail}
      actions={
        <button type="button" className={buttonSecondary} onClick={() => setDraft({ name: '', recipients: '' })}>
          <Plus size={14} /> Add preset
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Presets are saved only in this browser. They help operators re-send the current call analytics CSV without implying any automatic schedule.
        </div>

        {draft && (
          <div className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4 md:grid-cols-[1fr,1.4fr,auto] md:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Preset name</label>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)}
                className={inputClass}
                placeholder="Leadership weekly snapshot"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Recipient emails</label>
              <input
                value={draft.recipients}
                onChange={(event) => setDraft((current) => current ? { ...current, recipients: event.target.value } : current)}
                className={inputClass}
                placeholder="ops@example.com, founder@example.com"
              />
            </div>
            <div className="flex gap-2 md:justify-end">
              <button type="button" className={buttonSecondary} onClick={() => setDraft(null)}>Cancel</button>
              <button
                type="button"
                className={buttonPrimary}
                disabled={!isValid}
                onClick={() => {
                  if (!draft || !isValid) return;
                  onSave({
                    id: draft.id ?? `preset-${Date.now()}`,
                    name: draft.name.trim(),
                    recipients: draft.recipients.trim(),
                  });
                  setDraft(null);
                }}
              >
                Save preset
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {presets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No presets saved yet.</p>
          ) : presets.map((preset) => (
            <div key={preset.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{preset.name}</p>
                  <StatusPill tone="primary">Manual send</StatusPill>
                </div>
                <p className="text-xs text-muted-foreground">{preset.recipients}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonSecondary} onClick={() => setDraft(preset)}>
                  <Pencil size={14} /> Edit
                </button>
                <button type="button" className={buttonSecondary} onClick={() => onDelete(preset.id)}>
                  <Trash2 size={14} /> Delete
                </button>
                <button type="button" className={buttonPrimary} disabled={sendingId === preset.id} onClick={() => onSend(preset)}>
                  {sendingId === preset.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send current CSV
                </button>
              </div>
            </div>
          ))}
        </div>

        {sendMessage && <div className="text-xs text-muted-foreground">{sendMessage}</div>}
      </div>
    </Panel>
  );
}
