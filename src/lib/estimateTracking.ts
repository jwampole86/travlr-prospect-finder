'use client';

// Reports homeowner actions on the estimate page when they arrived from a text link (?c=<code>). Silent no-op otherwise.
const SID_KEY = 'travlr_est_sid';
const CODE_KEY = 'travlr_est_code';

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function getTrackingContext(search?: string): { code: string; sid: string } | null {
  try {
    const fromUrl = new URLSearchParams(search ?? window.location.search).get('c');
    if (fromUrl && /^[a-z0-9]{4,16}$/i.test(fromUrl)) sessionStorage.setItem(CODE_KEY, fromUrl);
    const code = sessionStorage.getItem(CODE_KEY);
    if (!code) return null;
    let sid = sessionStorage.getItem(SID_KEY);
    if (!sid) { sid = uuid(); sessionStorage.setItem(SID_KEY, sid); }
    return { code, sid };
  } catch { return null; }
}

export function trackEstimateEvent(event: string, data?: Record<string, string | number | boolean>): void {
  const ctx = getTrackingContext();
  if (!ctx) return;
  const payload = JSON.stringify({ c: ctx.code, sid: ctx.sid, event, data });
  try {
    if (navigator.sendBeacon?.('/api/estimate/event', new Blob([payload], { type: 'application/json' }))) return;
  } catch { /* fall through to fetch */ }
  fetch('/api/estimate/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
}
