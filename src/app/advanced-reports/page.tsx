'use client';

import React, { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Filter, Save, Clock, Mail, Plus, Trash2, Play, CheckCircle, ChevronDown, BarChart2, TrendingUp, Users, Star, RefreshCw, X, Send, FileText } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportFilter {
  dateRange: 'custom' | '7d' | '30d' | '90d' | 'mtd' | 'ytd';
  startDate: string;
  endDate: string;
  leadSources: string[];
  stages: string[];
  scoreMin: number;
  scoreMax: number;
  agents: string[];
}

interface SavedTemplate {
  id: string;
  name: string;
  description: string;
  filters: ReportFilter;
  createdAt: string;
  lastRun: string | null;
  reportType: string;
}

interface ScheduledExport {
  id: string;
  templateId: string;
  templateName: string;
  frequency: 'weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  recipients: string[];
  format: 'csv' | 'pdf';
  nextRun: string;
  active: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const LEAD_SOURCES = ['Zillow', 'Realtor.com', 'Craigslist', 'Dwellsy', 'Rent.com', 'Direct', 'Referral', 'Cold Outreach'];
const STAGES = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiating', 'Closed Won', 'Closed Lost'];
const AGENTS = ['Sarah Mitchell', 'James Torres', 'Priya Nair', 'Marcus Webb', 'Lisa Monroe'];

const defaultFilter: ReportFilter = {
  dateRange: '30d',
  startDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  leadSources: [],
  stages: [],
  scoreMin: 0,
  scoreMax: 100,
  agents: [],
};

const mockTemplates: SavedTemplate[] = [
  {
    id: 'tpl-1',
    name: 'Monthly Pipeline Summary',
    description: 'All stages, all sources — last 30 days',
    filters: { ...defaultFilter, dateRange: '30d' },
    createdAt: '2026-07-15',
    lastRun: '2026-08-01',
    reportType: 'pipeline',
  },
  {
    id: 'tpl-2',
    name: 'High-Score Leads (70+)',
    description: 'Leads with score ≥ 70, all sources',
    filters: { ...defaultFilter, scoreMin: 70, dateRange: '90d' },
    createdAt: '2026-07-20',
    lastRun: '2026-08-10',
    reportType: 'leads',
  },
  {
    id: 'tpl-3',
    name: 'Zillow & Realtor Conversion',
    description: 'Conversion funnel for top 2 sources',
    filters: { ...defaultFilter, leadSources: ['Zillow', 'Realtor.com'], dateRange: 'mtd' },
    createdAt: '2026-08-01',
    lastRun: null,
    reportType: 'conversion',
  },
];

const mockSchedules: ScheduledExport[] = [
  {
    id: 'sch-1',
    templateId: 'tpl-1',
    templateName: 'Monthly Pipeline Summary',
    frequency: 'monthly',
    dayOfMonth: 1,
    recipients: ['admin@travlrpro.com', 'ops@travlrpro.com'],
    format: 'pdf',
    nextRun: '2026-09-01',
    active: true,
  },
  {
    id: 'sch-2',
    templateId: 'tpl-2',
    templateName: 'High-Score Leads (70+)',
    frequency: 'weekly',
    dayOfWeek: 1,
    recipients: ['admin@travlrpro.com'],
    format: 'csv',
    nextRun: '2026-08-25',
    active: true,
  },
];

function generateChartData(filter: ReportFilter) {
  const days = filter.dateRange === '7d' ? 7 : filter.dateRange === '30d' ? 30 : filter.dateRange === '90d' ? 90 : 30;
  return Array.from({ length: Math.min(days, 12) }, (_, i) => ({
    label: `Week ${i + 1}`,
    newLeads: Math.floor(20 + Math.random() * 40),
    qualified: Math.floor(10 + Math.random() * 20),
    closed: Math.floor(2 + Math.random() * 8),
    avgScore: Math.floor(55 + Math.random() * 30),
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MultiSelect({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg text-sm text-gray-300 hover:border-[#3b82f6] transition-colors min-w-[140px]"
      >
        <span className="flex-1 text-left">{selected.length ? `${label} (${selected.length})` : label}</span>
        <ChevronDown className="w-3 h-3 text-gray-500" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-xl min-w-[180px] py-1">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2 hover:bg-[#2a3142] cursor-pointer text-sm text-gray-300">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="accent-[#3b82f6]" />
              {opt}
            </label>
          ))}
          {selected.length > 0 && (
            <button onClick={() => { onChange([]); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-[#2a3142] border-t border-[#2a3142]">
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdvancedReportsPage() {
  const [activeTab, setActiveTab] = useState<'builder' | 'templates' | 'scheduled'>('builder');
  const [filter, setFilter] = useState<ReportFilter>(defaultFilter);
  const [templates, setTemplates] = useState<SavedTemplate[]>(mockTemplates);
  const [schedules, setSchedules] = useState<ScheduledExport[]>(mockSchedules);
  const [chartData, setChartData] = useState(() => generateChartData(defaultFilter));
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [scheduleFreq, setScheduleFreq] = useState<'weekly' | 'monthly'>('weekly');
  const [scheduleRecipients, setScheduleRecipients] = useState('');
  const [scheduleFormat, setScheduleFormat] = useState<'csv' | 'pdf'>('csv');
  const [scheduleDay, setScheduleDay] = useState(1);
  const [runningReport, setRunningReport] = useState(false);
  const [reportRan, setReportRan] = useState(false);
  const [selectedTemplateForSchedule, setSelectedTemplateForSchedule] = useState<string>('');

  const updateFilter = useCallback((patch: Partial<ReportFilter>) => {
    setFilter(prev => ({ ...prev, ...patch }));
    setReportRan(false);
  }, []);

  const runReport = useCallback(() => {
    setRunningReport(true);
    setTimeout(() => {
      setChartData(generateChartData(filter));
      setRunningReport(false);
      setReportRan(true);
    }, 900);
  }, [filter]);

  const saveTemplate = useCallback(() => {
    if (!newTemplateName.trim()) return;
    const tpl: SavedTemplate = {
      id: `tpl-${Date.now()}`,
      name: newTemplateName,
      description: newTemplateDesc,
      filters: { ...filter },
      createdAt: new Date().toISOString().slice(0, 10),
      lastRun: null,
      reportType: 'custom',
    };
    setTemplates(prev => [tpl, ...prev]);
    setSaveModalOpen(false);
    setNewTemplateName('');
    setNewTemplateDesc('');
  }, [newTemplateName, newTemplateDesc, filter]);

  const loadTemplate = useCallback((tpl: SavedTemplate) => {
    setFilter(tpl.filters);
    setActiveTab('builder');
    setReportRan(false);
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  const createSchedule = useCallback(() => {
    const tpl = templates.find(t => t.id === selectedTemplateForSchedule);
    if (!tpl) return;
    const recipientList = scheduleRecipients.split(',').map(r => r.trim()).filter(Boolean);
    const sch: ScheduledExport = {
      id: `sch-${Date.now()}`,
      templateId: tpl.id,
      templateName: tpl.name,
      frequency: scheduleFreq,
      dayOfWeek: scheduleFreq === 'weekly' ? scheduleDay : undefined,
      dayOfMonth: scheduleFreq === 'monthly' ? scheduleDay : undefined,
      recipients: recipientList,
      format: scheduleFormat,
      nextRun: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      active: true,
    };
    setSchedules(prev => [sch, ...prev]);
    setScheduleModalOpen(false);
    setScheduleRecipients('');
  }, [selectedTemplateForSchedule, scheduleFreq, scheduleDay, scheduleRecipients, scheduleFormat, templates]);

  const toggleSchedule = useCallback((id: string) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  }, []);

  const deleteSchedule = useCallback((id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
  }, []);

  const kpis = [
    { label: 'Total Leads', value: chartData.reduce((a, d) => a + d.newLeads, 0), icon: Users, color: 'text-blue-400' },
    { label: 'Qualified', value: chartData.reduce((a, d) => a + d.qualified, 0), icon: TrendingUp, color: 'text-emerald-400' },
    { label: 'Closed', value: chartData.reduce((a, d) => a + d.closed, 0), icon: CheckCircle, color: 'text-violet-400' },
    { label: 'Avg Score', value: Math.round(chartData.reduce((a, d) => a + d.avgScore, 0) / chartData.length), icon: Star, color: 'text-amber-400' },
  ];

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0d1117] text-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Icon icon={BarChart2} className="w-6 h-6 text-blue-400" />
              Advanced Reports
            </h1>
            <p className="text-gray-400 text-sm mt-1">Custom filters, saved templates, and scheduled email exports</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSaveModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg text-sm text-gray-300 hover:border-blue-500 transition-colors"
            >
              <Save className="w-4 h-4" /> Save Template
            </button>
            <button
              onClick={() => { setSelectedTemplateForSchedule(templates[0]?.id ?? ''); setScheduleModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg text-sm text-gray-300 hover:border-violet-500 transition-colors"
            >
              <Clock className="w-4 h-4" /> Schedule Export
            </button>
            <button
              onClick={runReport}
              disabled={runningReport}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {runningReport ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run Report
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#1a1f2e] rounded-lg p-1 w-fit">
          {(['builder', 'templates', 'scheduled'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {tab === 'builder' ? 'Report Builder' : tab === 'templates' ? 'Saved Templates' : 'Scheduled Exports'}
            </button>
          ))}
        </div>

        {/* ── Report Builder ── */}
        {activeTab === 'builder' && (
          <div className="space-y-6">
            {/* Filter Panel */}
            <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-white">Filters</span>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                {/* Date Range */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date Range</label>
                  <select
                    value={filter.dateRange}
                    onChange={e => updateFilter({ dateRange: e.target.value as ReportFilter['dateRange'] })}
                    className="px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="90d">Last 90 Days</option>
                    <option value="mtd">Month to Date</option>
                    <option value="ytd">Year to Date</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                {filter.dateRange === 'custom' && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                      <input type="date" value={filter.startDate} onChange={e => updateFilter({ startDate: e.target.value })}
                        className="px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End Date</label>
                      <input type="date" value={filter.endDate} onChange={e => updateFilter({ endDate: e.target.value })}
                        className="px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
                    </div>
                  </>
                )}
                {/* Lead Sources */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Lead Source</label>
                  <MultiSelect label="All Sources" options={LEAD_SOURCES} selected={filter.leadSources} onChange={v => updateFilter({ leadSources: v })} />
                </div>
                {/* Stages */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Stage</label>
                  <MultiSelect label="All Stages" options={STAGES} selected={filter.stages} onChange={v => updateFilter({ stages: v })} />
                </div>
                {/* Agents */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Agent</label>
                  <MultiSelect label="All Agents" options={AGENTS} selected={filter.agents} onChange={v => updateFilter({ agents: v })} />
                </div>
                {/* Score Range */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Score Range</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={100} value={filter.scoreMin} onChange={e => updateFilter({ scoreMin: Number(e.target.value) })}
                      className="w-16 px-2 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
                    <span className="text-gray-500 text-xs">–</span>
                    <input type="number" min={0} max={100} value={filter.scoreMax} onChange={e => updateFilter({ scoreMax: Number(e.target.value) })}
                      className="w-16 px-2 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                {/* Reset */}
                <button onClick={() => { setFilter(defaultFilter); setReportRan(false); }}
                  className="flex items-center gap-1 px-3 py-2 text-xs text-gray-400 hover:text-white border border-[#2a3142] rounded-lg hover:border-gray-500 transition-colors">
                  <X className="w-3 h-3" /> Reset
                </button>
              </div>
            </div>

            {/* KPI Strip */}
            {reportRan && (
              <div className="grid grid-cols-4 gap-4">
                {kpis.map(k => (
                  <div key={k.label} className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#0d1117] flex items-center justify-center">
                      <Icon icon={k.icon} className={`w-5 h-5 ${k.color}`} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{k.label}</p>
                      <p className="text-xl font-bold text-white">{k.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Charts */}
            {reportRan && (
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Lead Volume by Period</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3142" />
                      <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid #2a3142', borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="newLeads" name="New" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="qualified" name="Qualified" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="closed" name="Closed" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Avg Lead Score Trend</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3142" />
                      <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid #2a3142', borderRadius: 8 }} />
                      <Line type="monotone" dataKey="avgScore" name="Avg Score" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {!reportRan && (
              <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-12 flex flex-col items-center justify-center text-center">
                <BarChart2 className="w-12 h-12 text-gray-600 mb-3" />
                <p className="text-gray-400 font-medium">Configure your filters and click <strong className="text-white">Run Report</strong></p>
                <p className="text-gray-600 text-sm mt-1">Results will appear here with charts and KPI summaries</p>
              </div>
            )}
          </div>
        )}

        {/* ── Saved Templates ── */}
        {activeTab === 'templates' && (
          <div className="space-y-4">
            {templates.length === 0 && (
              <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-10 text-center">
                <FileText className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No saved templates yet. Build a report and click Save Template.</p>
              </div>
            )}
            {templates.map(tpl => (
              <div key={tpl.id} className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-5 flex items-center justify-between hover:border-blue-500/40 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{tpl.name}</p>
                    <p className="text-sm text-gray-400 mt-0.5">{tpl.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>Created {tpl.createdAt}</span>
                      {tpl.lastRun && <span>Last run {tpl.lastRun}</span>}
                      <span className="px-2 py-0.5 bg-[#0d1117] rounded-full capitalize">{tpl.reportType}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => loadTemplate(tpl)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg text-xs hover:bg-blue-600/30 transition-colors">
                    <Play className="w-3 h-3" /> Load & Run
                  </button>
                  <button onClick={() => { setSelectedTemplateForSchedule(tpl.id); setScheduleModalOpen(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 text-violet-400 rounded-lg text-xs hover:bg-violet-600/30 transition-colors">
                    <Clock className="w-3 h-3" /> Schedule
                  </button>
                  <button onClick={() => deleteTemplate(tpl.id)}
                    className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Scheduled Exports ── */}
        {activeTab === 'scheduled' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => { setSelectedTemplateForSchedule(templates[0]?.id ?? ''); setScheduleModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" /> New Schedule
              </button>
            </div>
            {schedules.length === 0 && (
              <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-10 text-center">
                <Clock className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No scheduled exports yet.</p>
              </div>
            )}
            {schedules.map(sch => (
              <div key={sch.id} className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${sch.active ? 'bg-emerald-500/10' : 'bg-gray-700/30'}`}>
                      <Mail className={`w-5 h-5 ${sch.active ? 'text-emerald-400' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white">{sch.templateName}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sch.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700/50 text-gray-500'}`}>
                          {sch.active ? 'Active' : 'Paused'}
                        </span>
                        <span className="px-2 py-0.5 bg-[#0d1117] rounded-full text-xs text-gray-400 uppercase">{sch.format}</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5">
                        {sch.frequency === 'weekly' ? `Every week (day ${sch.dayOfWeek})` : `Monthly on day ${sch.dayOfMonth}`}
                        {' · '}Next: <span className="text-white">{sch.nextRun}</span>
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {sch.recipients.map(r => (
                          <span key={r} className="px-2 py-0.5 bg-[#0d1117] border border-[#2a3142] rounded-full text-xs text-gray-400">{r}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleSchedule(sch.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sch.active ? 'bg-gray-700/50 text-gray-400 hover:bg-gray-700' : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'}`}>
                      {sch.active ? 'Pause' : 'Resume'}
                    </button>
                    <button onClick={() => deleteSchedule(sch.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Save Template Modal ── */}
        {saveModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Save Report Template</h3>
                <button onClick={() => setSaveModalOpen(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Template Name *</label>
                  <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} placeholder="e.g. Monthly Pipeline Summary"
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Description</label>
                  <input value={newTemplateDesc} onChange={e => setNewTemplateDesc(e.target.value)} placeholder="Brief description of this report"
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setSaveModalOpen(false)} className="flex-1 px-4 py-2 border border-[#2a3142] rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                  <button onClick={saveTemplate} disabled={!newTemplateName.trim()}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    Save Template
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Schedule Modal ── */}
        {scheduleModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Schedule Email Export</h3>
                <button onClick={() => setScheduleModalOpen(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Report Template</label>
                  <select value={selectedTemplateForSchedule} onChange={e => setSelectedTemplateForSchedule(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500">
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Frequency</label>
                    <select value={scheduleFreq} onChange={e => setScheduleFreq(e.target.value as 'weekly' | 'monthly')}
                      className="w-full px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500">
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">{scheduleFreq === 'weekly' ? 'Day of Week (1=Mon)' : 'Day of Month'}</label>
                    <input type="number" min={1} max={scheduleFreq === 'weekly' ? 7 : 28} value={scheduleDay} onChange={e => setScheduleDay(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Format</label>
                  <div className="flex gap-2">
                    {(['csv', 'pdf'] as const).map(f => (
                      <button key={f} onClick={() => setScheduleFormat(f)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors uppercase ${scheduleFormat === f ? 'bg-blue-600 text-white' : 'bg-[#0d1117] border border-[#2a3142] text-gray-400 hover:text-white'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Recipients (comma-separated emails)</label>
                  <input value={scheduleRecipients} onChange={e => setScheduleRecipients(e.target.value)}
                    placeholder="admin@example.com, ops@example.com"
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setScheduleModalOpen(false)} className="flex-1 px-4 py-2 border border-[#2a3142] rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                  <button onClick={createSchedule} disabled={!selectedTemplateForSchedule || !scheduleRecipients.trim()}
                    className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    <Send className="w-4 h-4 inline mr-1" /> Create Schedule
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
