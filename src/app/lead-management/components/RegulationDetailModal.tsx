'use client';

import React from 'react';
import Modal from '@/components/ui/Modal';
import type { RegulationRule } from '@/data/regulations';
import { CheckCircle, AlertTriangle, XCircle, ExternalLink, DollarSign, Users, Home, Calendar } from 'lucide-react';

interface RegulationDetailModalProps {
  regulation: RegulationRule;
  onClose: () => void;
}

function StatusBanner({ status }: { status: RegulationRule['status'] }) {
  if (status === 'Allowed') {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-success-bg border border-success/30">
        <CheckCircle size={16} className="text-success" />
        <span className="text-sm font-semibold text-success">STRs Allowed</span>
      </div>
    );
  }
  if (status === 'Restricted') {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-warning-bg border border-warning/30">
        <AlertTriangle size={16} className="text-warning" />
        <span className="text-sm font-semibold text-warning">Restricted — Permit Required</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-bg border border-danger/30">
      <XCircle size={16} className="text-danger" />
      <span className="text-sm font-semibold text-danger">STRs Prohibited</span>
    </div>
  );
}

export default function RegulationDetailModal({ regulation, onClose }: RegulationDetailModalProps) {
  return (
    <Modal open onClose={onClose} title={`${regulation.city}, ${regulation.state} — STR Regulations`} size="md">
      <div className="p-5 space-y-5">
        <StatusBanner status={regulation.status} />

        <p className="text-sm text-muted-foreground leading-relaxed">{regulation.summary}</p>

        {/* Key facts grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/40 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <Home size={12} className="text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Permit</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {regulation.permitRequired ? 'Required' : 'Not Required'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <Users size={12} className="text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Residency</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {regulation.primaryResidenceOnly ? 'Primary Only' : 'Any Property'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign size={12} className="text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">License Fee</span>
            </div>
            <p className="text-sm font-semibold text-foreground font-mono-data">
              {regulation.licensingFee ? `$${regulation.licensingFee}/yr` : 'N/A'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar size={12} className="text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Night Cap</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {regulation.nightCap ? `${regulation.nightCap} nights/yr` : 'No cap'}
            </p>
          </div>
          {regulation.maxGuests && (
            <div className="p-3 rounded-lg bg-muted/40 border border-border col-span-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Users size={12} className="text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Max Guests</span>
              </div>
              <p className="text-sm font-semibold text-foreground">{regulation.maxGuests} guests per stay</p>
            </div>
          )}
        </div>

        {/* Key rules list */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Key Rules</h4>
          <ul className="space-y-1.5">
            {regulation.keyRules.map((rule, i) => (
              <li key={`rule-${regulation.id}-${i + 1}`} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                {rule}
              </li>
            ))}
          </ul>
        </div>

        {/* Sources */}
        {regulation.sources.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Official Sources</h4>
            <div className="space-y-1">
              {regulation.sources.map((src, i) => (
                <a
                  key={`src-${regulation.id}-${i + 1}`}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate"
                >
                  <ExternalLink size={11} />
                  {src}
                </a>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Last updated: {regulation.lastUpdated} — Always verify with official city sources before committing.
        </p>
      </div>
    </Modal>
  );
}