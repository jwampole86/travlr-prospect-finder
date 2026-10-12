import React from 'react';

export default function EstimateLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#FAF7F2]" role="status" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/travlr-icon.png" alt="TRAVLR" width={72} height={72} className="motion-safe:animate-pulse" />
      <p className="text-xs tracking-[0.3em] text-neutral-500 uppercase">TRAVLR Vacation Homes</p>
      <span className="sr-only">Loading your estimate</span>
    </div>
  );
}
