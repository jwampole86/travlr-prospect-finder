'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { ClipboardList, CheckCircle2, Clock, AlertCircle, XCircle, RefreshCw, Copy, ExternalLink, Search, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface QuestionnaireRecord {
  id: string;
  lead_id: string;
  unique_token: string;
  questionnaire_status: string;
  qualification_result: string | null;
  qualification_reasons: string[];
  homeowner_name: string | null;
  homeowner_email: string | null;
  prefilled_address: string | null;
  prefilled_city: string | null;
  prefilled_state: string | null;
  submitted_at: string | null;
  last_saved_at: string | null;
  created_at: string;
}

interface Lead {
  id: string;
  address: string;
  city: string;
  state: string;
  contact_name: string | null;
  contact_email: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  not_started: { label: 'Not Started', cls: 'bg-muted text-muted-foreground border-border', icon: <Clock size={11} /> },
  in_progress: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700 border-blue-200', icon: <RefreshCw size={11} /> },
  completed: { label: 'Completed', cls: 'bg-success/10 text-success border-success/20', icon: <CheckCircle2 size={11} /> },
  qualified: { label: 'Qualified', cls: 'bg-success/10 text-success border-success/20', icon: <CheckCircle2 size={11} /> },
  needs_review: { label: 'Needs Review', cls: 'bg-warning/10 text-warning border-warning/20', icon: <AlertCircle size={11} /> },
  not_a_fit: { label: 'Not a Fit', cls: 'bg-danger/10 text-danger border-danger/20', icon: <XCircle size={11} /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_started;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

export default function QuestionnairesPage() {
  const supabase = createClient();
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireRecord[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [qRes, lRes] = await Promise.all([
      supabase.from('homeowner_questionnaires').select('*').order('created_at', { ascending: false }),
      supabase.from('leads').select('id, address, city, state, contact_name, contact_email').not('address', 'is', null).order('created_at', { ascending: false }).limit(200),
    ]);
    if (qRes.data) setQuestionnaires(qRes.data);
    if (lRes.data) setLeads(lRes.data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateQuestionnaire = useCallback(async () => {
    if (!selectedLeadId) { toast.error('Please select a lead'); return; }
    const lead = leads.find(l => l.id === selectedLeadId);
    if (!lead) return;

    // Check if one already exists
    const existing = questionnaires.find(q => q.lead_id === selectedLeadId);
    if (existing) {
      toast.error('A questionnaire already exists for this lead');
      return;
    }

    setCreating(true);
    const { data, error } = await supabase
      .from('homeowner_questionnaires')
      .insert({
        lead_id: selectedLeadId,
        questionnaire_status: 'not_started',
        prefilled_address: lead.address,
        prefilled_city: lead.city,
        prefilled_state: lead.state,
        homeowner_name: lead.contact_name,
        homeowner_email: lead.contact_email,
        confirmed_address: lead.address,
      })
      .select()
      .single();

    if (error) { toast.error('Failed to create questionnaire'); setCreating(false); return; }
    toast.success('Questionnaire created');
    setQuestionnaires(prev => [data, ...prev]);
    setShowCreate(false);
    setSelectedLeadId('');
    setCreating(false);
  }, [selectedLeadId, leads, questionnaires, supabase]);

  const handleCopyLink = useCallback((token: string) => {
    const url = `${window.location.origin}/questionnaire?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Questionnaire link copied to clipboard');
  }, []);

  const filteredQuestionnaires = questionnaires.filter(q => {
    const matchSearch = !searchQuery ||
      q.prefilled_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.homeowner_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.homeowner_email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = filterStatus === 'all' || q.questionnaire_status === filterStatus;
    return matchSearch && matchStatus;
  });

  const counts = Object.keys(STATUS_CONFIG).reduce<Record<string, number>>((acc, k) => {
    acc[k] = questionnaires.filter(q => q.questionnaire_status === k).length;
    return acc;
  }, {});

  const leadsWithoutQuestionnaire = leads.filter(l => !questionnaires.find(q => q.lead_id === l.id));

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList size={20} className="text-primary" />
              Homeowner Questionnaires
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage qualification questionnaires for each lead</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> Create Questionnaire
          </button>
        </div>

        {/* Status Summary */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
            <button
              key={status}
              onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
              className={`bg-card border rounded-xl p-3 text-left transition-all ${filterStatus === status ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/30'}`}
            >
              <p className="text-lg font-bold text-foreground">{counts[status] || 0}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{cfg.label}</p>
            </button>
          ))}
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Create New Questionnaire</h3>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Select Lead</label>
              <select
                value={selectedLeadId}
                onChange={e => setSelectedLeadId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none"
              >
                <option value="">— Choose a lead —</option>
                {leadsWithoutQuestionnaire.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.address}{l.city ? `, ${l.city}` : ''}{l.state ? `, ${l.state}` : ''}
                    {l.contact_name ? ` (${l.contact_name})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleCreateQuestionnaire} disabled={creating} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60">
                {creating && <Loader2 size={13} className="animate-spin" />}
                Create & Get Link
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search by address or homeowner..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none">
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Property</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Homeowner</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Submitted</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Reasons</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredQuestionnaires.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        No questionnaires found. Create one to get started.
                      </td>
                    </tr>
                  ) : filteredQuestionnaires.map(q => (
                    <tr key={q.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-foreground truncate max-w-[180px]">{q.prefilled_address || 'Unknown'}</p>
                        <p className="text-[11px] text-muted-foreground">{q.prefilled_city}{q.prefilled_state ? `, ${q.prefilled_state}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-xs text-foreground">{q.homeowner_name || '—'}</p>
                        <p className="text-[11px] text-muted-foreground">{q.homeowner_email || ''}</p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={q.questionnaire_status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {q.submitted_at ? new Date(q.submitted_at).toLocaleDateString() : q.last_saved_at ? `Saved ${new Date(q.last_saved_at).toLocaleDateString()}` : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="max-w-[200px]">
                          {q.qualification_reasons?.slice(0, 2).map((r, i) => (
                            <p key={i} className="text-[11px] text-muted-foreground truncate">{r}</p>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopyLink(q.unique_token)}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                            title="Copy questionnaire link"
                          >
                            <Copy size={10} /> Copy Link
                          </button>
                          <a
                            href={`/questionnaire?token=${q.unique_token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            title="Preview questionnaire"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
