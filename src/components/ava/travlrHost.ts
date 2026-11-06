import type { AvaHost, AvaRole, AvaScreen } from './host/types';
import { TRAVLR_TOURS } from './travlrTours';
import { getAvaScreen, getAvaSelection, runAvaExport } from './selection';
import { navPagesFor } from '@/components/Sidebar';

export function createTravlrHost(opts: { role: AvaRole | null; navigate: (route: string) => void; getPortfolio?: () => string | null }): AvaHost {
  return {
    assetBase: '/ava',
    apiBase: '',
    // Never show built-in sample data inside the real app.
    offlineDemo: false,
    role: opts.role,
    tours: TRAVLR_TOURS,
    features: ['travlr'],
    getRoute: () => window.location.pathname,
    navigate: opts.navigate,
    getSelection: getAvaSelection,
    // What the open page reports about itself, plus the portfolio picked in the top bar (it applies on every screen).
    getScreen: (): AvaScreen => {
      const s = getAvaScreen();
      const portfolio = opts.getPortfolio?.();
      return portfolio ? { ...s, filters: { Portfolio: portfolio, ...(s.filters ?? {}) } } : s;
    },
    openLead: (id, focus) => opts.navigate(`/lead-profile?id=${encodeURIComponent(id)}${focus ? `&focus=${focus}` : ''}`),
    exportLeads: runAvaExport,
    briefing: true,
    // Every page in the user's own menu, so AVA can point at it and open it.
    pages: opts.role ? navPagesFor(opts.role) : [],
    // The menu keeps its categories closed; this opens the one holding the item AVA is about to point at.
    reveal: (anchorId) => window.dispatchEvent(new CustomEvent('ava:reveal', { detail: { anchor: anchorId } }))
  };
}
