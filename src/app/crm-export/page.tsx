'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Download, Upload, CheckCircle2, AlertCircle, Loader2, RefreshCw, Filter, ChevronDown, ChevronUp, ExternalLink, Phone, MapPin, Users, Database, Zap, X } from 'lucide-react';
import { toast } from 'sonner';

interface Lead {
  id: string;
  address?: string;
  city?: string;
  state?: string;
  stage?: string;
  prospect_score?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  estimated_net_monthly?: number;
  last_contact_date?: string;
  dnc_flagged?: boolean;
  tcpa_risk?: string;
  recording_consent?: string;
  enrichment_status?: string;
  created_at?: string;
  user_id?: string;
}

interface ExportResult {
  leadId: string;
  address: string;
  status: 'success' | 'error' | 'skipped';
  hubspotId?: string;
  error?: string;
}

const QUALIFIED_STAGES = ['Qualified', 'Proposal', 'Negotiation', 'Closed'];

const STAGE_COLORS: Record<string, string> = {
  Qualified: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Proposal: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Negotiation: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Closed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

export default function CrmExportPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stageFilter, setStageFilter] = useState<string[]>([...QUALIFIED_STAGES]);
  const [exporting, setExporting] = useState(false);
  const [exportMode, setExportMode] = useState<'hubspot' | 'csv' | null>(null);
  const [results, setResults] = useState<ExportResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [expandedFilters, setExpandedFilters] = useState(false);
  const [includeCompliance, setIncludeCompliance] = useState(true);
  const [includeEnrichment, setIncludeEnrichment] = useState(true);
  const [onlyClean, setOnlyClean] = useState(false);

  const loadLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('leads')
        .select('id, address, city, state, stage, prospect_score, contact_name, contact_phone, contact_email, estimated_net_monthly, last_contact_date, dnc_flagged, tcpa_risk, recording_consent, enrichment_status, created_at')
        .eq('user_id', user.id)
        .in('stage', QUALIFIED_STAGES)
        .order('prospect_score', { ascending: false });
      setLeads(data || []);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const filteredLeads = leads.filter(l => {
    if (!stageFilter.includes(l.stage || '')) return false;
    if (onlyClean && l.dnc_flagged) return false;
    return true;
  });

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map(l => l.id)));
    }
  }

  function toggleStageFilter(stage: string) {
    setStageFilter(prev =>
      prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]
    );
  }

  const selectedLeads = filteredLeads.filter(l => selectedIds.has(l.id));

  async function handleHubSpotExport() {
    if (selectedLeads.length === 0) { toast.error('Select at least one lead'); return; }
    setExporting(true);
    setExportMode('hubspot');
    setResults([]);
    setShowResults(true);

    const apiKey = process.env.NEXT_PUBLIC_HUBSPOT_API_KEY;
    if (!apiKey) {
      toast.error('HubSpot API key not configured');
      setExporting(false);
      return;
    }

    const newResults: ExportResult[] = [];

    for (const lead of selectedLeads) {
      try {
        const properties: Record<string, string> = {
          firstname: lead.contact_name?.split(' ')[0] || 'Unknown',
          lastname: lead.contact_name?.split(' ').slice(1).join(' ') || '',
          address: lead.address || '',
          city: lead.city || '',
          state: lead.state || '',
          hs_lead_status: 'QUALIFIED',
          lifecyclestage: 'salesqualifiedlead',
        };

        if (lead.contact_phone) properties.phone = lead.contact_phone;
        if (lead.contact_email) properties.email = lead.contact_email;
        if (lead.prospect_score) properties.hubspotscore = String(lead.prospect_score);
        if (lead.estimated_net_monthly) properties.annualrevenue = String(lead.estimated_net_monthly * 12);

        if (includeCompliance) {
          if (lead.dnc_flagged !== undefined) properties.message = `DNC: ${lead.dnc_flagged ? 'Flagged' : 'Clean'} | TCPA Risk: ${lead.tcpa_risk || 'Unknown'} | Recording Consent: ${lead.recording_consent || 'Unknown'}`;
        }

        if (includeEnrichment && lead.enrichment_status) {
          properties.message = (properties.message ? properties.message + ' | ' : '') + `Enrichment: ${lead.enrichment_status}`;
        }

        if (lead.last_contact_date) {
          properties.notes_last_contacted = String(new Date(lead.last_contact_date).getTime());
        }

        const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ properties }),
        });

        if (res.ok) {
          const data = await res.json();
          newResults.push({ leadId: lead.id, address: lead.address || lead.id, status: 'success', hubspotId: data.id });
        } else {
          const err = await res.json();
          // If contact already exists, try to update
          if (err.category === 'CONFLICT' && err.message?.includes('already exists')) {
            newResults.push({ leadId: lead.id, address: lead.address || lead.id, status: 'skipped', error: 'Contact already exists in HubSpot' });
          } else {
            newResults.push({ leadId: lead.id, address: lead.address || lead.id, status: 'error', error: err.message || 'Unknown error' });
          }
        }
      } catch (e) {
        newResults.push({ leadId: lead.id, address: lead.address || lead.id, status: 'error', error: 'Network error' });
      }

      setResults([...newResults]);
    }

    setExporting(false);
    const success = newResults.filter(r => r.status === 'success').length;
    const skipped = newResults.filter(r => r.status === 'skipped').length;
    const errors = newResults.filter(r => r.status === 'error').length;
    toast.success(`Export complete: ${success} created, ${skipped} skipped, ${errors} errors`);
  }

  function handleCsvExport() {
    if (selectedLeads.length === 0) { toast.error('Select at least one lead'); return; }

    const headers = [
      'Address', 'City', 'State', 'Stage', 'Score', 'Contact Name',
      'Phone', 'Email', 'Est. Monthly Revenue', 'Last Contact Date',
      ...(includeCompliance ? ['DNC Flagged', 'TCPA Risk', 'Recording Consent'] : []),
      ...(includeEnrichment ? ['Enrichment Status'] : []),
    ];

    const rows = selectedLeads.map(l => [
      l.address || '',
      l.city || '',
      l.state || '',
      l.stage || '',
      l.prospect_score || '',
      l.contact_name || '',
      l.contact_phone || '',
      l.contact_email || '',
      l.estimated_net_monthly || '',
      l.last_contact_date ? new Date(l.last_contact_date).toLocaleDateString() : '',
      ...(includeCompliance ? [l.dnc_flagged ? 'Yes' : 'No', l.tcpa_risk || '', l.recording_consent || ''] : []),
      ...(includeEnrichment ? [l.enrichment_status || ''] : []),
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qualified-leads-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selectedLeads.length} leads to CSV`);
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">CRM Export</h1>
              <p className="text-xs text-muted-foreground">Push qualified leads to HubSpot or download as CSV</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadLeads} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Refresh">
              <RefreshCw size={14} className="text-muted-foreground" />
            </button>
            <button
              onClick={() => setExpandedFilters(p => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <Filter size={12} />
              Filters
              {expandedFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </div>

        {/* Filters */}
        {expandedFilters && (
          <div className="px-6 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Stage:</span>
              {QUALIFIED_STAGES.map(s => (
                <button
                  key={s}
                  onClick={() => toggleStageFilter(s)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-all ${stageFilter.includes(s) ? (STAGE_COLORS[s] || 'bg-primary/10 text-primary border-primary/20') : 'bg-transparent text-muted-foreground border-border'}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={includeCompliance} onChange={e => setIncludeCompliance(e.target.checked)} className="rounded" />
                Include compliance flags
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={includeEnrichment} onChange={e => setIncludeEnrichment(e.target.checked)} className="rounded" />
                Include enrichment data
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={onlyClean} onChange={e => setOnlyClean(e.target.checked)} className="rounded" />
                DNC-clean only
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Lead List */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Selection bar */}
            <div className="flex items-center justify-between px-6 py-2.5 border-b border-border bg-card/50 shrink-0">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredLeads.length && filteredLeads.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${filteredLeads.length} leads`}
                  </span>
                </label>
                {selectedIds.size > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {selectedIds.size} ready to export
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCsvExport}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Download size={12} />
                  CSV Download
                </button>
                <button
                  onClick={handleHubSpotExport}
                  disabled={selectedIds.size === 0 || exporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {exporting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  Push to HubSpot
                </button>
              </div>
            </div>

            {/* Lead table */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Users size={20} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">No qualified leads found</p>
                    <p className="text-xs text-muted-foreground mt-1">Leads at Qualified stage or above will appear here</p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b border-border z-10">
                    <tr>
                      <th className="w-8 px-4 py-2.5 text-left"></th>
                      <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Property</th>
                      <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Contact</th>
                      <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Stage</th>
                      <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Score</th>
                      <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Last Contact</th>
                      <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Compliance</th>
                      <th className="px-3 py-2.5 text-left text-muted-foreground font-medium">Enrichment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map(lead => (
                      <tr
                        key={lead.id}
                        className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${selectedIds.has(lead.id) ? 'bg-primary/5' : ''}`}
                      >
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-start gap-1.5">
                            <MapPin size={11} className="text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                              <p className="font-medium text-foreground truncate max-w-[180px]">{lead.address || '—'}</p>
                              <p className="text-muted-foreground">{[lead.city, lead.state].filter(Boolean).join(', ')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div>
                            <p className="font-medium text-foreground">{lead.contact_name || '—'}</p>
                            {lead.contact_phone && (
                              <p className="text-muted-foreground flex items-center gap-1">
                                <Phone size={9} /> {lead.contact_phone}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${STAGE_COLORS[lead.stage || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                            {lead.stage || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${lead.prospect_score || 0}%` }}
                              />
                            </div>
                            <span className="text-foreground font-medium">{lead.prospect_score || 0}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {lead.last_contact_date
                            ? new Date(lead.last_contact_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            {lead.dnc_flagged ? (
                              <span className="flex items-center gap-0.5 text-[10px] text-red-400">
                                <AlertCircle size={9} /> DNC
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                                <CheckCircle2 size={9} /> Clean
                              </span>
                            )}
                            {lead.tcpa_risk && lead.tcpa_risk !== 'low' && (
                              <span className={`text-[10px] px-1 rounded ${lead.tcpa_risk === 'critical' ? 'bg-red-500/10 text-red-400' : lead.tcpa_risk === 'high' ? 'bg-orange-500/10 text-orange-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                TCPA {lead.tcpa_risk}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${lead.enrichment_status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : lead.enrichment_status === 'partial' ? 'bg-amber-500/10 text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                            {lead.enrichment_status || 'none'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Results Panel */}
          {showResults && (
            <div className="w-80 border-l border-border flex flex-col bg-card shrink-0">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-orange-400" />
                  <span className="text-sm font-semibold text-foreground">HubSpot Export</span>
                </div>
                <button onClick={() => setShowResults(false)} className="p-1 rounded hover:bg-muted transition-colors">
                  <X size={14} className="text-muted-foreground" />
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 p-3 border-b border-border">
                <div className="text-center">
                  <p className="text-lg font-bold text-emerald-400">{successCount}</p>
                  <p className="text-[10px] text-muted-foreground">Created</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-amber-400">{skippedCount}</p>
                  <p className="text-[10px] text-muted-foreground">Skipped</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-red-400">{errorCount}</p>
                  <p className="text-[10px] text-muted-foreground">Errors</p>
                </div>
              </div>

              {exporting && (
                <div className="px-4 py-2 border-b border-border">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 size={12} className="animate-spin" />
                    Processing {results.length} of {selectedLeads.length}...
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-orange-500 transition-all duration-300"
                      style={{ width: `${(results.length / selectedLeads.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${r.status === 'success' ? 'bg-emerald-500/5 border border-emerald-500/10' : r.status === 'skipped' ? 'bg-amber-500/5 border border-amber-500/10' : 'bg-red-500/5 border border-red-500/10'}`}>
                    {r.status === 'success' ? (
                      <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                    ) : r.status === 'skipped' ? (
                      <AlertCircle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                    ) : (
                      <X size={12} className="text-red-400 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{r.address}</p>
                      {r.hubspotId && (
                        <p className="text-muted-foreground">ID: {r.hubspotId}</p>
                      )}
                      {r.error && (
                        <p className="text-red-400/80">{r.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!exporting && results.length > 0 && (
                <div className="p-3 border-t border-border">
                  <a
                    href="https://app.hubspot.com/contacts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 transition-colors"
                  >
                    <ExternalLink size={12} />
                    View in HubSpot
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
