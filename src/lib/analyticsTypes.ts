export type KpiFormat = 'number' | 'percent' | 'currency';

export interface Kpi { key: string; label: string; value: number; prev: number | null; format: KpiFormat; sub?: string; /** Lower is better, so a drop is shown as good. */ invert?: boolean }
export interface DayPoint { date: string; texts: number; clicks: number; replies: number; emails: number; calls: number }
export interface FunnelStep { label: string; value: number }
export interface CampaignRow { batch: string; audience: string | null; firstSend: string; texts: number; sent: number; delivered: number; clicked: number; replied: number; hot: number; optedOut: number; cost: number }
export interface GroupRow { key: string; leads: number; avgScore: number; texted: number; replied: number; allowedPct: number }
export interface HourRow { hour: number; sent: number; replied: number; clicked: number }
export interface Slice { label: string; value: number }

export interface AnalyticsOverview {
  generatedAt: string;
  days: number;
  kpis: Kpi[];
  daily: DayPoint[];
  funnel: FunnelStep[];
  campaigns: CampaignRow[];
  sources: GroupRow[];
  states: GroupRow[];
  hours: HourRow[];
  stages: Slice[];
  scoreBands: Slice[];
  regulation: Slice[];
  email: { sent: number; delivered: number; opened: number; replied: number; bounced: number };
  calls: { total: number; totalMinutes: number; avgMinutes: number };
  spend: { total: number; perReply: number | null; perHotLead: number | null; perClick: number | null };
  insights: string[];
}
