'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Radio, CheckCircle2, XCircle, AlertCircle, RefreshCw, Clock, Activity, ChevronDown, ChevronUp, Plus, ExternalLink, Search, MapPin, Tag, AlertTriangle, TrendingDown, TrendingUp, BarChart2, Shield, Zap, Database } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


interface LeadSourceConfig {
  id: string;
  source_name: string;
  source_key: string;
  market: string;
  state: string | null;
  city: string | null;
  filter_url: string | null;
  property_type_filters: string[];
  furnished_required: boolean;
  ingestion_method: string;
  sync_status: string;
  is_active: boolean;
  last_successful_sync: string | null;
  last_attempted_sync: string | null;
  error_status: string | null;
  error_message: string | null;
  records_imported: number;
  notes: string | null;
}

interface MarketSaturation {
  id: string;
  zone: string;
  state: string;
  city: string | null;
  total_str_listings: number;
  active_listings: number;
  avg_occupancy_rate: number;
  saturation_level: string;
  cannibalization_threshold: number;
  threshold_crossed: boolean;
  last_calculated_at: string;
}

interface STRPermitRecord {
  id: string;
  property_address: string;
  city: string;
  state: string;
  permit_status: string;
  denial_reason: string | null;
  application_date: string | null;
  applicant_name: string | null;
  converted_to_lead: boolean;
}

const SOURCE_LOGOS: Record<string, string> = {
  trulia: 'TR',
  rentcom: 'RC',
  realtorcom: 'RL',
  padmapper: 'PM',
  apartmentlist: 'AL',
  dwellsy: 'DW',
  str_permits: 'SP',
  zillow: 'Z',
  hotpads: 'HP',
  craigslist: 'CL',
  apartments: 'A',
};

const SOURCE_COLORS: Record<string, string> = {
  trulia: 'bg-green-100 text-green-700',
  rentcom: 'bg-blue-100 text-blue-700',
  realtorcom: 'bg-red-100 text-red-700',
  padmapper: 'bg-purple-100 text-purple-700',
  apartmentlist: 'bg-orange-100 text-orange-700',
  dwellsy: 'bg-teal-100 text-teal-700',
  str_permits: 'bg-amber-100 text-amber-700',
  zillow: 'bg-blue-100 text-blue-700',
  hotpads: 'bg-pink-100 text-pink-700',
  craigslist: 'bg-violet-100 text-violet-700',
  apartments: 'bg-cyan-100 text-cyan-700',
};

const SATURATION_COLORS: Record<string, string> = {
  healthy: 'text-success bg-success/10 border-success/20',
  moderate: 'text-warning bg-warning/10 border-warning/20',
  saturated: 'text-orange-600 bg-orange-50 border-orange-200',
  critical: 'text-danger bg-danger/10 border-danger/20',
};

const SATURATION_ICONS: Record<string, React.ReactNode> = {
  healthy: <TrendingUp size={12} />,
  moderate: <BarChart2 size={12} />,
  saturated: <TrendingDown size={12} />,
  critical: <AlertTriangle size={12} />,
};

function SyncStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    active: { label: 'Active', cls: 'bg-success/10 text-success border-success/20', icon: <CheckCircle2 size={11} /> },
    error: { label: 'Error', cls: 'bg-danger/10 text-danger border-danger/20', icon: <XCircle size={11} /> },
    paused: { label: 'Paused', cls: 'bg-warning/10 text-warning border-warning/20', icon: <AlertCircle size={11} /> },
    pending: { label: 'Pending', cls: 'bg-muted text-muted-foreground border-border', icon: <Clock size={11} /> },
  };
  const { label, cls, icon } = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      {icon}{label}
    </span>
  );
}

function PermitStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-success/10 text-success border-success/20',
    denied: 'bg-danger/10 text-danger border-danger/20',
    pending: 'bg-warning/10 text-warning border-warning/20',
    expired: 'bg-muted text-muted-foreground border-border',
    revoked: 'bg-orange-100 text-orange-700 border-orange-200',
    unknown: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${map[status] || map.unknown}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function LeadSourcesPage() {
  const supabase = createClient();
  const [sources, setSources] = useState<LeadSourceConfig[]>([]);
  const [saturation, setSaturation] = useState<MarketSaturation[]>([]);
  const [permits, setPermits] = useState<STRPermitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sources' | 'saturation' | 'permits'>('sources');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterState, setFilterState] = useState('all');
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [showAddPermit, setShowAddPermit] = useState(false);
  const [newPermit, setNewPermit] = useState({
    property_address: '', city: '', state: '', permit_status: 'denied',
    denial_reason: '', applicant_name: '', applicant_email: '', applicant_phone: '',
    property_type: '', application_date: '', notes: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sourcesRes, satRes, permitsRes] = await Promise.all([
        supabase.from('lead_source_configs').select('*').order('source_name').order('market'),
        supabase.from('market_saturation').select('*').order('saturation_level'),
        supabase.from('str_permit_records').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      if (sourcesRes.data) setSources(sourcesRes.data);
      if (satRes.data) setSaturation(satRes.data);
      if (permitsRes.data) setPermits(permitsRes.data);
    } catch (err) {
      toast.error('Failed to load lead source data');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleSource = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('lead_source_configs')
      .update({ is_active: !current, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error('Failed to update source'); return; }
    setSources(prev => prev.map(s => s.id === id ? { ...s, is_active: !current } : s));
    toast.success(`Source ${!current ? 'activated' : 'paused'}`);
  };

  const handleAddPermit = async () => {
    if (!newPermit.property_address || !newPermit.city || !newPermit.state) {
      toast.error('Address, city, and state are required');
      return;
    }
    const { error } = await supabase.from('str_permit_records').insert({
      ...newPermit,
      application_date: newPermit.application_date || null,
      source_name: 'STR Permit Records',
    });
    if (error) { toast.error('Failed to add permit record'); return; }
    toast.success('Permit record added');
    setShowAddPermit(false);
    setNewPermit({ property_address: '', city: '', state: '', permit_status: 'denied', denial_reason: '', applicant_name: '', applicant_email: '', applicant_phone: '', property_type: '', application_date: '', notes: '' });
    fetchData();
  };

  const handleConvertToLead = async (permit: STRPermitRecord) => {
    const { error } = await supabase.from('str_permit_records').update({ converted_to_lead: true }).eq('id', permit.id);
    if (error) { toast.error('Failed to convert'); return; }
    toast.success('Marked as converted to lead');
    fetchData();
  };

  const uniqueSources = [...new Set(sources.map(s => s.source_name))];
  const uniqueStates = [...new Set(sources.map(s => s.state).filter(Boolean))];

  const filteredSources = sources.filter(s => {
    const matchSearch = !searchQuery || s.market.toLowerCase().includes(searchQuery.toLowerCase()) || s.source_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSource = filterSource === 'all' || s.source_name === filterSource;
    const matchState = filterState === 'all' || s.state === filterState;
    return matchSearch && matchSource && matchState;
  });

  const groupedSources = filteredSources.reduce<Record<string, LeadSourceConfig[]>>((acc, s) => {
    if (!acc[s.source_name]) acc[s.source_name] = [];
    acc[s.source_name].push(s);
    return acc;
  }, {});

  const totalRecords = sources.reduce((sum, s) => sum + s.records_imported, 0);
  const activeSources = sources.filter(s => s.is_active).length;
  const errorSources = sources.filter(s => s.sync_status === 'error').length;
  const saturatedZones = saturation.filter(z => z.threshold_crossed).length;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Radio size={20} className="text-primary" />
              Lead Sources
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configurable data sources, market saturation, and STR permit records</p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Sources', value: sources.length, sub: `${activeSources} active`, icon: Database, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Records Imported', value: totalRecords.toLocaleString(), sub: 'across all sources', icon: Activity, color: 'text-success', bg: 'bg-success/10' },
            { label: 'Source Errors', value: errorSources, sub: 'need attention', icon: AlertCircle, color: 'text-danger', bg: 'bg-danger/10' },
            { label: 'Saturated Zones', value: saturatedZones, sub: 'threshold crossed', icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
          ].map(({ label, value, sub, icon: Icon, color, bg }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon size={13} className={color} />
                </div>
              </div>
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {[
            { key: 'sources', label: 'Source Configs', icon: Radio },
            { key: 'saturation', label: 'Market Saturation', icon: BarChart2 },
            { key: 'permits', label: 'STR Permits', icon: Shield },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Sources Tab */}
        {activeTab === 'sources' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search markets or sources..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <select
                value={filterSource}
                onChange={e => setFilterSource(e.target.value)}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none"
              >
                <option value="all">All Sources</option>
                {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filterState}
                onChange={e => setFilterState(e.target.value)}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none"
              >
                <option value="all">All States</option>
                {uniqueStates.map(s => <option key={s} value={s!}>{s}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw size={20} className="animate-spin text-primary" />
              </div>
            ) : (
              Object.entries(groupedSources).map(([sourceName, sourceList]) => (
                <div key={sourceName} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedSource(expandedSource === sourceName ? null : sourceName)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${SOURCE_COLORS[sourceList[0]?.source_key] || 'bg-muted text-muted-foreground'}`}>
                        {SOURCE_LOGOS[sourceList[0]?.source_key] || sourceName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-foreground">{sourceName}</p>
                        <p className="text-xs text-muted-foreground">{sourceList.length} market{sourceList.length !== 1 ? 's' : ''} · {sourceList.reduce((s, x) => s + x.records_imported, 0).toLocaleString()} records</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground hidden sm:inline">{sourceList.filter(s => s.is_active).length}/{sourceList.length} active</span>
                      {expandedSource === sourceName ? <ChevronUp size={15} className="text-muted-foreground" /> : <ChevronDown size={15} className="text-muted-foreground" />}
                    </div>
                  </button>

                  {expandedSource === sourceName && (
                    <div className="border-t border-border divide-y divide-border">
                      {sourceList.map(source => (
                        <div key={source.id} className="px-5 py-4">
                          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-foreground">{source.market}</p>
                                <SyncStatusBadge status={source.sync_status} />
                                {!source.is_active && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Paused</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                {source.state && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin size={10} /> {source.state}{source.city ? ` · ${source.city}` : ''}
                                  </span>
                                )}
                                {source.furnished_required && (
                                  <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">Furnished</span>
                                )}
                                {source.property_type_filters?.length > 0 && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Tag size={10} /> {source.property_type_filters.join(', ')}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground capitalize">{source.ingestion_method}</span>
                              </div>
                              {source.filter_url && (
                                <a
                                  href={source.filter_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-primary hover:underline mt-1 truncate max-w-xs"
                                >
                                  <ExternalLink size={10} />
                                  <span className="truncate">{source.filter_url}</span>
                                </a>
                              )}
                              {source.error_message && (
                                <p className="text-xs text-danger mt-1 flex items-center gap-1">
                                  <AlertCircle size={10} /> {source.error_message}
                                </p>
                              )}
                              {source.notes && (
                                <p className="text-xs text-muted-foreground mt-1 italic">{source.notes}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <p className="text-sm font-bold text-foreground">{source.records_imported.toLocaleString()}</p>
                                <p className="text-[10px] text-muted-foreground">records</p>
                              </div>
                              <button
                                onClick={() => handleToggleSource(source.id, source.is_active)}
                                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                                  source.is_active
                                    ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                                }`}
                              >
                                {source.is_active ? 'Pause' : 'Activate'}
                              </button>
                            </div>
                          </div>
                          {(source.last_successful_sync || source.last_attempted_sync) && (
                            <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                              {source.last_successful_sync && (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 size={10} className="text-success" />
                                  Last sync: {new Date(source.last_successful_sync).toLocaleDateString()}
                                </span>
                              )}
                              {source.last_attempted_sync && (
                                <span className="flex items-center gap-1">
                                  <Clock size={10} />
                                  Attempted: {new Date(source.last_attempted_sync).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Market Saturation Tab */}
        {activeTab === 'saturation' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Market Saturation Alerts</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {saturatedZones} zone{saturatedZones !== 1 ? 's have' : ' has'} crossed the occupancy-cannibalization threshold.
                  Assigned agents should deprioritize outreach in these areas and redirect effort to healthier zones.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {saturation.map(zone => (
                <div
                  key={zone.id}
                  className={`bg-card border rounded-xl p-4 ${zone.threshold_crossed ? 'border-danger/30' : 'border-border'}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{zone.zone}</p>
                      <p className="text-xs text-muted-foreground">{zone.state}{zone.city ? ` · ${zone.city}` : ''}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${SATURATION_COLORS[zone.saturation_level] || SATURATION_COLORS.moderate}`}>
                      {SATURATION_ICONS[zone.saturation_level]}
                      {zone.saturation_level.charAt(0).toUpperCase() + zone.saturation_level.slice(1)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Listings</p>
                      <p className="text-lg font-bold text-foreground">{zone.active_listings.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Occupancy</p>
                      <p className="text-lg font-bold text-foreground">{zone.avg_occupancy_rate?.toFixed(1)}%</p>
                    </div>
                  </div>

                  {/* Threshold bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Density vs Threshold</span>
                      <span>{zone.active_listings} / {zone.cannibalization_threshold}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          zone.threshold_crossed ? 'bg-danger' : zone.active_listings / zone.cannibalization_threshold > 0.8 ? 'bg-warning' : 'bg-success'
                        }`}
                        style={{ width: `${Math.min(100, (zone.active_listings / zone.cannibalization_threshold) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {zone.threshold_crossed && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-danger bg-danger/5 rounded-lg px-3 py-2">
                      <AlertTriangle size={11} />
                      <span>Threshold crossed — deprioritize outreach</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STR Permits Tab */}
        {activeTab === 'permits' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 flex-1 mr-4">
                <Shield size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">STR Permit Records as Lead Source</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Especially denial records — these prospects have regulatory motivation and existing compliance research, making them unusually qualified for outreach.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddPermit(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shrink-0"
              >
                <Plus size={14} />
                Add Record
              </button>
            </div>

            {showAddPermit && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Add STR Permit Record</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Property Address *</label>
                    <input
                      type="text"
                      value={newPermit.property_address}
                      onChange={e => setNewPermit(p => ({ ...p, property_address: e.target.value }))}
                      placeholder="123 Main St"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">City *</label>
                    <input type="text" value={newPermit.city} onChange={e => setNewPermit(p => ({ ...p, city: e.target.value }))} placeholder="Denver" className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">State *</label>
                    <input type="text" value={newPermit.state} onChange={e => setNewPermit(p => ({ ...p, state: e.target.value }))} placeholder="CO" className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Permit Status</label>
                    <select value={newPermit.permit_status} onChange={e => setNewPermit(p => ({ ...p, permit_status: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none">
                      <option value="denied">Denied</option>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="expired">Expired</option>
                      <option value="revoked">Revoked</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Applicant Name</label>
                    <input type="text" value={newPermit.applicant_name} onChange={e => setNewPermit(p => ({ ...p, applicant_name: e.target.value }))} placeholder="Jane Smith" className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Applicant Email</label>
                    <input type="email" value={newPermit.applicant_email} onChange={e => setNewPermit(p => ({ ...p, applicant_email: e.target.value }))} placeholder="jane@email.com" className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Denial Reason</label>
                    <input type="text" value={newPermit.denial_reason} onChange={e => setNewPermit(p => ({ ...p, denial_reason: e.target.value }))} placeholder="e.g. Not primary residence, zoning restriction..." className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => setShowAddPermit(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                  <button onClick={handleAddPermit} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">Add Record</button>
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Address</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Denial Reason</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Applicant</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {permits.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                          No permit records yet. Add records to track STR permit applications.
                        </td>
                      </tr>
                    ) : permits.map(permit => (
                      <tr key={permit.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground text-xs">{permit.property_address}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{permit.city}, {permit.state}</td>
                        <td className="px-4 py-3"><PermitStatusBadge status={permit.permit_status} /></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell max-w-[200px] truncate">{permit.denial_reason || '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{permit.applicant_name || '—'}</td>
                        <td className="px-4 py-3">
                          {!permit.converted_to_lead ? (
                            <button
                              onClick={() => handleConvertToLead(permit)}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Zap size={10} /> Convert to Lead
                            </button>
                          ) : (
                            <span className="text-xs text-success flex items-center gap-1">
                              <CheckCircle2 size={10} /> Converted
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
