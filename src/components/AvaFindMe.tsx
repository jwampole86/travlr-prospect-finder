'use client';

/**
 * Shown over the welcome tour's AVA step: a pulsing copy of AVA's launcher in the exact corner where the real one lives, so a new
 * person sees where to find her. Purely visual (the real button sits dimmed behind the tour).
 */
export default function AvaFindMe() {
  return (
    <div aria-hidden="true" className="fixed z-[10000] pointer-events-none" style={{ right: 20, bottom: 20 }}>
      <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(61,90,241,.45)' }} />
      <div
        className="relative w-16 h-16 rounded-full border-[3px] border-white text-white font-extrabold tracking-wide flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg,#5b78ff,#3650E6)', boxShadow: '0 10px 28px rgba(61,90,241,.45)' }}
      >
        AVA
      </div>
      <div className="absolute bottom-3 right-[76px] w-44 rounded-xl bg-card border border-border text-foreground text-xs font-medium leading-snug px-3 py-2 shadow-lg">
        I live here, on every screen. Tap me any time you need help.
      </div>
    </div>
  );
}

/** Asks AVA to introduce herself once per person (recorded on the account), after the welcome tour. */
export async function requestAvaIntroduction() {
  try {
    if (window.localStorage.getItem('ava.introduced') === 'yes') return;
    const res = await fetch('/api/ava/intro', { method: 'POST', credentials: 'include' });
    const body = res.ok ? ((await res.json()) as { first?: boolean }) : {};
    window.localStorage.setItem('ava.introduced', 'yes');
    if (!body.first) return;
    window.localStorage.setItem('ava.introduce', 'pending');
  } catch { return; }
  window.dispatchEvent(new CustomEvent('ava:introduce'));
}
