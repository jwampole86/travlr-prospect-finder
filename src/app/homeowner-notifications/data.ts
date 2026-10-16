import 'server-only';

import { isProtectedContact } from '@/lib/protectedContacts';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

import type {
  HomeownerAlert,
  HomeownerDeliveryRow,
  HomeownerLinkRow,
  HomeownerNotificationsPageData,
  HomeownerPreferenceRow,
} from './components/types';

type LeadRow = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  owner_name: string | null;
  contact_name: string | null;
  sms_opted_out_at: string | null;
  email_opt_in: boolean | null;
};

type PropertyHomeownerRow = {
  id: string;
  lead_id: string;
  homeowner_user_id: string;
  permission_level: string;
};

type PrefRow = {
  id: string;
  homeowner_id: string;
  property_id: string | null;
  channel_email: boolean | null;
  channel_sms: boolean | null;
  channel_in_app: boolean | null;
  notify_new_booking: boolean | null;
  notify_payout_processed: boolean | null;
  notify_request_update: boolean | null;
  notify_monthly_statement: boolean | null;
  updated_at: string;
};

type AlertRow = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  severity: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type DeliveryRow = {
  id: string;
  lead_id: string;
  status: string;
  subject: string | null;
  recipient_email: string | null;
  sent_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  failure_reason: string | null;
  bounce_type: string | null;
  metadata: Record<string, unknown> | null;
};

type ProfileRow = { id: string; full_name: string | null; email: string | null };

type HomeownerProfileRow = { user_id: string; full_name: string | null; notification_email: string | null; email: string | null };

function propertyLabel(lead: LeadRow | undefined): string {
  if (!lead) return 'Unknown property';
  return [lead.address, lead.city, lead.state].filter(Boolean).join(', ') || 'Unknown property';
}

function personLabel(homeownerId: string, userProfile: ProfileRow | undefined, homeownerProfile: HomeownerProfileRow | undefined): string {
  return homeownerProfile?.full_name || userProfile?.full_name || homeownerProfile?.notification_email || homeownerProfile?.email || userProfile?.email || `User ${homeownerId.slice(0, 8)}`;
}

async function homeownerEmailRows(db: ReturnType<typeof getSupabaseAdmin>): Promise<DeliveryRow[]> {
  const [reports, confirmations] = await Promise.all([
    db
      .from('outreach_history')
      .select('id, lead_id, status, subject, recipient_email, sent_at, delivered_at, opened_at, failure_reason, bounce_type, metadata')
      .eq('channel', 'email')
      .contains('metadata', { kind: 'homeowner_report' })
      .order('sent_at', { ascending: false })
      .limit(20),
    db
      .from('outreach_history')
      .select('id, lead_id, status, subject, recipient_email, sent_at, delivered_at, opened_at, failure_reason, bounce_type, metadata')
      .eq('channel', 'email')
      .contains('metadata', { kind: 'homeowner_confirmation' })
      .order('sent_at', { ascending: false })
      .limit(20),
  ]);

  if (reports.error) throw new Error(reports.error.message);
  if (confirmations.error) throw new Error(confirmations.error.message);

  return [...((reports.data ?? []) as DeliveryRow[]), ...((confirmations.data ?? []) as DeliveryRow[])]
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
    .slice(0, 30);
}

export async function getHomeownerNotificationsPageData(): Promise<HomeownerNotificationsPageData> {
  const db = getSupabaseAdmin();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    linksCount,
    prefsCount,
    suppressionsCount,
    optedOutCount,
    recentAlertCount,
    reportCount,
    confirmationCount,
    alertsResult,
    linksResult,
    prefsResult,
    homeownerDeliveries,
  ] = await Promise.all([
    db.from('property_homeowners').select('id', { count: 'exact', head: true }),
    db.from('homeowner_notification_prefs').select('id', { count: 'exact', head: true }),
    db.from('sms_suppressions').select('phone_e164', { count: 'exact', head: true }),
    db.from('leads').select('id', { count: 'exact', head: true }).not('sms_opted_out_at', 'is', null),
    db.from('app_notifications').select('id', { count: 'exact', head: true }).in('type', ['homeowner_inquiry', 'homeowner_email_bounced']).gte('created_at', since24h),
    db.from('outreach_history').select('id', { count: 'exact', head: true }).eq('channel', 'email').contains('metadata', { kind: 'homeowner_report' }).gte('sent_at', since30d),
    db.from('outreach_history').select('id', { count: 'exact', head: true }).eq('channel', 'email').contains('metadata', { kind: 'homeowner_confirmation' }).gte('sent_at', since30d),
    db
      .from('app_notifications')
      .select('id, type, title, message, severity, created_at, metadata')
      .in('type', ['homeowner_inquiry', 'homeowner_email_bounced'])
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .from('property_homeowners')
      .select('id, lead_id, homeowner_user_id, permission_level')
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('homeowner_notification_prefs')
      .select('id, homeowner_id, property_id, channel_email, channel_sms, channel_in_app, notify_new_booking, notify_payout_processed, notify_request_update, notify_monthly_statement, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100),
    homeownerEmailRows(db),
  ]);

  if (alertsResult.error) throw new Error(alertsResult.error.message);
  if (linksResult.error) throw new Error(linksResult.error.message);
  if (prefsResult.error) throw new Error(prefsResult.error.message);

  const links = (linksResult.data ?? []) as PropertyHomeownerRow[];
  const prefs = (prefsResult.data ?? []) as PrefRow[];
  const alerts = (alertsResult.data ?? []) as AlertRow[];
  const deliveryRows = homeownerDeliveries;

  const leadIds = Array.from(new Set([
    ...links.map((row) => row.lead_id),
    ...alerts.map((row) => typeof row.metadata?.lead_id === 'string' ? row.metadata.lead_id : null).filter((value): value is string => Boolean(value)),
    ...deliveryRows.map((row) => row.lead_id),
  ]));
  const homeownerIds = Array.from(new Set([
    ...links.map((row) => row.homeowner_user_id),
    ...prefs.map((row) => row.homeowner_id),
  ]));

  const [leadResult, userProfileResult, homeownerProfileResult] = await Promise.all([
    leadIds.length
      ? db.from('leads').select('id, address, city, state, owner_name, contact_name, sms_opted_out_at, email_opt_in').in('id', leadIds)
      : Promise.resolve({ data: [], error: null }),
    homeownerIds.length
      ? db.from('user_profiles').select('id, full_name, email').in('id', homeownerIds)
      : Promise.resolve({ data: [], error: null }),
    homeownerIds.length
      ? db.from('homeowner_profiles').select('user_id, full_name, notification_email, email').in('user_id', homeownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (leadResult.error) throw new Error(leadResult.error.message);
  if (userProfileResult.error) throw new Error(userProfileResult.error.message);
  if (homeownerProfileResult.error) throw new Error(homeownerProfileResult.error.message);

  const leadsById = new Map(((leadResult.data ?? []) as LeadRow[]).map((row) => [row.id, row]));
  const userProfilesById = new Map(((userProfileResult.data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
  const homeownerProfilesById = new Map(((homeownerProfileResult.data ?? []) as HomeownerProfileRow[]).map((row) => [row.user_id, row]));

  const linkRows: HomeownerLinkRow[] = links.map((row) => {
    const lead = leadsById.get(row.lead_id);
    const homeownerLabel = personLabel(row.homeowner_user_id, userProfilesById.get(row.homeowner_user_id), homeownerProfilesById.get(row.homeowner_user_id));
    return {
      id: row.id,
      homeownerId: row.homeowner_user_id,
      homeownerLabel,
      propertyId: row.lead_id,
      propertyLabel: propertyLabel(lead),
      permissionLevel: row.permission_level,
      protectedContact: isProtectedContact(homeownerLabel, lead?.owner_name, lead?.contact_name),
      smsOptedOutAt: lead?.sms_opted_out_at ?? null,
      emailOptIn: lead?.email_opt_in ?? null,
    };
  });

  const preferenceRows: HomeownerPreferenceRow[] = prefs.map((row) => ({
    id: row.id,
    homeownerLabel: personLabel(row.homeowner_id, userProfilesById.get(row.homeowner_id), homeownerProfilesById.get(row.homeowner_id)),
    propertyLabel: propertyLabel(row.property_id ? leadsById.get(row.property_id) : undefined),
    channelEmail: row.channel_email ?? false,
    channelSms: row.channel_sms ?? false,
    channelInApp: row.channel_in_app ?? false,
    notifyNewBooking: row.notify_new_booking ?? false,
    notifyPayoutProcessed: row.notify_payout_processed ?? false,
    notifyRequestUpdate: row.notify_request_update ?? false,
    notifyMonthlyStatement: row.notify_monthly_statement ?? false,
    updatedAt: row.updated_at,
  }));

  const alertRows: HomeownerAlert[] = alerts.map((row) => {
    const leadId = typeof row.metadata?.lead_id === 'string' ? row.metadata.lead_id : null;
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message ?? '',
      severity: row.severity,
      createdAt: row.created_at,
      leadId,
      leadLabel: leadId ? propertyLabel(leadsById.get(leadId)) : null,
    };
  });

  const homeownerEmailKinds = new Set(['homeowner_report', 'homeowner_confirmation']);
  const deliveryView: HomeownerDeliveryRow[] = deliveryRows
    .filter((row) => homeownerEmailKinds.has(String(row.metadata?.kind ?? '')))
    .map((row) => ({
      id: row.id,
      kind: String(row.metadata?.kind ?? 'email'),
      status: row.status,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      openedAt: row.opened_at,
      failureReason: row.failure_reason,
      bounceType: row.bounce_type,
      propertyLabel: propertyLabel(leadsById.get(row.lead_id)),
    }));

  return {
    summary: {
      linkedProperties: linksCount.count ?? linkRows.length,
      protectedContacts: linkRows.filter((row) => row.protectedContact).length,
      preferenceRows: prefsCount.count ?? preferenceRows.length,
      alertsLast24h: recentAlertCount.count ?? alertRows.length,
      homeownerEmailsLast30d: (reportCount.count ?? 0) + (confirmationCount.count ?? 0),
      smsSuppressions: suppressionsCount.count ?? 0,
      optedOutLeads: optedOutCount.count ?? 0,
    },
    alerts: alertRows,
    links: linkRows,
    preferences: preferenceRows,
    deliveries: deliveryView,
  };
}
