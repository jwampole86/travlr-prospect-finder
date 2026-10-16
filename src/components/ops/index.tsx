import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Shared building blocks for admin / operations pages so they look and behave consistently.
 * Uses only the existing theme tokens (bg-card, border-border, text-success, text-danger, …).
 */

export type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

const TONE_SOFT: Record<Tone, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Icon size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export interface Stat {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ElementType;
  tone?: Tone;
}

export function StatGrid({ stats, columns = 4 }: { stats: Stat[]; columns?: 3 | 4 | 5 }) {
  const cols = columns === 5 ? 'lg:grid-cols-5' : columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4';
  return (
    <div className={`grid grid-cols-2 gap-3 ${cols}`}>
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
            <span className={`rounded-lg p-1.5 ${TONE_SOFT[s.tone ?? 'default']}`}><s.icon size={14} /></span>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">{s.value}</div>
          {s.hint && <div className="text-[11px] text-muted-foreground">{s.hint}</div>}
        </div>
      ))}
    </div>
  );
}

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; icon?: React.ElementType; badge?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            value === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.icon && <t.icon size={14} />}
          {t.label}
          {!!t.badge && <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Panel({
  title,
  icon: Icon,
  actions,
  children,
  className = '',
  padded = true,
}: {
  title?: string;
  icon?: React.ElementType;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-border bg-card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={15} className="text-primary" />}
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
          </div>
          {actions}
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function StatusPill({ tone = 'default', children, icon: Icon }: { tone?: Tone; children: React.ReactNode; icon?: React.ElementType }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE_SOFT[tone]}`}>
      {Icon && <Icon size={10} />}
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }: { icon: React.ElementType; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center">
      <Icon size={28} className="mx-auto mb-3 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 rounded-lg border border-danger/30 px-2.5 py-1 font-semibold hover:bg-danger/10">
          Retry
        </button>
      )}
    </div>
  );
}

export const buttonPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-opacity hover:opacity-90 disabled:opacity-50';
export const buttonSecondary =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50';
export const inputClass =
  'w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20';
