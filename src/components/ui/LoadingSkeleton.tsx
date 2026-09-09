'use client';

import React from 'react';
import { AlertTriangle, WifiOff, RefreshCw, Inbox, Search, FolderOpen } from 'lucide-react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-muted rounded-md ${className}`} />
  );
}

export function TableRowSkeleton({ cols = 10 }: { cols?: number }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={`skel-col-${i + 1}`} className="px-3 py-3">
          <Skeleton className={`h-4 ${i === 0 ? 'w-4' : i === 1 ? 'w-32' : 'w-16'}`} />
        </td>
      ))}
    </tr>
  );
}

export function KPICardSkeleton() {
  return (
    <div className="bg-card rounded-lg border border-border p-5 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function KanbanColumnSkeleton() {
  return (
    <div className="flex flex-col w-64 shrink-0 rounded-xl border-2 border-border bg-muted/30 overflow-hidden">
      <div className="px-3 py-2.5 bg-muted/50 flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-8 rounded-full" />
      </div>
      <div className="flex-1 p-2 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`kskel-${i}`} className="bg-card border border-border rounded-xl p-3.5 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LeadTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <Skeleton className="h-4 w-4 rounded" />
        {['w-40', 'w-16', 'w-20', 'w-24', 'w-28', 'w-20', 'w-24', 'w-20', 'w-16', 'w-24'].map((w, i) => (
          <Skeleton key={`th-${i}`} className={`h-3 ${w}`} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={`lskel-${i}`} className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <KPICardSkeleton key={`kpi-${i}`} />
        ))}
      </div>
      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <Skeleton className="h-4 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`dskel-${i}`} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-24 rounded-full ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className={`bg-card border border-border rounded-xl p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-24 rounded-lg" />
      </div>
      <Skeleton className={`${height} w-full rounded-lg`} />
    </div>
  );
}

// ─── Homeowner Dashboard Skeleton ────────────────────────────────────────────
export function HomeownerDashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`hw-kpi-${i}`} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
      {/* Bookings list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <Skeleton className="h-4 w-24" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`hw-bk-${i}`} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Portfolio Switching Overlay ──────────────────────────────────────────────
export function PortfolioSwitchingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-xl transition-opacity duration-200">
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-card border border-border rounded-full shadow-lg">
        <RefreshCw size={14} className="text-primary animate-spin" />
        <span className="text-sm font-medium text-foreground">Loading {label}…</span>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        {icon ?? <Inbox size={22} className="text-muted-foreground" />}
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1.5">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed mb-4">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function EmptyLeadsState({ onSync }: { onSync?: () => void }) {
  return (
    <EmptyState
      icon={<Search size={22} className="text-muted-foreground" />}
      title="No leads in this portfolio yet"
      description="This portfolio has no leads. Trigger a sync to pull in the latest listings from all configured sources."
      action={onSync ? { label: 'Sync Now', onClick: onSync } : undefined}
    />
  );
}

export function EmptyFilteredState({ onClear }: { onClear?: () => void }) {
  return (
    <EmptyState
      icon={<FolderOpen size={22} className="text-muted-foreground" />}
      title="No leads match your filters"
      description="Try adjusting your search or filter criteria to find what you're looking for."
      action={onClear ? { label: 'Clear Filters', onClick: onClear } : undefined}
    />
  );
}

export function EmptyBookingsState() {
  return (
    <EmptyState
      icon={<Inbox size={22} className="text-muted-foreground" />}
      title="No bookings yet"
      description="Your upcoming and past bookings will appear here once your property goes live."
    />
  );
}

// ─── Error State ──────────────────────────────────────────────────────────────
interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, compact = false }: ErrorStateProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
        <AlertTriangle size={15} className="text-red-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">{title}</p>
          <p className="text-[11px] text-red-600 dark:text-red-500 mt-0.5 truncate">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors shrink-0"
          >
            <RefreshCw size={11} />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/20 flex items-center justify-center mb-4">
        <AlertTriangle size={22} className="text-red-500" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1.5">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <RefreshCw size={13} />
          Try Again
        </button>
      )}
    </div>
  );
}

// ─── Network Error Banner ─────────────────────────────────────────────────────
interface NetworkErrorBannerProps {
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function NetworkErrorBanner({ onRetry, onDismiss }: NetworkErrorBannerProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
      <WifiOff size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Connection lost</p>
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
          Check your internet connection. Your changes are safe — retry when you're back online.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-lg text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
          >
            <RefreshCw size={11} />
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Inline Sync Indicator ────────────────────────────────────────────────────
export function SyncingIndicator({ label = 'Syncing…' }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-full">
      <RefreshCw size={11} className="text-blue-500 animate-spin" />
      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">{label}</span>
    </div>
  );
}

// ─── Spinner Button ───────────────────────────────────────────────────────────
interface SpinnerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
}

export function SpinnerButton({
  loading = false,
  loadingLabel,
  children,
  variant = 'primary',
  size = 'md',
  disabled,
  className = '',
  ...props
}: SpinnerButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-muted text-foreground hover:bg-muted/80 border border-border',
    danger: 'bg-red-500 text-white hover:bg-red-600',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <RefreshCw size={size === 'sm' ? 11 : 13} className="animate-spin" />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}