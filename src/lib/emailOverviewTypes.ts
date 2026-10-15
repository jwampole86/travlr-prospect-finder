export interface EmailCampaignCounts { total: number; drafts: number; sent: number; delivered: number; opened: number; replied: number; bounced: number; optedOut: number }

export interface EmailCampaignSummary { id: string; name: string; createdAt: string; counts: EmailCampaignCounts; nextRelease: string | null; held: number }

export interface EmailMessageRow {
  id: string; campaignId: string; offerCode: string | null; toName: string | null; toEmail: string; subject: string; body: string; status: string;
  sentAt: string | null; deliveredAt: string | null; openedAt: string | null; repliedAt: string | null; bouncedAt: string | null; bounceType: string | null;
  failureReason: string | null; replyText: string | null; optedOut: boolean; retryAt: string | null;
}

export interface EmailOverview {
  campaigns: EmailCampaignSummary[]; messages: EmailMessageRow[]; totals: EmailCampaignCounts;
  daily: { sentToday: number; cap: number; resetsAt: string };
}
