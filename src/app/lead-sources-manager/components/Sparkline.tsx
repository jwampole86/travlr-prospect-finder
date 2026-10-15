import React from 'react';

/** A tiny inline trend line. Draws nothing meaningful for an all-zero series, so it shows a flat dashed baseline instead. */
export default function Sparkline({ values, color, width = 96, height = 28 }: { values: number[]; color: string; width?: number; height?: number }) {
  const max = Math.max(...values, 0);
  if (!values.length || max === 0) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1="2" x2={width - 2} y1={height - 4} y2={height - 4} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="3 3" />
      </svg>
    );
  }
  const step = (width - 4) / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => [2 + i * step, height - 4 - (v / max) * (height - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height - 2} L${pts[0][0].toFixed(1)},${height - 2} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={area} fill={color} fillOpacity="0.14" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  );
}
