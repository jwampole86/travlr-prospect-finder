export interface EngagedProspect {
  leadId: string; address: string; place: string; name: string | null; stage: string | null; regulation: string | null;
  baseScore: number; engagementScore: number; temperature: 'hot' | 'warm' | 'cold';
  clicks: number; viewed: boolean; timeOnPage: number | null; chatQuestions: number; downloaded: boolean; contactRequested: boolean;
  replied: boolean; replyIntent: string | null; replyText: string | null; lastActivityAt: string | null;
}

export interface EngagedProspectsResponse {
  totals: { texted: number; delivered: number; clicked: number; replied: number; hot: number; warm: number };
  prospects: EngagedProspect[];
}
