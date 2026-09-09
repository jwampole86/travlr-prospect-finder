'use client';

import React, { useEffect, useRef } from 'react';
import type { Lead, RegulationStatus } from '@/data/mockLeads';

interface LeafletMapProps {
  leads: Lead[];
  selectedId: string | null;
  onSelect: (lead: Lead) => void;
}

const regColors: Record<RegulationStatus, string> = {
  Allowed: '#16a34a',
  Restricted: '#d97706',
  Prohibited: '#dc2626',
  Unknown: '#64748b',
};

const MAP_CONTAINER_ID = 'travlr-leaflet-map';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function LeafletMap({ leads, selectedId, onSelect }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    // Prevent double-init (React Strict Mode / hot reload)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      markersRef.current.clear();
    }

    // BACKEND: Replace static leads with live data from /api/leads?view=map
    import('leaflet').then((L) => {
      if (!mapRef.current || cancelled) return;

      // Clear any Leaflet state left on the DOM node (must happen inside async callback)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const container = mapRef.current as any;
      if (container._leaflet_id) {
        delete container._leaflet_id;
      }

      // Fix default marker icon issue with webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current, {
        center: [39.7392, -104.9903],
        zoom: 12,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add markers for the current lead set
      const bounds: [number, number][] = [];
      leads.forEach((lead) => {
        if (lead.lat == null || lead.lng == null || isNaN(lead.lat) || isNaN(lead.lng)) return;
        bounds.push([lead.lat, lead.lng]);
        const color = regColors[lead.regulationStatus];
        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              width: 28px;
              height: 28px;
              background: ${color};
              border: 2px solid white;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <span style="
                transform: rotate(45deg);
                font-size: 9px;
                font-weight: 700;
                color: white;
                font-family: monospace;
              ">${lead.prospectScore}</span>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -30],
        });

        const marker = L.marker([lead.lat, lead.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: system-ui; min-width: 180px;">
              <strong style="font-size: 13px;">${escapeHtml(lead.address)}</strong>
              <p style="margin: 4px 0; font-size: 11px; color: #64748b;">${escapeHtml(lead.city)}, ${escapeHtml(lead.state)}</p>
              <div style="display: flex; gap: 8px; font-size: 11px; margin-top: 4px;">
                <span>${lead.beds}bd/${lead.baths}ba</span>
                <span style="font-weight: 600;">$${lead.price.toLocaleString()}/mo</span>
              </div>
              <div style="margin-top: 6px; padding: 4px 8px; background: ${color}20; border-radius: 4px; font-size: 11px; color: ${color}; font-weight: 600; display: inline-block;">
                ${lead.regulationStatus}
              </div>
            </div>
          `);

        marker.on('click', () => {
          onSelect(lead);
        });

        markersRef.current.set(lead.id, marker);
      });

      if (bounds.length === 1) {
        map.setView(bounds[0], 12);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
      }
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current.clear();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, onSelect]);

  // Fly to selected lead
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedId) return;
    const lead = leads.find((l) => l.id === selectedId);
    if (lead && lead.lat != null && lead.lng != null && !isNaN(lead.lat) && !isNaN(lead.lng)) {
      mapInstanceRef.current.flyTo([lead.lat, lead.lng], 15, { duration: 0.8 });
      const marker = markersRef.current.get(selectedId);
      if (marker) marker.openPopup();
    }
  }, [selectedId, leads]);

  return (
    <>
      <style>{`
        @import url('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
        .leaflet-container {
          font-family: var(--font-sans);
          height: 100%;
          width: 100%;
          z-index: 1;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 10px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          border: 1px solid var(--border);
        }
        .leaflet-popup-tip {
          background: white;
        }
      `}</style>
      <div
        ref={mapRef}
        id={MAP_CONTAINER_ID}
        className="h-full w-full"
        aria-label="Property map showing lead locations"
      />
    </>
  );
}