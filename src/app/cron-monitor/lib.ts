import 'server-only';
import path from 'path';
import { existsSync } from 'fs';
import vercelConfig from '../../../vercel.json';

const JOB_DETAILS: Record<string, { name: string; description: string; spendsQuota?: boolean; requiresConfirmation?: boolean }> = {
  'interview-dispatch': {
    name: 'Interview Dispatch',
    description: 'Sends queued interview invitations and follow-up workflow updates.',
  },
  'listing-verification': {
    name: 'Listing Verification',
    description: 'Checks listing URLs and evidence so lead records stay accurate.',
    spendsQuota: true,
    requiresConfirmation: true,
  },
  'fsbo-skip-trace': {
    name: 'FSBO Skip Trace',
    description: 'Consumes skip-trace quota to enrich For Sale By Owner contact details.',
    spendsQuota: true,
    requiresConfirmation: true,
  },
  'regulation-research': {
    name: 'Regulation Research',
    description: 'Refreshes city regulation intelligence and applies updates to leads.',
    spendsQuota: true,
    requiresConfirmation: true,
  },
  'sms-campaign-harvest': {
    name: 'SMS Campaign Harvest',
    description: 'Pulls campaign engagement updates into reporting tables.',
    requiresConfirmation: true,
  },
  'cohost-refresh': {
    name: 'Co-Host Refresh',
    description: 'Refreshes Co-Host listing data and downstream STR metrics.',
    spendsQuota: true,
    requiresConfirmation: true,
  },
  'listing-recheck': {
    name: 'Listing Recheck',
    description: 'Rechecks listing links and freshness on recently imported leads.',
    requiresConfirmation: true,
  },
  'system-health': {
    name: 'System Health',
    description: 'Runs the service health checks that power the status dashboards.',
  },
  'lead-rescore': {
    name: 'Lead Rescore',
    description: 'Recalculates lead scores and flags stale ranking signals.',
    requiresConfirmation: true,
  },
  'airdna-enrich': {
    name: 'AirDNA Enrich',
    description: 'Consumes AirDNA quota to refresh STR revenue and occupancy estimates.',
    spendsQuota: true,
    requiresConfirmation: true,
  },
  'cohost-skiptrace': {
    name: 'Co-Host Skip Trace',
    description: 'Consumes skip-trace quota for Co-Host homeowner contact enrichment.',
    spendsQuota: true,
    requiresConfirmation: true,
  },
  'cohost-email-retry': {
    name: 'Co-Host Email Retry',
    description: 'Retries failed Co-Host emails and records delivery outcomes.',
    spendsQuota: true,
    requiresConfirmation: true,
  },
  'docusign-reconcile': {
    name: 'DocuSign Reconcile',
    description: 'Reconciles envelope state back into the application.',
    requiresConfirmation: true,
  },
  'source-sync': {
    name: 'Source Sync',
    description: 'Cycles paid listing-source imports across portfolio states.',
    spendsQuota: true,
    requiresConfirmation: true,
  },
};

function titleize(slug: string) {
  return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function humanizeCron(expression: string) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = expression.trim().split(/\s+/);
  if (expression === '* * * * *') return 'Every minute';
  if (/^\*\/\d+$/.test(minute) && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every ${minute.slice(2)} minutes`;
  }
  if (/^\*\/\d+$/.test(hour) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return minute === '0' ? `Every ${hour.slice(2)} hours` : `Every ${hour.slice(2)} hours at :${minute.padStart(2, '0')}`;
  }
  if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Hourly at :${minute.padStart(2, '0')}`;
  }
  return expression;
}

function isRealSecret(secret: string | undefined): secret is string {
  return Boolean(secret) && !/your-|placeholder|changeme|example/i.test(secret || '');
}

export function getCronProxySecret() {
  return [process.env.SEQUENCE_JOB_SECRET, process.env.CRON_SECRET].find(isRealSecret) || null;
}

export function getScheduledCronJobs() {
  return (vercelConfig.crons || []).map((entry) => {
    const parsed = new URL(entry.path, 'https://travlr.local');
    const slug = parsed.pathname.split('/').filter(Boolean).pop() || parsed.pathname;
    const details = JOB_DETAILS[slug] || { name: titleize(slug), description: `Runs ${humanizeCron(entry.schedule).toLowerCase()}.` };
    const routePath = path.join(process.cwd(), 'src', 'app', 'api', 'cron', slug, 'route.ts');
    const requiresConfirmation = details.requiresConfirmation ?? details.spendsQuota ?? false;

    return {
      key: slug,
      name: details.name,
      description: details.description,
      path: entry.path,
      basePath: parsed.pathname,
      schedule: entry.schedule,
      scheduleLabel: humanizeCron(entry.schedule),
      routeExists: existsSync(routePath),
      spendsQuota: Boolean(details.spendsQuota),
      requiresConfirmation,
      confirmationMessage: requiresConfirmation
        ? `Run ${details.name} now? This job can trigger real downstream work${details.spendsQuota ? ' and may consume paid quota' : ''}.`
        : null,
      aliases: [slug, parsed.pathname, entry.path],
    };
  });
}
