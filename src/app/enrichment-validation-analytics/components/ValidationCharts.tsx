'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart2, CheckCircle2, TrendingUp } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { FieldConfidenceDist, TrendPoint, ValidationSummary } from './types';

const PASS_COLORS = ['var(--success)', 'var(--danger)'];

export default function ValidationCharts({
  summary,
  trends,
  fieldDist,
}: {
  summary: ValidationSummary;
  trends: TrendPoint[];
  fieldDist: FieldConfidenceDist[];
}) {
  const passFailData = [
    { name: 'Passed', value: summary.passed },
    { name: 'Failed', value: summary.failed },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.65fr,0.85fr]">
        <Panel title="Pass / fail trend" icon={TrendingUp} className="rounded-2xl">
          {trends.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No trend data yet"
              hint="This chart will populate after validation events start landing in the selected timeframe."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <StatusPill tone="success">Passed {summary.passed}</StatusPill>
                <StatusPill tone="danger">Failed {summary.failed}</StatusPill>
                <StatusPill tone="default">Pass rate {summary.passRate}%</StatusPill>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trends} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="validation-pass-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--success)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--success)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="validation-fail-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--danger)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => value.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 16, borderColor: 'var(--border)' }}
                    formatter={(value: number, name: string) => [
                      value,
                      name === 'passed' ? 'Passed' : 'Failed',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="passed"
                    stroke="var(--success)"
                    fill="url(#validation-pass-fill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    stroke="var(--danger)"
                    fill="url(#validation-fail-fill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Outcome mix" icon={CheckCircle2} className="rounded-2xl">
          {passFailData.every((item) => item.value === 0) ? (
            <EmptyState
              icon={CheckCircle2}
              title="No outcomes to chart"
              hint="Once validation events exist, this panel will show the real pass/fail mix."
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={passFailData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={3}
                >
                  {passFailData.map((item, index) => (
                    <Cell key={item.name} fill={PASS_COLORS[index]} />
                  ))}
                </Pie>
                <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 16, borderColor: 'var(--border)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Field confidence distribution" icon={BarChart2} className="rounded-2xl">
        {fieldDist.length === 0 ? (
          <EmptyState
            icon={BarChart2}
            title="No field-level confidence scores yet"
            hint="The live database has not recorded any field confidence arrays in this timeframe."
          />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={fieldDist} margin={{ top: 8, right: 8, left: -20, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="field"
                tick={{ fontSize: 11 }}
                angle={-22}
                textAnchor="end"
                height={56}
                interval={0}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 16, borderColor: 'var(--border)' }} />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="high" name="High (≥80)" stackId="a" fill="var(--success)" />
              <Bar dataKey="medium" name="Medium (60-79)" stackId="a" fill="var(--warning)" />
              <Bar dataKey="low" name="Low (&lt;60)" stackId="a" fill="var(--danger)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  );
}
