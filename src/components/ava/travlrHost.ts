import type { AvaHost, AvaRole } from './host/types';
import { TRAVLR_TOURS } from './travlrTours';
import { getAvaSelection } from './selection';
import { navPagesFor } from '@/components/Sidebar';

export function createTravlrHost(opts: { role: AvaRole | null; navigate: (route: string) => void }): AvaHost {
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
    // Every page in the user's own menu, so AVA can point at it and open it.
    pages: opts.role ? navPagesFor(opts.role) : [],
    // The menu keeps its categories closed; this opens the one holding the item AVA is about to point at.
    reveal: (anchorId) => window.dispatchEvent(new CustomEvent('ava:reveal', { detail: { anchor: anchorId } }))
  };
}
