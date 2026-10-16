'use client';

import { CreditCard, KeyRound, Lock, Route } from 'lucide-react';
import { Panel, StatusPill } from '@/components/ops';
import type { QAConfiguration } from '../types';

export function ConfigAuditPanel({ configuration }: { configuration: QAConfiguration }) {
  const checks = [
    {
      label: 'Server AI key',
      value: configuration.apiKeyConfigured ? 'Configured' : 'Missing',
      tone: configuration.apiKeyConfigured ? 'success' : 'danger',
      icon: KeyRound,
      hint: configuration.anthropicEnvVar,
    },
    {
      label: 'Browser exposure',
      value: configuration.browserKeyExposed ? 'Exposed' : 'Safe',
      tone: configuration.browserKeyExposed ? 'danger' : 'success',
      icon: Lock,
      hint: configuration.browserKeyExposed ? 'NEXT_PUBLIC_ANTHROPIC_API_KEY detected' : 'No public Anthropic key env var',
    },
    {
      label: 'Generation model',
      value: configuration.scriptModel,
      tone: 'primary',
      icon: Route,
      hint: configuration.generationRoute,
    },
    {
      label: 'QA execution cost',
      value: configuration.qaRunsPaidCalls ? 'Paid' : 'Offline',
      tone: configuration.qaRunsPaidCalls ? 'warning' : 'success',
      icon: CreditCard,
      hint: configuration.qaRunsPaidCalls ? 'Would call Anthropic' : 'Audits saved scripts only',
    },
  ] as const;

  return (
    <Panel title="Route & environment verification" icon={Lock}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <item.icon size={15} className="text-muted-foreground" />
            </div>
            <div className="mt-3"><StatusPill tone={item.tone}>{item.value}</StatusPill></div>
            <p className="mt-2 text-[11px] text-muted-foreground">{item.hint}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
