import type { StageKey } from '@/app/pipeline/types';

export interface MapPoint {
  id: string; address: string; city: string; state: string; zip: string | null; lat: number; lng: number; score: number; stage: StageKey; owner: string | null; net: number | null;
  luxury: boolean; program: string | null; regulation: string; hasPhone: boolean; approx: boolean; beds: number | null; baths: number | null;
}
export type ColorBy = 'stage' | 'score' | 'rules';
export type BaseLayer = 'street' | 'dark' | 'satellite';

export const REG_HEX: Record<string, string> = {
  Allowed: '#4ade80', Restricted: '#facc15', 'Permit Required': '#fb923c', 'Primary Residence Required': '#a855f7', 'Review Required': '#3b82f6', Prohibited: '#f87171',
  'Allowed with Requirements': '#2dd4bf', Unknown: '#94a3b8',
};
// Always shown in the legend; the rest only appear when a lead has them.
export const REG_LEGEND_CORE = ['Allowed', 'Restricted', 'Permit Required', 'Primary Residence Required', 'Review Required', 'Prohibited'];
export const scoreHex = (s: number) => (s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#94a3b8');
