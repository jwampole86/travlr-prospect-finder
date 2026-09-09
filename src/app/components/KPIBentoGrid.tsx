'use client';

import React from 'react';
import Link from 'next/link';
import { Building2, CheckCircle, TrendingUp, Activity, DollarSign, Zap, AlertTriangle, ShieldCheck, UserX, UserCheck, Phone, Crown } from 'lucide-react';

interface CommissionPayout {
  pendingPayout: number;
  nextPayoutDate?: string;
  nextPayoutAmount?: number;
  totalEarnedCurrentPeriod: number;
  totalEarnedLifetime: number;
}

interface KPIBentoGridProps {
  totalLeads: number;
  regulationFriendly: number;
  avgScore: number;
  activeLeads: number;
  actionNeededLeads: number;
  estimatedMonthlyRevenue: number | null;
  highPriority: number;
  /** New live counts */
  fullyVerified?: number;
  unassignedPriority?: number;
  assignedLeads?: number;
  verifiedOwner?: number;
  verifiedNumber?: number;
  phoneAvailable?: number;
  newLeads?: number;
  /** Luxury KPI counts */
  luxuryProspects?: number;
  luxuryFullyVerified?: number;
  luxuryVerifiedNumber?: number;
  luxuryPriority?: number;
  luxuryUnassignedPriority?: number;
  /** Active portfolio count */
  activePortfolios?: number;
  /** When true, hides Live Revenue and shows commission payout card instead */
  isAgentRole?: boolean;
  commissionPayout?: CommissionPayout;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default React.memo(function KPIBentoGrid({
  totalLeads,
  regulationFriendly,
  avgScore,
  activeLeads,
  actionNeededLeads,
  estimatedMonthlyRevenue,
  highPriority,
  fullyVerified = 0,
  unassignedPriority = 0,
  assignedLeads = 0,
  verifiedOwner = 0,
  verifiedNumber = 0,
  phoneAvailable = 0,
  newLeads = 0,
  luxuryProspects = 0,
  luxuryFullyVerified = 0,
  luxuryVerifiedNumber = 0,
  luxuryPriority = 0,
  luxuryUnassignedPriority = 0,
  activePortfolios = 0,
  isAgentRole = false,
  commissionPayout,
}: KPIBentoGridProps) {
  return (
    <div className="space-y-3">
      {/* Top row: 3 pipeline counts */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {/* Total Leads → Prospect Finder / All */}
        <Link
          href="/lead-management"
          className="bg-primary rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[90px] sm:min-h-[100px] hover:opacity-90 transition-opacity cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-primary-foreground/70">
              Total Leads
            </span>
            <div className="p-1.5 rounded-md bg-white/10">
              <Building2 size={13} className="text-primary-foreground" />
            </div>
          </div>
          <div>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold text-primary-foreground leading-none">
              {totalLeads.toLocaleString()}
            </p>
            <p className="text-[10px] text-primary-foreground/70 mt-1">
              {newLeads > 0 ? `+${newLeads.toLocaleString()} new (30d)` : 'All prospects'}
            </p>
          </div>
        </Link>

        {/* Active Pipeline */}
        <Link
          href="/lead-management?stages=Contacted&stages=Interested&stages=Proposal+Sent&stages=Under+Contract"
          className="bg-card rounded-xl border border-border p-4 sm:p-5 flex flex-col justify-between min-h-[90px] sm:min-h-[100px] hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Active Pipeline
            </span>
            <Activity size={13} className="text-primary" />
          </div>
          <div>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold text-foreground leading-none">
              {activeLeads.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Contacted → Under Contract
            </p>
          </div>
        </Link>

        {/* Action Needed */}
        <Link
          href="/lead-management?actionNeeded=true"
          className="bg-warning-bg rounded-xl border border-warning/30 p-4 sm:p-5 flex flex-col justify-between min-h-[90px] sm:min-h-[100px] hover:border-warning/60 transition-all cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-warning/80">
              Action Needed
            </span>
            <AlertTriangle size={13} className="text-warning" />
          </div>
          <div>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold text-warning leading-none">
              {actionNeededLeads.toLocaleString()}
            </p>
            <p className="text-[10px] text-warning/70 mt-1">
              Score ≥ 75, not yet contacted
            </p>
          </div>
        </Link>
      </div>

      {/* Middle row: Fully Verified + Unassigned Priority + Assigned + High Priority */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Fully Verified → Lead Management / Fully Verified */}
        <Link
          href="/lead-management?view=verified-priority&verifiedOnly=true"
          className="bg-card rounded-xl border border-success/30 bg-success-bg p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-success/60 transition-all cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-success/80">
              Fully Verified
            </span>
            <ShieldCheck size={13} className="text-success" />
          </div>
          <div>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold text-success leading-none">
              {fullyVerified.toLocaleString()}
            </p>
            <p className="text-[10px] sm:text-[11px] text-success/70 mt-1">
              Owner + Address + Phone
            </p>
          </div>
        </Link>

        {/* Unassigned Priority → Lead Management / Verified Priority + Unassigned */}
        <Link
          href="/lead-management?scoreMin=75&excludeTerminal=true&assignmentStatus=unassigned"
          className="bg-card rounded-xl border border-destructive/30 p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-destructive/60 hover:bg-destructive/5 transition-all cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-destructive/80">
              Unassigned Priority
            </span>
            <UserX size={13} className="text-destructive" />
          </div>
          <div>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold text-destructive leading-none">
              {unassignedPriority.toLocaleString()}
            </p>
            <p className="text-[10px] sm:text-[11px] text-destructive/70 mt-1">
              High-value, needs agent
            </p>
          </div>
        </Link>

        {/* Assigned → Lead Management / Assigned */}
        <Link
          href="/lead-management?assignmentStatus=assigned"
          className="bg-card rounded-xl border border-border p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Assigned
            </span>
            <UserCheck size={13} className="text-primary" />
          </div>
          <div>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold text-foreground leading-none">
              {assignedLeads.toLocaleString()}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
              With an agent
            </p>
          </div>
        </Link>

        {/* High Priority → Lead Management / Priority */}
        <Link
          href="/lead-management?scoreMin=75&excludeTerminal=true"
          className="bg-card rounded-xl border border-border p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-warning/40 hover:bg-warning/5 transition-all cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              High Priority
            </span>
            <Zap size={13} className="text-warning" />
          </div>
          <div>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold text-foreground leading-none">
              {highPriority.toLocaleString()}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
              Score ≥ 75, not terminal
            </p>
          </div>
        </Link>
      </div>

      {/* Luxury row — only shown when there are luxury prospects */}
      {luxuryProspects > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          {/* Luxury Prospects */}
          <Link
            href="/lead-management?luxury=true"
            className="bg-card rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-amber-500/70 hover:bg-amber-500/10 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Luxury Prospects
              </span>
              <Crown size={13} className="text-amber-500" />
            </div>
            <div>
              <p className="font-mono-data text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400 leading-none">
                {luxuryProspects.toLocaleString()}
              </p>
              <p className="text-[10px] sm:text-[11px] text-amber-600/70 dark:text-amber-400/70 mt-1">
                All luxury properties
              </p>
            </div>
          </Link>

          {/* Luxury Fully Verified */}
          <Link
            href="/lead-management?luxury=true&fullyVerified=true"
            className="bg-card rounded-xl border border-amber-500/30 p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-amber-500/60 hover:bg-amber-500/5 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Luxury Verified
              </span>
              <div className="flex items-center gap-0.5">
                <Crown size={11} className="text-amber-500" />
                <ShieldCheck size={11} className="text-success" />
              </div>
            </div>
            <div>
              <p className="font-mono-data text-2xl sm:text-3xl font-bold text-foreground leading-none">
                {luxuryFullyVerified.toLocaleString()}
              </p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
                Luxury + Fully Verified
              </p>
            </div>
          </Link>

          {/* Luxury + Verified Number */}
          <Link
            href="/lead-management?luxury=true&verifiedNumberOnly=true"
            className="bg-card rounded-xl border border-amber-500/30 p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-amber-500/60 hover:bg-amber-500/5 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Luxury + Phone
              </span>
              <div className="flex items-center gap-0.5">
                <Crown size={11} className="text-amber-500" />
                <Phone size={11} className="text-primary" />
              </div>
            </div>
            <div>
              <p className="font-mono-data text-2xl sm:text-3xl font-bold text-foreground leading-none">
                {luxuryVerifiedNumber.toLocaleString()}
              </p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
                Luxury + Verified Phone
              </p>
            </div>
          </Link>

          {/* Luxury Priority */}
          <Link
            href="/lead-management?luxury=true&priorityTier=1"
            className="bg-card rounded-xl border border-amber-500/30 p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-amber-500/60 hover:bg-amber-500/5 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Luxury Priority
              </span>
              <div className="flex items-center gap-0.5">
                <Crown size={11} className="text-amber-500" />
                <Zap size={11} className="text-warning" />
              </div>
            </div>
            <div>
              <p className="font-mono-data text-2xl sm:text-3xl font-bold text-foreground leading-none">
                {luxuryPriority.toLocaleString()}
              </p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
                Luxury + High Priority
              </p>
            </div>
          </Link>

          {/* Luxury Unassigned Priority */}
          <Link
            href="/lead-management?luxury=true&priorityTier=1&assignmentStatus=unassigned"
            className="bg-card rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-amber-500/70 hover:bg-amber-500/10 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Luxury Unassigned
              </span>
              <div className="flex items-center gap-0.5">
                <Crown size={11} className="text-amber-500" />
                <UserX size={11} className="text-destructive" />
              </div>
            </div>
            <div>
              <p className="font-mono-data text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400 leading-none">
                {luxuryUnassignedPriority.toLocaleString()}
              </p>
              <p className="text-[10px] sm:text-[11px] text-amber-600/70 dark:text-amber-400/70 mt-1">
                Priority, needs agent
              </p>
            </div>
          </Link>
        </div>
      )}

      {/* Bottom row: 4 metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* STR-Eligible */}
        <Link
          href="/lead-management?regulation=Allowed&regulation=Restricted"
          className="bg-card rounded-xl border border-border p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-success/40 hover:bg-success/5 transition-all cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              STR-Eligible
            </span>
            <CheckCircle size={13} className="text-success" />
          </div>
          <div>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold text-foreground leading-none">
              {regulationFriendly.toLocaleString()}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
              Allowed or restricted
            </p>
          </div>
        </Link>

        {/* Phone Available */}
        <Link
          href="/lead-management?phoneAvailableOnly=true"
          className="bg-card rounded-xl border border-border p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Phone Available
            </span>
            <Phone size={13} className="text-primary" />
          </div>
          <div>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold text-foreground leading-none">
              {phoneAvailable.toLocaleString()}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
              Verified phone leads
            </p>
          </div>
        </Link>

        {/* Live Revenue (admin/owner only) OR Commission Payout (agent) */}
        {isAgentRole ? (
          <Link
            href="/agent/commissions"
            className="bg-card rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-primary/60 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-primary/80">
                Pending Payout
              </span>
              <DollarSign size={13} className="text-primary" />
            </div>
            <div>
              <p className="font-mono-data text-xl sm:text-2xl font-bold text-primary leading-none">
                {commissionPayout?.pendingPayout
                  ? formatCurrency(commissionPayout.pendingPayout)
                  : '—'}
              </p>
              <p className="text-[10px] sm:text-[11px] text-primary/70 mt-1">
                {commissionPayout?.nextPayoutDate
                  ? `Next: ${commissionPayout.nextPayoutDate}`
                  : 'Commission owed'}
              </p>
            </div>
          </Link>
        ) : (
          <Link
            href="/lead-management?stage=Live"
            className="bg-card rounded-xl border border-success/30 bg-success-bg p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-success/60 transition-all cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-success/80">
                Live Revenue
              </span>
              <DollarSign size={13} className="text-success" />
            </div>
            <div>
              <p className="font-mono-data text-xl sm:text-2xl font-bold text-success leading-none">
                {estimatedMonthlyRevenue === null ? '—' : estimatedMonthlyRevenue > 0 ? formatCurrency(estimatedMonthlyRevenue) : '$0'}
              </p>
              <p className="text-[10px] sm:text-[11px] text-success/70 mt-1">
                {estimatedMonthlyRevenue === null ? 'Unable to load' : estimatedMonthlyRevenue > 0 ? 'Net / month from Live' : 'No signed contracts yet'}
              </p>
            </div>
          </Link>
        )}

        {/* Avg Score */}
        <Link
          href="/tools"
          className="bg-card rounded-xl border border-border p-3 sm:p-4 flex flex-col justify-between min-h-[90px] hover:border-secondary/40 hover:bg-secondary/5 transition-all cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Avg Score
            </span>
            <TrendingUp size={13} className="text-secondary" />
          </div>
          <div>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold text-foreground leading-none">
              {avgScore}
              <span className="text-sm font-medium text-muted-foreground">/100</span>
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
              Pipeline quality
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
});