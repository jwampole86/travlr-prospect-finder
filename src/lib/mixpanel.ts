import mixpanel from 'mixpanel-browser';

const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || '49eb0af896464ab6f58070d0a9f44a90';

let initialized = false;

export const initMixpanel = () => {
  if (initialized || !MIXPANEL_TOKEN) {
    if (!MIXPANEL_TOKEN) {
      console.warn('Mixpanel token is missing! Check your .env file.');
    }
    return;
  }
  mixpanel.init(MIXPANEL_TOKEN, {
    autocapture: true,
    track_pageview: 'url-with-path',
    persistence: 'localStorage',
  });
  initialized = true;
};

// ─── Page Views ───────────────────────────────────────────────────────────────

export const trackPageView = (pageName: string, properties?: Record<string, unknown>) => {
  if (!initialized) return;
  mixpanel.track('Page Viewed', { page: pageName, ...properties });
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const trackDashboardViewed = (properties?: {
  totalLeads?: number;
  avgScore?: number;
  activeLeads?: number;
  estimatedMonthlyRevenue?: number;
}) => {
  if (!initialized) return;
  mixpanel.track('Dashboard Viewed', properties ?? {});
};

// ─── Lead Conversion / Stage Changes ─────────────────────────────────────────

export const trackLeadConverted = (properties: {
  leadId: string;
  fromStage: string;
  toStage: string;
  city?: string;
  source?: string;
  prospectScore?: number;
}) => {
  if (!initialized) return;
  mixpanel.track('Lead Converted', properties);
};

export const trackLeadStageChanged = (properties: {
  leadId: string;
  fromStage: string;
  toStage: string;
  city?: string;
  source?: string;
  prospectScore?: number;
  bulkCount?: number;
}) => {
  if (!initialized) return;
  mixpanel.track('Lead Stage Changed', properties);
};

// ─── Email ────────────────────────────────────────────────────────────────────

export const trackEmailSent = (properties: {
  leadId?: string;
  cadenceStep?: string;
  toAddress?: string;
  success: boolean;
  errorMessage?: string;
}) => {
  if (!initialized) return;
  mixpanel.track('Email Sent', properties);
};

// ─── Source Performance ───────────────────────────────────────────────────────

export const trackSourceSynced = (properties: {
  source: string;
  success: boolean;
  leadsCount?: number;
  errorMessage?: string;
}) => {
  if (!initialized) return;
  mixpanel.track('Source Synced', properties);
};

export const trackSourceConnectionTested = (properties: {
  source: string;
  success: boolean;
}) => {
  if (!initialized) return;
  mixpanel.track('Source Connection Tested', properties);
};

// ─── Lead Management ─────────────────────────────────────────────────────────

export const trackLeadsExported = (properties: {
  format: 'csv' | 'json' | 'crm';
  count: number;
}) => {
  if (!initialized) return;
  mixpanel.track('Leads Exported', properties);
};

export const trackLeadsFiltered = (properties: {
  filterCount: number;
  resultCount: number;
  filtersApplied: string[];
}) => {
  if (!initialized) return;
  mixpanel.track('Leads Filtered', properties);
};

export const trackLeadDetailViewed = (properties: {
  leadId: string;
  city?: string;
  source?: string;
  stage?: string;
  prospectScore?: number;
}) => {
  if (!initialized) return;
  mixpanel.track('Lead Detail Viewed', properties);
};

export const trackCSVUploaded = (properties: {
  rowCount?: number;
  success: boolean;
  errorMessage?: string;
}) => {
  if (!initialized) return;
  mixpanel.track('CSV Uploaded', properties);
};

// ─── Map View ─────────────────────────────────────────────────────────────────

export const trackMapViewed = (properties?: { leadCount?: number }) => {
  if (!initialized) return;
  mixpanel.track('Map Viewed', properties ?? {});
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export const trackSettingsTabViewed = (tab: string) => {
  if (!initialized) return;
  mixpanel.track('Settings Tab Viewed', { tab });
};

// ─── Sync Health ──────────────────────────────────────────────────────────────

export const trackSyncHealthViewed = () => {
  if (!initialized) return;
  mixpanel.track('Sync Health Viewed');
};

export const trackSyncRetryTriggered = (properties: {
  operationType: string;
  operationId: string;
  attemptNumber: number;
}) => {
  if (!initialized) return;
  mixpanel.track('Sync Retry Triggered', properties);
};

export const trackSyncValidationError = (properties: {
  operationType: string;
  errorCode: string;
  errorMessage: string;
}) => {
  if (!initialized) return;
  mixpanel.track('Sync Validation Error', properties);
};

export const trackManualRecovery = (properties: {
  operationType: string;
  operationId: string;
}) => {
  if (!initialized) return;
  mixpanel.track('Manual Recovery Triggered', properties);
};

// ─── Real-time ────────────────────────────────────────────────────────────────

export const trackRealtimeEvent = (properties: {
  eventType: 'lead_stage_change' | 'new_contact' | 'workflow_trigger';
  leadId?: string;
  detail?: string;
}) => {
  if (!initialized) return;
  mixpanel.track('Realtime Event Received', properties);
};

// ─── User Identity ────────────────────────────────────────────────────────────

export const identifyUser = (userId: string, properties?: Record<string, unknown>) => {
  if (!initialized) return;
  mixpanel.identify(userId);
  if (properties) {
    mixpanel.people.set(properties);
  }
};

export const resetMixpanel = () => {
  if (!initialized) return;
  mixpanel.reset();
};
