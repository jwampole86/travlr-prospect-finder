export interface HomeownerAlert {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string | null;
  createdAt: string;
  leadId: string | null;
  leadLabel: string | null;
}

export interface HomeownerLinkRow {
  id: string;
  homeownerId: string;
  homeownerLabel: string;
  propertyId: string;
  propertyLabel: string;
  permissionLevel: string;
  protectedContact: boolean;
  smsOptedOutAt: string | null;
  emailOptIn: boolean | null;
}

export interface HomeownerPreferenceRow {
  id: string;
  homeownerLabel: string;
  propertyLabel: string;
  channelEmail: boolean;
  channelSms: boolean;
  channelInApp: boolean;
  notifyNewBooking: boolean;
  notifyPayoutProcessed: boolean;
  notifyRequestUpdate: boolean;
  notifyMonthlyStatement: boolean;
  updatedAt: string;
}

export interface HomeownerDeliveryRow {
  id: string;
  kind: string;
  status: string;
  recipientEmail: string | null;
  subject: string | null;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  failureReason: string | null;
  bounceType: string | null;
  propertyLabel: string | null;
}

export interface HomeownerNotificationsSummary {
  linkedProperties: number;
  protectedContacts: number;
  preferenceRows: number;
  alertsLast24h: number;
  homeownerEmailsLast30d: number;
  smsSuppressions: number;
  optedOutLeads: number;
}

export interface HomeownerNotificationsPageData {
  summary: HomeownerNotificationsSummary;
  alerts: HomeownerAlert[];
  links: HomeownerLinkRow[];
  preferences: HomeownerPreferenceRow[];
  deliveries: HomeownerDeliveryRow[];
}
