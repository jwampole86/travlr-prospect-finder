'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/app/campaigns/shared';
import { SERVICE_LINES, SERVICE_LINE_LABEL } from '@/lib/seller/types';
import { api, money } from './ui';

type Row = { id: string; service_line: string; kind: string; invoiced: number; collected: number; cost: number; status: string };

export default function RevenueTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ items: Row[] }>('/api/seller/revenue').then((r) => setRows(r.items)).catch((e) => setError(e.message)); }, []);

  if (error) return <Card className="p-5 text-sm text-red-700">{error}</Card>;
  if (!rows) return <Card className="p-8 flex justify-center"><Loader2 className="animate-spin" /></Card>;

  const live = rows.filter((r) => r.status !== 'void');
  const lines = SERVICE_LINES.map((s) => {
    const mine = live.filter((r) => r.service_line === s);
    const sum = (k: 'invoiced' | 'collected' | 'cost') => mine.reduce((n, r) => n + Number(r[k] || 0), 0);
    return { line: s, count: mine.length, invoiced: sum('invoiced'), collected: sum('collected'), cost: sum('cost') };
  });
  const total = lines.reduce((t, l) => ({ invoiced: t.invoiced + l.invoiced, collected: t.collected + l.collected, cost: t.cost + l.cost }), { invoiced: 0, collected: 0, cost: 0 });

  return (
    <Card className="p-5 overflow-x-auto">
      <h2 className="text-sm font-semibold">Revenue by service</h2>
      <p className="mt-1 text-xs text-muted-foreground">Add invoices and costs from each opportunity. Margin is collected revenue minus the cost of delivering the service.</p>
      <table className="mt-4 w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Service</th><th className="font-medium">Entries</th><th className="font-medium">Invoiced</th><th className="font-medium">Collected</th><th className="font-medium">Cost</th><th className="font-medium">Margin</th></tr></thead>
        <tbody className="divide-y divide-border">
          {lines.map((l) => (
            <tr key={l.line}><td className="py-2.5">{SERVICE_LINE_LABEL[l.line]}</td><td>{l.count}</td><td>{money(l.invoiced)}</td><td>{money(l.collected)}</td><td>{money(l.cost)}</td><td className="font-medium">{money(l.collected - l.cost)}</td></tr>
          ))}
          <tr className="font-semibold"><td className="py-2.5">Total</td><td>{live.length}</td><td>{money(total.invoiced)}</td><td>{money(total.collected)}</td><td>{money(total.cost)}</td><td>{money(total.collected - total.cost)}</td></tr>
        </tbody>
      </table>
    </Card>
  );
}
