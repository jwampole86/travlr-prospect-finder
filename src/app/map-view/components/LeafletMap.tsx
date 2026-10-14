'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { BaseLayer, ColorBy, MapPoint } from './types';
import { REG_HEX, scoreHex } from './types';
import { STAGE_HEX } from '@/app/pipeline/types';

interface Props { points: MapPoint[]; colorBy: ColorBy; base: BaseLayer; selectedId: string | null; fitKey: number; onSelect: (id: string) => void }

// All three providers work without an API key. Esri's tiles stop at their native zoom, so deeper zooms are stretched.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const TILES: Record<BaseLayer, { layers: Array<{ url: string; maxNativeZoom?: number }>; attribution: string; maxZoom: number }> = {
  street: { layers: [{ url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' }], attribution: '© OpenStreetMap contributors', maxZoom: 19 },
  dark: { layers: [{ url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 16 }, { url: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 16 }], attribution: 'Tiles © Esri', maxZoom: 19 },
  satellite: { layers: [{ url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 18 }], attribution: 'Imagery © Esri', maxZoom: 19 },
};
// With NEXT_PUBLIC_MAPBOX_TOKEN set, all three styles come from Mapbox; without it the keyless tiles above are used.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const MAPBOX_STYLE: Record<BaseLayer, string> = { street: 'streets-v12', dark: 'dark-v11', satellite: 'satellite-streets-v12' };
const addBase = (Lf: any, map: any, base: BaseLayer) => {
  if (MAPBOX_TOKEN) {
    return Lf.layerGroup([Lf.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/${MAPBOX_STYLE[base]}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`, { tileSize: 512, zoomOffset: -1, maxZoom: 20, attribution: '© Mapbox © OpenStreetMap contributors' })]).addTo(map);
  }
  const t = TILES[base];
  return Lf.layerGroup(t.layers.map(l => Lf.tileLayer(l.url, { attribution: t.attribution, maxZoom: t.maxZoom, maxNativeZoom: l.maxNativeZoom }))).addTo(map);
};

const colorOf = (p: MapPoint, by: ColorBy) => (by === 'stage' ? STAGE_HEX[p.stage] : by === 'score' ? scoreHex(p.score) : REG_HEX[p.regulation] ?? REG_HEX.Unknown);
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function LeafletMap({ points, colorBy, base, selectedId, fitKey, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const L = useRef<any>(null); const map = useRef<any>(null); const cluster = useRef<any>(null); const tiles = useRef<any>(null); const ring = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map()); const latest = useRef({ points, colorBy, onSelect, base }); latest.current = { points, colorBy, onSelect, base };
  const ready = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);

  const draw = () => {
    if (!ready.current) return; const { points: pts, colorBy: by } = latest.current;
    cluster.current.clearLayers(); markers.current.clear();
    const layers = pts.map(p => {
      const m = L.current.circleMarker([p.lat, p.lng], { radius: 5 + Math.min(4, p.score / 25), color: '#fff', weight: 1.5, fillColor: colorOf(p, by), fillOpacity: p.approx ? 0.55 : 0.95 });
      m.bindTooltip(`<strong>${esc(p.address)}</strong><br/>${esc(p.city)}, ${esc(p.state)} · score ${p.score}${p.approx ? '<br/><em>approximate location</em>' : ''}`, { direction: 'top', offset: [0, -4] });
      m.on('click', () => latest.current.onSelect(p.id)); markers.current.set(p.id, m); return m;
    });
    cluster.current.addLayers(layers);
  };
  const fit = () => {
    if (!ready.current) return; const pts = latest.current.points;
    if (!pts.length) return;
    if (pts.length === 1) map.current.setView([pts[0].lat, pts[0].lng], 14); else map.current.fitBounds(pts.map(p => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 13 });
  };

  useEffect(() => {
    let dead = false;
    // The cluster plugin attaches itself to the global L, so Leaflet must finish loading first.
    import('leaflet').then(async mod => {
      if (dead) return; (window as any).L = (mod as any).default ?? mod;
      await import('leaflet.markercluster');
      if (dead || !el.current) return; L.current = (window as any).L;
      map.current = L.current.map(el.current, { center: [39.5, -98.35], zoom: 4, preferCanvas: true, zoomControl: false });
      L.current.control.zoom({ position: 'bottomright' }).addTo(map.current);
      tiles.current = addBase(L.current, map.current, latest.current.base);
      cluster.current = (L.current as any).markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false, disableClusteringAtZoom: 16 });
      map.current.addLayer(cluster.current); ready.current = true; draw(); fit();
      requestAnimationFrame(() => map.current?.invalidateSize());
      setTimeout(() => map.current?.invalidateSize(), 300);
    }).catch(e => { console.error('Map failed to start', e); if (!dead) setFailed(e instanceof Error ? e.message : 'The map could not start.'); });
    return () => { dead = true; ready.current = false; map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(draw, [points, colorBy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(fit, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!ready.current) return; tiles.current.remove(); tiles.current = addBase(L.current, map.current, base); }, [base]);

  useEffect(() => {
    if (!ready.current) return; ring.current?.remove(); ring.current = null;
    const p = points.find(x => x.id === selectedId); if (!p) return;
    ring.current = L.current.circleMarker([p.lat, p.lng], { radius: 16, color: '#2563eb', weight: 3, fill: false, interactive: false }).addTo(map.current);
    const m = markers.current.get(p.id);
    if (m && cluster.current.zoomToShowLayer) cluster.current.zoomToShowLayer(m, () => map.current.panTo([p.lat, p.lng])); else map.current.flyTo([p.lat, p.lng], 15, { duration: 0.6 });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const c = el.current; if (!c || typeof ResizeObserver === 'undefined') return; const o = new ResizeObserver(() => map.current?.invalidateSize()); o.observe(c); return () => o.disconnect(); }, []);

  return (
    <>
      <style>{`
        .leaflet-container { font-family: var(--font-sans); height: 100%; width: 100%; z-index: 1; }
        .leaflet-tooltip { border-radius: 8px; font-size: 11px; }
      `}</style>
      <div ref={el} className="absolute inset-0" aria-label="Map of leads" />
      {failed && <div className="absolute inset-0 z-[500] flex items-center justify-center bg-card/90 text-sm text-red-600 p-6 text-center">The map could not start ({failed}). Reload the page to try again.</div>}
    </>
  );
}
