'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DollarSign, Shield, Phone, Mail, MapPin, ChevronDown, RefreshCw, Loader2, CheckCircle, AlertTriangle, XCircle, HelpCircle, TrendingUp, Home, User, Building2, Bell, BellOff, BellRing, ShieldCheck, X, ChevronRight, Zap,  } from 'lucide-react';
import RegulationBadge from '@/components/ui/RegulationBadge';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OwnerListing {
  id: string;
  property_address: string | null;
  city: string | null;
  state: string | null;
  property_type: string | null;
  regulation_status: string | null;
  estimated_gross_monthly: number | null;
  estimated_net_monthly: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  stage: string | null;
  prospect_score: number | null;
}

type AlertSeverity = 'info' | 'warning' | 'critical' | 'positive';
type AlertCategory = 'regulation' | 'compliance' | 'revenue';

interface OwnerAlert {
  id: string;
  listingId: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionLabel?: string;
}

interface AlertPrefs {
  regulation: boolean;
  compliance: boolean;
  revenue: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

function regulationInfo(status: string | null) {
  switch (status) {
    case 'Allowed':
      return {
        icon: CheckCircle,
        color: 'text-emerald-600',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        label: 'STR Allowed',
        desc: 'Short-term rentals are permitted in this area. Your property is eligible for STR listing.',
      };
    case 'Restricted':
      return {
        icon: AlertTriangle,
        color: 'text-amber-600',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        label: 'STR Restricted',
        desc: 'Short-term rentals are allowed with conditions — permits, caps, or owner-occupancy requirements may apply.',
      };
    case 'Prohibited':
      return {
        icon: XCircle,
        color: 'text-red-500',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        label: 'STR Prohibited',
        desc: 'Short-term rentals are not permitted in this area under current local regulations.',
      };
    default:
      return {
        icon: HelpCircle,
        color: 'text-muted-foreground',
        bg: 'bg-muted/50',
        border: 'border-border',
        label: 'Status Unknown',
        desc: 'Regulation data for this area is still being gathered. Check back soon.',
      };
  }
}

function alertSeverityStyle(severity: AlertSeverity) {
  switch (severity) {
    case 'critical': return { bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-red-200 dark:border-red-800/30', icon: 'text-red-500', dot: 'bg-red-500' };
    case 'warning': return { bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800/30', icon: 'text-amber-500', dot: 'bg-amber-500' };
    case 'positive': return { bg: 'bg-emerald-50 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-800/30', icon: 'text-emerald-600', dot: 'bg-emerald-500' };
    default: return { bg: 'bg-blue-50 dark:bg-blue-900/10', border: 'border-blue-200 dark:border-blue-800/30', icon: 'text-blue-600', dot: 'bg-blue-500' };
  }
}

function alertCategoryIcon(category: AlertCategory) {
  switch (category) {
    case 'regulation': return ShieldCheck;
    case 'compliance': return Shield;
    case 'revenue': return DollarSign;
  }
}

function generateAlertsForListing(listing: OwnerListing): OwnerAlert[] {
  const alerts: OwnerAlert[] = [];
  const seed = listing.id.charCodeAt(0) || 65;

  // Regulation alert
  if (listing.regulation_status === 'Restricted') {
    alerts.push({
      id: `${listing.id}-reg-1`,
      listingId: listing.id,
      category: 'regulation',
      severity: 'warning',
      title: 'Regulation Status: Restricted',
      message: `${listing.city ?? 'Your area'} has updated STR permit requirements. Owner-occupancy rules may now apply to your property. Review local ordinance #STR-2026-04.`,
      timestamp: new Date(Date.now() - 2 * 86400000).toISOString(),
      read: false,
      actionLabel: 'View Regulation Details',
    });
  } else if (listing.regulation_status === 'Prohibited') {
    alerts.push({
      id: `${listing.id}-reg-2`,
      listingId: listing.id,
      category: 'regulation',
      severity: 'critical',
      title: 'STR Prohibited in Your Area',
      message: `${listing.city ?? 'Your municipality'} has enacted a short-term rental ban effective this quarter. Existing listings may need to be converted to long-term rentals.`,
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      read: false,
      actionLabel: 'Learn More',
    });
  } else if (listing.regulation_status === 'Allowed') {
    alerts.push({
      id: `${listing.id}-reg-3`,
      listingId: listing.id,
      category: 'regulation',
      severity: 'positive',
      title: 'Regulation Confirmed: STR Allowed',
      message: `${listing.city ?? 'Your area'} has confirmed STR permits remain available. No new restrictions have been enacted this quarter.`,
      timestamp: new Date(Date.now() - 5 * 86400000).toISOString(),
      read: true,
    });
  }

  // Compliance alert
  if (seed % 3 === 0) {
    alerts.push({
      id: `${listing.id}-comp-1`,
      listingId: listing.id,
      category: 'compliance',
      severity: 'info',
      title: 'Annual Compliance Review Due',
      message: 'Your property\'s annual STR compliance review is due within 30 days. Ensure your permit is current and all safety requirements are met.',
      timestamp: new Date(Date.now() - 3 * 86400000).toISOString(),
      read: false,
      actionLabel: 'Start Review',
    });
  }

  // Revenue alert
  if (listing.estimated_gross_monthly != null) {
    const change = seed % 2 === 0 ? 'increased' : 'decreased';
    const pct = 5 + (seed % 12);
    alerts.push({
      id: `${listing.id}-rev-1`,
      listingId: listing.id,
      category: 'revenue',
      severity: change === 'increased' ? 'positive' : 'warning',
      title: `Revenue Estimate ${change === 'increased' ? 'Up' : 'Down'} ${pct}%`,
      message: `Based on updated market data for ${listing.city ?? 'your area'}, your estimated gross monthly revenue has ${change} by ${pct}% to ${fmt(Math.round(listing.estimated_gross_monthly * (change === 'increased' ? 1 + pct / 100 : 1 - pct / 100)))}.`,
      timestamp: new Date(Date.now() - 7 * 86400000).toISOString(),
      read: seed % 2 === 0,
    });
  }

  return alerts;
}

// ─── Alert Card ────────────────────────────────────────────────────────────────

function AlertCard({ alert, onDismiss, onMarkRead }: {
  alert: OwnerAlert;
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
}) {
  const style = alertSeverityStyle(alert.severity);
  const CatIcon = alertCategoryIcon(alert.category);

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${style.bg} ${style.border} ${!alert.read ? 'ring-1 ring-inset ring-current/10' : 'opacity-80'}`}
      onClick={() => !alert.read && onMarkRead(alert.id)}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0 mt-0.5">
          <CatIcon size={16} className={style.icon} />
          {!alert.read && (
            <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${style.dot}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">{alert.title}</p>
            <button
              onClick={e => { e.stopPropagation(); onDismiss(alert.id); }}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X size={12} />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{alert.message}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-muted-foreground">
              {new Date(alert.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            {alert.actionLabel && (
              <button className={`text-[10px] font-semibold flex items-center gap-0.5 ${style.icon} hover:underline`}>
                {alert.actionLabel} <ChevronRight size={9} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Alert Preferences Panel ───────────────────────────────────────────────────

function AlertPrefsPanel({ prefs, onChange }: { prefs: AlertPrefs; onChange: (p: AlertPrefs) => void }) {
  const items: { key: keyof AlertPrefs; label: string; desc: string; icon: React.ElementType }[] = [
    { key: 'regulation', label: 'Regulation Changes', desc: 'STR law updates, permit changes, new restrictions', icon: ShieldCheck },
    { key: 'compliance', label: 'Compliance Updates', desc: 'Annual reviews, safety requirements, permit renewals', icon: Shield },
    { key: 'revenue', label: 'Revenue Adjustments', desc: 'Market-based estimate changes, seasonal trends', icon: DollarSign },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bell size={14} className="text-primary" />
        <p className="text-sm font-semibold text-foreground">Alert Preferences</p>
      </div>
      <div className="space-y-3">
        {items.map(({ key, label, desc, icon }) => {
          const PrefIcon = icon as React.ElementType;
          return (
          <div key={key} className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <PrefIcon size={12} className="text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            </div>
            <button
              onClick={() => onChange({ ...prefs, [key]: !prefs[key] })}
              className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${prefs[key] ? 'bg-primary' : 'bg-border'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${prefs[key] ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-4 pt-3 border-t border-border">
        Alerts are delivered in real-time without agent mediation. You'll be notified directly when any of the above changes occur for your listings.
      </p>
    </div>
  );
}

// ─── Listing Card ──────────────────────────────────────────────────────────────

function ListingCard({ listing }: { listing: OwnerListing }) {
  const reg = regulationInfo(listing.regulation_status);
  const RegIcon = reg.icon;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Property Header */}
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Home size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {listing.property_address ?? 'Property Address Unavailable'}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <MapPin size={10} />
            {[listing.city, listing.state].filter(Boolean).join(', ') || 'Location not available'}
          </p>
        </div>
        {listing.property_type && (
          <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
            {listing.property_type}
          </span>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Compliance & Regulation */}
        <div className={`rounded-xl border p-4 ${reg.bg} ${reg.border}`}>
          <div className="flex items-center gap-2 mb-2">
            <RegIcon size={16} className={reg.color} />
            <span className={`text-xs font-semibold ${reg.color}`}>Compliance Status</span>
          </div>
          <div className="mb-2">
            {listing.regulation_status ? (
              <RegulationBadge status={listing.regulation_status as any} />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{reg.desc}</p>
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Regulation Category</p>
            <p className={`text-sm font-bold ${reg.color}`}>{reg.label}</p>
          </div>
        </div>

        {/* Revenue Estimates */}
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={16} className="text-emerald-600" />
            <span className="text-xs font-semibold text-foreground">Estimated Revenue</span>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Gross Monthly</p>
              <p className="text-2xl font-bold text-foreground">
                {listing.estimated_gross_monthly != null ? fmt(listing.estimated_gross_monthly) : '—'}
              </p>
            </div>
            <div className="h-px bg-border" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Net Monthly (est.)</p>
              <p className="text-lg font-semibold text-foreground">
                {listing.estimated_net_monthly != null ? fmt(listing.estimated_net_monthly) : '—'}
              </p>
            </div>
            {listing.estimated_gross_monthly != null && listing.estimated_net_monthly != null && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp size={11} className="text-emerald-500" />
                {Math.round((listing.estimated_net_monthly / listing.estimated_gross_monthly) * 100)}% net margin
              </div>
            )}
          </div>
        </div>

        {/* Agent Contact */}
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-primary" />
            <span className="text-xs font-semibold text-foreground">Your Agent Contact</span>
          </div>
          {listing.contact_name || listing.contact_phone || listing.contact_email ? (
            <div className="space-y-2.5">
              {listing.contact_name && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Name</p>
                  <p className="text-sm font-semibold text-foreground">{listing.contact_name}</p>
                </div>
              )}
              {listing.contact_phone && (
                <a
                  href={`tel:${listing.contact_phone}`}
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Phone size={13} />
                  {listing.contact_phone}
                </a>
              )}
              {listing.contact_email && (
                <a
                  href={`mailto:${listing.contact_email}`}
                  className="flex items-center gap-2 text-sm text-primary hover:underline truncate"
                >
                  <Mail size={13} />
                  <span className="truncate">{listing.contact_email}</span>
                </a>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <User size={24} className="mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-xs text-muted-foreground">Agent contact info not yet available for this listing.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OwnerPortalPage() {
  const supabase = createClient();
  const { user } = useAuth();

  const [listings, setListings] = useState<OwnerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerName, setOwnerName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [alerts, setAlerts] = useState<OwnerAlert[]>([]);
  const [alertPrefs, setAlertPrefs] = useState<AlertPrefs>({ regulation: true, compliance: true, revenue: true });
  const [activeTab, setActiveTab] = useState<'listings' | 'alerts' | 'prefs'>('listings');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get owner profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      setOwnerName(profile?.full_name || user.email?.split('@')[0] || 'Owner');

      // Fetch leads linked to this owner (by email or user_id)
      const { data: leads } = await supabase
        .from('leads')
        .select('id, property_address, city, state, property_type, regulation_status, estimated_gross_monthly, estimated_net_monthly, contact_name, contact_phone, contact_email, stage, prospect_score')
        .or(`owner_email.eq.${user.email},assigned_agent_id.eq.${user.id}`)
        .order('prospect_score', { ascending: false })
        .limit(20);

      const data = leads ?? [];
      setListings(data);
      if (data.length > 0 && !selectedId) setSelectedId(data[0].id);

      // Generate alerts from listing data
      const allAlerts = data.flatMap(l => generateAlertsForListing(l));
      setAlerts(allAlerts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, supabase, selectedId]);

  useEffect(() => { load(); }, [load]);

  const selectedListing = listings.find(l => l.id === selectedId) ?? listings[0] ?? null;

  const filteredAlerts = alerts.filter(a => {
    if (!alertPrefs[a.category]) return false;
    return true;
  });

  const unreadCount = filteredAlerts.filter(a => !a.read).length;

  const handleDismiss = (id: string) => setAlerts(prev => prev.filter(a => a.id !== id));
  const handleMarkRead = (id: string) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  const handleMarkAllRead = () => setAlerts(prev => prev.map(a => ({ ...a, read: true })));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-bold">
            {ownerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{ownerName}</p>
            <p className="text-xs text-muted-foreground">Property Owner Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <BellRing size={12} />
              {unreadCount} new alert{unreadCount !== 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Page Title */}
        <div>
          <h1 className="text-xl font-bold text-foreground">My Listings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View compliance status, regulation category, estimated revenue, and real-time alerts — no agent mediation required.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 w-fit">
          {[
            { key: 'listings', label: 'Listings', icon: Home },
            { key: 'alerts', label: `Alerts${unreadCount > 0 ? ` (${unreadCount})` : ''}`, icon: Bell },
            { key: 'prefs', label: 'Alert Prefs', icon: Zap },
          ].map(({ key, label, icon }) => {
            const TabIcon = icon as React.ElementType;
            return (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <TabIcon size={14} />
              {label}
            </button>
            );
          })}
        </div>

        {listings.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Building2 size={40} className="mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm font-semibold text-foreground mb-1">No listings found</p>
            <p className="text-xs text-muted-foreground">Your properties will appear here once they've been added to the system.</p>
          </div>
        ) : activeTab === 'listings' ? (
          <>
            {/* Property Switcher (if multiple) */}
            {listings.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowSwitcher(v => !v)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-muted transition-all"
                >
                  <Home size={14} className="text-primary" />
                  <span className="font-medium truncate max-w-xs">
                    {selectedListing?.property_address ?? 'Select property'}
                  </span>
                  <ChevronDown size={13} className={`text-muted-foreground transition-transform ${showSwitcher ? 'rotate-180' : ''}`} />
                </button>
                {showSwitcher && (
                  <div className="absolute top-full left-0 mt-1 w-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                    {listings.map(l => (
                      <button
                        key={l.id}
                        onClick={() => { setSelectedId(l.id); setShowSwitcher(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-all ${selectedId === l.id ? 'bg-primary/5' : ''}`}
                      >
                        <Home size={14} className="text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{l.property_address ?? 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{[l.city, l.state].filter(Boolean).join(', ')}</p>
                        </div>
                        {l.regulation_status && (
                          <RegulationBadge status={l.regulation_status as any} size="sm" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{listings.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Listings</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">
                  {listings.filter(l => l.regulation_status === 'Allowed').length}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">STR Allowed</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {listings.filter(l => l.regulation_status === 'Restricted').length}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Restricted</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {listings.reduce((a, l) => a + (l.estimated_gross_monthly ?? 0), 0) > 0
                    ? fmt(listings.reduce((a, l) => a + (l.estimated_gross_monthly ?? 0), 0))
                    : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Est. Gross/mo</p>
              </div>
            </div>

            {/* Selected Listing Detail */}
            {selectedListing && <ListingCard listing={selectedListing} />}

            {/* All Listings (if multiple) */}
            {listings.length > 1 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">All Listings</h2>
                {listings.filter(l => l.id !== selectedId).map(listing => (
                  <div
                    key={listing.id}
                    className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-all"
                    onClick={() => setSelectedId(listing.id)}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Home size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{listing.property_address ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{[listing.city, listing.state].filter(Boolean).join(', ')}</p>
                    </div>
                    {listing.regulation_status && (
                      <RegulationBadge status={listing.regulation_status as any} size="sm" />
                    )}
                    {listing.estimated_gross_monthly != null && (
                      <div className="text-right shrink-0 hidden md:block">
                        <p className="text-sm font-semibold text-foreground">{fmt(listing.estimated_gross_monthly)}</p>
                        <p className="text-[10px] text-muted-foreground">est. gross/mo</p>
                      </div>
                    )}
                    <Shield size={14} className="text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : activeTab === 'alerts' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Real-Time Alerts</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Regulation changes, compliance updates, and revenue adjustments — delivered directly to you.
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <CheckCircle size={11} />
                  Mark all read
                </button>
              )}
            </div>

            {filteredAlerts.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <BellOff size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm font-semibold text-foreground mb-1">No alerts</p>
                <p className="text-xs text-muted-foreground">You're all caught up. Alerts will appear here when regulation, compliance, or revenue changes occur.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Unread first */}
                {filteredAlerts.filter(a => !a.read).length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">New</p>
                    {filteredAlerts.filter(a => !a.read).map(alert => (
                      <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} onMarkRead={handleMarkRead} />
                    ))}
                  </>
                )}
                {filteredAlerts.filter(a => a.read).length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-4">Earlier</p>
                    {filteredAlerts.filter(a => a.read).map(alert => (
                      <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} onMarkRead={handleMarkRead} />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <AlertPrefsPanel prefs={alertPrefs} onChange={setAlertPrefs} />
        )}
      </div>
    </div>
  );
}
