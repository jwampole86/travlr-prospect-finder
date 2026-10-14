import type { StageKey } from '@/app/pipeline/types';

export interface MapPoint {
  id: string; address: string; city: string; state: string; zip: string | null; lat: number; lng: number; score: number; stage: StageKey; owner: string | null; net: number | null;
  luxury: boolean; program: string | null; regulation: string; hasPhone: boolean; approx: boolean; beds: number | null; baths: number | null;
}
export type ColorBy = 'stage' | 'score' | 'rules';
export type BaseLayer = 'street' | 'dark' | 'satellite';

export const REG_HEX: Record<string, string> = { Allowed: '#16a34a', Restricted: '#d97706', Prohibited: '#dc2626', Unknown: '#94a3b8' };
export const scoreHex = (s: number) => (s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#94a3b8');
