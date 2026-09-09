'use client';

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { Lead, RegulationStatus, LeadStage } from '@/data/mockLeads';
import type { RegulationRule } from '@/data/regulations';
import MapSidebar from './MapSidebar';
import MapFilters from './MapFilters';
import MapDetailPanel from './MapDetailPanel';
import LeadDetailPanel from '@/app/lead-management/components/LeadDetailPanel';
import { leadsService } from '@/lib/services/leadsService';
import { toast } from 'sonner';
import { List } from 'lucide-react';

const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

interface MapViewClientProps {
  leads: Lead[];
  regulations: RegulationRule[];
}

export interface MapFilterState {
  regulationStatus: RegulationStatus | '';
  minScore: number;
  minBeds: number;
}

export default function MapViewClient({ leads: initialLeads, regulations }: MapViewClientProps) {
  const [leads, setLeads] = useState(initialLeads);
  const [filters, setFilters] = useState<MapFilterState>({
    regulationStatus: '',
    minScore: 0,
    minBeds: 0,
  });
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // default collapsed on mobile

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (filters.regulationStatus && l.regulationStatus !== filters.regulationStatus) return false;
      if (l.prospectScore < filters.minScore) return false;
      if (l.beds < filters.minBeds) return false;
      return true;
    });
  }, [leads, filters]);

  const regulationForLead = selectedLead
    ? regulations.find((r) => r.city === selectedLead.city)
    : null;

  const handleSelectLead = React.useCallback((lead: Lead | null) => {
    setSelectedLead(lead);
    // On mobile, close sidebar when a lead is selected
    if (lead && typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  function handleOpenDetail(lead: Lead) {
    setDetailLead(lead);
  }

  async function handleStageChange(id: string, stage: LeadStage) {
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, stage } : l));
    setDetailLead((prev) => prev && prev.id === id ? { ...prev, stage } : prev);
    await leadsService.updateStage(id, stage);
    toast.success(`Stage updated to "${stage}"`);
  }

  async function handleDelete(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setDetailLead(null);
    setSelectedLead((prev) => prev && prev.id === id ? null : prev);
    await leadsService.deleteLead(id);
    toast.success('Lead deleted');
  }

  return (
    <div className="flex flex-col h-full">
      <MapFilters
        filters={filters}
        onChange={setFilters}
        totalCount={leads.length}
        filteredCount={filteredLeads.length}
      />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar — absolute on mobile, static on desktop */}
        {sidebarOpen && (
          <div className="absolute md:relative inset-y-0 left-0 z-30 md:z-auto">
            <MapSidebar
              leads={filteredLeads}
              selectedId={selectedLead?.id ?? null}
              onSelect={handleSelectLead}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        )}

        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="md:hidden absolute inset-0 z-20 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Map */}
        <div className="flex-1 relative">
          {/* Show List button — always visible when sidebar is closed */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium bg-card border border-border rounded-md shadow hover:bg-muted transition-all min-h-[48px]"
            >
              <List size={13} />
              <span>Show List</span>
              {filteredLeads.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                  {filteredLeads.length}
                </span>
              )}
            </button>
          )}
          <LeafletMap
            leads={filteredLeads}
            selectedId={selectedLead?.id ?? null}
            onSelect={handleSelectLead}
          />
        </div>

        {/* Compact map detail panel */}
        {selectedLead && !detailLead && (
          <MapDetailPanel
            lead={selectedLead}
            regulation={regulationForLead ?? null}
            onClose={() => setSelectedLead(null)}
            onOpenFullDetail={() => handleOpenDetail(selectedLead)}
          />
        )}
      </div>

      {/* Full-screen detail panel */}
      {detailLead && (
        <LeadDetailPanel
          lead={detailLead}
          onClose={() => setDetailLead(null)}
          onStageChange={handleStageChange}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}