export type CronRunStatus = 'running' | 'success' | 'partial' | 'failed' | 'unrecorded';
export type CronHistorySource = 'cron_job_runs' | 'system_health_checks' | null;

export interface CronJobLastRun {
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  status: CronRunStatus;
  errorCount: number;
  summary: string;
  metadata: Record<string, unknown> | null;
}

export interface CronJobSummary {
  key: string;
  name: string;
  description: string;
  path: string;
  basePath: string;
  schedule: string;
  scheduleLabel: string;
  routeExists: boolean;
  spendsQuota: boolean;
  requiresConfirmation: boolean;
  confirmationMessage: string | null;
  historySource: CronHistorySource;
  lastRun: CronJobLastRun;
}

export interface CronRunHistoryRow {
  key: string;
  name: string;
  startedAt: string;
  completedAt: string | null;
  status: Exclude<CronRunStatus, 'unrecorded'>;
  errorCount: number;
  summary: string;
}

export interface CronMonitorPayload {
  fetchedAt: string;
  summary: {
    totalJobs: number;
    recordedJobs: number;
    unrecordedJobs: number;
    failingJobs: number;
    quotaJobs: number;
  };
  jobs: CronJobSummary[];
  recordedRuns: CronRunHistoryRow[];
}
