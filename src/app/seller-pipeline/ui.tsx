'use client';

import React from 'react';
import { cx } from '@/app/campaigns/shared';

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET', cache: 'no-store',
    ...(init?.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(j.error || `Request failed (${res.status})`) as Error & { blockers?: string[] };
    err.blockers = j.blockers;
    throw err;
  }
  return j as T;
}

export const money = (n: number | null | undefined) => (n == null ? '-' : `$${Math.round(n).toLocaleString()}`);

export const inputCls = 'h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30';
export const btnCls = 'h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm hover:bg-muted disabled:opacity-50';
export const primaryBtnCls = 'h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50';

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block text-xs font-medium text-muted-foreground', className)}>
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export function Bar({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'green' | 'amber' }) {
  const color = tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function AuthBadge({ status }: { status: string }) {
  const tone = status === 'authorized' ? 'bg-emerald-100 text-emerald-800' : status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';
  const label = status === 'authorized' ? 'Authorized' : status === 'blocked' ? 'Blocked' : 'Needs permission';
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', tone)}>{label}</span>;
}
