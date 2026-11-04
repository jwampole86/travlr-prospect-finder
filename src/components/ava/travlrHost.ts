import type { AvaHost, AvaRole } from './host/types';
import { TRAVLR_TOURS } from './travlrTours';
import { getAvaSelection } from './selection';

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
    getSelection: getAvaSelection
  };
}
