'use client';

import React from 'react';
import { MapPin, SlidersHorizontal } from 'lucide-react';
import type { MapFilterState } from './MapViewClient';
import type { RegulationStatus } from '@/data/mockLeads';

interface MapFiltersProps {
  filters: MapFilterState;
  onChange: (f: MapFilterState) => void;
  totalCount: number;
  filteredCount: number;
}

const regStatuses: { value: RegulationStatus | ''; label: string }[] = [
  { value: '', label: 'All Regulations' },
  { value: 'Allowed', label: 'Allowed' },
  { value: 'Restricted', label: 'Restricted' },
  { value: 'Prohibited', label: 'Prohibited' },
  { value: 'Unknown', label: 'Unknown' },
];

export default function MapFilters({ filters, onChange, totalCount, filteredCount }: MapFiltersProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 bg-card border-b border-border flex-wrap">
      <div className="flex items-center gap-1.5 mr-2">
        <SlidersHorizontal size={14} className="text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Map Filters</span>
      </div>

      {/* Regulation status */}
      <select
        value={filters.regulationStatus}
        onChange={(e) => onChange({ ...filters, regulationStatus: e.target.value as RegulationStatus | '' })}
        className="px-2.5 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
        aria-label="Filter by regulation status"
      >
        {regStatuses.map((s) => (
          <option key={`map-reg-${s.value || 'all'}`} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Min score */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Min Score</span>
        <select
          value={filters.minScore}
          onChange={(e) => onChange({ ...filters, minScore: Number(e.target.value) })}
          className="px-2.5 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          aria-label="Minimum prospect score"
        >
          <option value={0}>Any</option>
          <option value={60}>60+</option>
          <option value={70}>70+</option>
          <option value={80}>80+</option>
          <option value={90}>90+</option>
        </select>
      </div>

      {/* Min beds */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Min Beds</span>
        <select
          value={filters.minBeds}
          onChange={(e) => onChange({ ...filters, minBeds: Number(e.target.value) })}
          className="px-2.5 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          aria-label="Minimum bedrooms"
        >
          <option value={0}>Any</option>
          <option value={2}>2+</option>
          <option value={3}>3+</option>
          <option value={4}>4+</option>
          <option value={5}>5+</option>
        </select>
      </div>

      {/* Count indicator */}
      <div className="ml-auto flex items-center gap-1.5">
        <MapPin size={13} className="text-primary" />
        <span className="text-xs text-muted-foreground">
          <span className="font-mono-data font-semibold text-foreground">{filteredCount}</span>
          {filteredCount !== totalCount && (
            <span> of <span className="font-mono-data font-semibold text-foreground">{totalCount}</span></span>
          )}{' '}
          pins showing
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 ml-4 pl-4 border-l border-border">
        {[
          { label: 'Allowed', color: 'bg-success' },
          { label: 'Restricted', color: 'bg-warning' },
          { label: 'Prohibited', color: 'bg-danger' },
          { label: 'Unknown', color: 'bg-neutral' },
        ].map((item) => (
          <div key={`legend-${item.label}`} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
            <span className="text-[11px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}