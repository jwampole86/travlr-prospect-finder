import React from 'react';
import { EmptyState, StatusPill } from '@/components/ops';
import { BriefcaseBusiness } from 'lucide-react';

export interface RoleMetricRow {
  roleTitle: string;
  candidates: number;
  scheduled: number;
  completed: number;
  hired: number;
  averageScore: number | null;
  lastInterviewAt: string | null;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RoleBreakdownTable({ rows }: { rows: RoleMetricRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={BriefcaseBusiness}
        title="No role activity yet"
        hint="Role-level analytics will appear once interview sessions are scheduled."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">Role</th>
            <th className="px-4 py-3 font-semibold text-center">Candidates</th>
            <th className="px-4 py-3 font-semibold text-center">Scheduled</th>
            <th className="px-4 py-3 font-semibold text-center">Completed</th>
            <th className="px-4 py-3 font-semibold text-center">Hired</th>
            <th className="px-4 py-3 font-semibold text-center">Avg score</th>
            <th className="px-4 py-3 font-semibold text-right">Last interview</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.roleTitle} className="border-t border-border hover:bg-muted/20">
              <td className="px-4 py-3 font-medium text-foreground">{row.roleTitle}</td>
              <td className="px-4 py-3 text-center tabular-nums text-foreground">{row.candidates}</td>
              <td className="px-4 py-3 text-center tabular-nums text-foreground">{row.scheduled}</td>
              <td className="px-4 py-3 text-center tabular-nums text-foreground">{row.completed}</td>
              <td className="px-4 py-3 text-center"><StatusPill tone={row.hired > 0 ? 'success' : 'default'}>{row.hired}</StatusPill></td>
              <td className="px-4 py-3 text-center tabular-nums text-foreground">{row.averageScore == null ? '—' : row.averageScore.toFixed(1)}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">{formatDate(row.lastInterviewAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
