'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { cityRegulations } from '@/data/regulations';
import { Shield, CheckCircle2, XCircle, AlertCircle, RefreshCw, Search, Clock, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface Lead {
  id: string;
  address: string;
  city: string;
  state: string;
  property_type?: string;
  portfolio?: string;
  price?: number;
  beds?: number;
}

interface PropertyScreening {
  id: string;
  lead_id: string;
  screening_status: string;
  regulation_status: string;
  regulation_notes: string | null;
  regulation_flags: string[];
  str_permit_required: boolean | null;
  known_restricted_zone: boolean;
  demand_score: number | null;
  occupancy_potential: string | null;
  seasonality: string | null;
  demand_notes: string | null;
  estimated_adr: number | null;
  estimated_occupancy_rate: number | null;
  estimated_gross_monthly: number | null;
  estimated_net_monthly: number | null;
  lease_acquisition_cost: number | null;
  economics_viable: boolean | null;
  economics_notes: string | null;
  screening_reasons: string[];
  screened_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  viable: { label: 'Viable', cls: 'bg-success/10 text-success border-success/20', icon: <CheckCircle2 size={11} /> },
  needs_review: { label: 'Needs Review', cls: 'bg-warning/10 text-warning border-warning/20', icon: <AlertCircle size={11} /> },
  rejected: { label: 'Rejected', cls: 'bg-danger/10 text-danger border-danger/20', icon: <XCircle size={11} /> },
  pending: { label: 'Pending', cls: 'bg-muted text-muted-foreground border-border', icon: <Clock size={11} /> },
};

function ScreeningBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

export default function PropertyScreeningPage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [screenings, setScreenings] = useState<Record<string, PropertyScreening>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [screeningLead, setScreeningLead] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PropertyScreening>>({});
  const [showForm, setShowForm] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [leadsRes, screeningsRes] = await Promise.all([
      supabase.from('leads').select('id, address, city, state, property_type, portfolio, price, beds').not('address', 'is', null).order('created_at', { ascending: false }).limit(100),
      supabase.from('property_screenings').select('*'),
    ]);
    if (leadsRes.data) setLeads(leadsRes.data);
    if (screeningsRes.data) {
      const map: Record<string, PropertyScreening> = {};
      screeningsRes.data.forEach(s => { map[s.lead_id] = s; });
      setScreenings(map);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const autoScreen = useCallback((lead: Lead): Partial<PropertyScreening> => {
    const reg = cityRegulations.find(r =>
      r.city.toLowerCase() === lead.city?.toLowerCase() && r.state.toUpperCase() === lead.state?.toUpperCase()
    );

    const regulationFlags: string[] = [];
    let regulationStatus = 'unknown';
    let screeningStatus = 'needs_review';
    const reasons: string[] = [];

    if (reg) {
      regulationStatus = reg.status === 'Allowed' ? 'allowed' : reg.status === 'Restricted' ? 'restricted' : 'prohibited';
      if (reg.status === 'Prohibited') {
        regulationFlags.push('STR prohibited in this jurisdiction');
        screeningStatus = 'rejected';
        reasons.push('STR prohibited by local regulation');
      } else if (reg.primaryResidenceOnly) {
        regulationFlags.push('Primary residence only — investment properties not eligible');
        reasons.push('Primary residence requirement may restrict eligibility');
      }
      if (reg.nightCap) regulationFlags.push(`${reg.nightCap}-night annual cap`);
    } else {
      regulationFlags.push('No verified regulation data — manual review required');
      reasons.push('Regulation status unknown — requires research');
    }

    // Basic economics check
    const price = lead.price || 0;
    const estimatedADR = price > 0 ? Math.round(price * 0.0035) : null;
    const estimatedOccupancy = 68;
    const grossMonthly = estimatedADR ? estimatedADR * 30 * (estimatedOccupancy / 100) : null;
    const netMonthly = grossMonthly ? grossMonthly * 0.77 : null;
    const economicsViable = netMonthly && price ? netMonthly > price * 0.9 : null;

    if (economicsViable === false) {
      reasons.push('Economics may not pencil out at current price');
    }

    if (screeningStatus === 'needs_review' && regulationStatus === 'allowed' && economicsViable !== false) {
      screeningStatus = 'viable';
    }

    return {
      regulation_status: regulationStatus,
      regulation_flags: regulationFlags,
      str_permit_required: reg?.permitRequired ?? null,
      known_restricted_zone: reg?.status === 'Prohibited',
      demand_score: 65,
      occupancy_potential: 'moderate',
      seasonality: 'year_round',
      estimated_adr: estimatedADR,
      estimated_occupancy_rate: estimatedOccupancy,
      estimated_gross_monthly: grossMonthly,
      estimated_net_monthly: netMonthly,
      lease_acquisition_cost: price || null,
      economics_viable: economicsViable,
      screening_status: screeningStatus,
      screening_reasons: reasons,
    };
  }, []);

  const handleScreenLead = useCallback(async (lead: Lead) => {
    setScreeningLead(lead.id);
    const autoData = autoScreen(lead);
    setEditForm({ lead_id: lead.id, ...autoData });
    setShowForm(true);
    setScreeningLead(null);
  }, [autoScreen]);

  const handleSaveScreening = useCallback(async () => {
    if (!editForm.lead_id) return;
    const { data, error } = await supabase
      .from('property_screenings')
      .upsert({ ...editForm, screened_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'lead_id' })
      .select()
      .single();
    if (error) { toast.error('Failed to save screening'); return; }
    setScreenings(prev => ({ ...prev, [data.lead_id]: data }));
    toast.success('Screening saved');
    setShowForm(false);
    setEditForm({});
  }, [editForm, supabase]);

  const filteredLeads = leads.filter(l => {
    const screening = screenings[l.id];
    const matchSearch = !searchQuery || l.address?.toLowerCase().includes(searchQuery.toLowerCase()) || l.city?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = filterStatus === 'all' || (screening?.screening_status === filterStatus) || (filterStatus === 'pending' && !screening);
    return matchSearch && matchStatus;
  });

  const counts = {
    viable: Object.values(screenings).filter(s => s.screening_status === 'viable').length,
    needs_review: Object.values(screenings).filter(s => s.screening_status === 'needs_review').length,
    rejected: Object.values(screenings).filter(s => s.screening_status === 'rejected').length,
    pending: leads.filter(l => !screenings[l.id]).length,
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Shield size={20} className="text-primary" />
              Property Screening
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Evaluate regulation, demand, and economics before surfacing leads</p>
          </div>
          <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
            <RefreshCw size={14} />Refresh
          </button>
        </div>

        {/* Status Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(counts).map(([status, count]) => {
            const cfg = STATUS_CONFIG[status];
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
                className={`bg-card border rounded-xl p-4 text-left transition-all ${filterStatus === status ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/30'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-semibold ${cfg?.cls?.split(' ')[1] || 'text-muted-foreground'}`}>{cfg?.label || 'Pending'}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{count}</p>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search properties..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none">
            <option value="all">All Statuses</option>
            <option value="viable">Viable</option>
            <option value="needs_review">Needs Review</option>
            <option value="rejected">Rejected</option>
            <option value="pending">Not Screened</option>
          </select>
        </div>

        {/* Screening Form Modal */}
        {showForm && editForm.lead_id && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Property Screening</h3>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                  <XCircle size={16} />
                </button>
              </div>
              <div className="p-5 space-y-5">
                {/* Screening Status */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-2">Screening Status</label>
                  <div className="flex gap-2 flex-wrap">
                    {['viable', 'needs_review', 'rejected', 'pending'].map(s => (
                      <button
                        key={s}
                        onClick={() => setEditForm(f => ({ ...f, screening_status: s }))}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${editForm.screening_status === s ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                      >
                        {STATUS_CONFIG[s]?.label || s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Regulation */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Regulation</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Regulation Status</label>
                      <select value={editForm.regulation_status || 'unknown'} onChange={e => setEditForm(f => ({ ...f, regulation_status: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none">
                        <option value="allowed">Allowed</option>
                        <option value="restricted">Restricted</option>
                        <option value="prohibited">Prohibited</option>
                        <option value="unknown">Unknown</option>
                        <option value="needs_research">Needs Research</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <input type="checkbox" id="permit_req" checked={editForm.str_permit_required || false} onChange={e => setEditForm(f => ({ ...f, str_permit_required: e.target.checked }))} className="rounded" />
                      <label htmlFor="permit_req" className="text-xs text-foreground">STR Permit Required</label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Regulation Notes</label>
                    <textarea value={editForm.regulation_notes || ''} onChange={e => setEditForm(f => ({ ...f, regulation_notes: e.target.value }))} rows={2} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none resize-none" />
                  </div>
                </div>

                {/* Economics */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Economics (Estimates)</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'estimated_adr', label: 'Est. ADR ($/night)' },
                      { key: 'estimated_occupancy_rate', label: 'Est. Occupancy (%)' },
                      { key: 'estimated_gross_monthly', label: 'Est. Gross Monthly ($)' },
                      { key: 'estimated_net_monthly', label: 'Est. Net Monthly ($)' },
                      { key: 'lease_acquisition_cost', label: 'Lease/Acquisition Cost ($)' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                        <input type="number" value={(editForm as Record<string, unknown>)[key] as string || ''} onChange={e => setEditForm(f => ({ ...f, [key]: parseFloat(e.target.value) || null }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none" />
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-5">
                      <input type="checkbox" id="econ_viable" checked={editForm.economics_viable || false} onChange={e => setEditForm(f => ({ ...f, economics_viable: e.target.checked }))} className="rounded" />
                      <label htmlFor="econ_viable" className="text-xs text-foreground">Economics Viable</label>
                    </div>
                  </div>
                </div>

                {/* Screening Reasons */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Screening Reasons (one per line)</label>
                  <textarea
                    value={(editForm.screening_reasons || []).join('\n')}
                    onChange={e => setEditForm(f => ({ ...f, screening_reasons: e.target.value.split('\n').filter(Boolean) }))}
                    rows={3}
                    placeholder="Enter reasons why this property was flagged or approved..."
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 justify-end pt-2">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                  <button onClick={handleSaveScreening} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">Save Screening</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lead List */}
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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Screening</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Regulation</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Economics</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLeads.slice(0, 50).map(lead => {
                    const screening = screenings[lead.id];
                    return (
                      <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-foreground truncate max-w-[200px]">{lead.address}</p>
                          <p className="text-[11px] text-muted-foreground">{lead.city}, {lead.state}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{lead.property_type || '—'}</td>
                        <td className="px-4 py-3">
                          <ScreeningBadge status={screening?.screening_status || 'pending'} />
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {screening ? (
                            <span className={`text-xs capitalize ${
                              screening.regulation_status === 'allowed' ? 'text-success' :
                              screening.regulation_status === 'prohibited'? 'text-danger' : 'text-warning'
                            }`}>{screening.regulation_status}</span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {screening?.estimated_net_monthly ? (
                            <span className="text-xs text-foreground">${screening.estimated_net_monthly.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo net</span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleScreenLead(lead)}
                            disabled={screeningLead === lead.id}
                            className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                          >
                            {screeningLead === lead.id ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />}
                            {screening ? 'Edit' : 'Screen'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
