import React from 'react';

/**
 * The official VAYO logo mark — a two-tone "V" on a dark rounded-square field.
 * Pure SVG so it renders crisply at any size without a raster asset.
 */
export default function VayoMark({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="VAYO"
    >
      <defs>
        <linearGradient id="vayo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#071A38" />
          <stop offset="100%" stopColor="#050A16" />
        </linearGradient>
        <linearGradient id="vayo-blue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#169CFF" />
          <stop offset="100%" stopColor="#087BFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#vayo-bg)" />
      <path d="M14 16 L24 16 L32 40 L22 40 Z" fill="#EAF6FF" />
      <path d="M50 16 L40 16 L26 48 L36 48 Z" fill="url(#vayo-blue)" />
    </svg>
  );
}
