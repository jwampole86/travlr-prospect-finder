"use client";

import { useMemo, useState } from 'react';
import { Bell, Mail, RefreshCw, Search, ShieldCheck, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
  EmptyState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
  buttonSecondary,
  inputClass,
} from '@/components/ops';

import type {
  HomeownerAlert,
  HomeownerDeliveryRow,
  HomeownerLinkRow,
  HomeownerNotificationsPageData,
  HomeownerPreferenceRow,
} from './types';

type TabKey = 'alerts' | 'preferences' | 'deliveries';

function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function matches(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

function alertTone(alert: HomeownerAlert): 'warning' | 'danger' | 'success' | 'default' {
  if (alert.type === 'homeowner_email_bounced') return 'danger';
  if (alert.severity === 'warning') return 'warning';
  if (alert.severity === 'success') return 'success';
  return 'default';
}

function deliveryTone(delivery: HomeownerDeliveryRow): 'success' | 'warning' | 'danger' | 'default' {
  if (delivery.status === 'opened' || delivery.status === 'delivered') return 'success';
  if (delivery.status === 'failed' || delivery.status === 'bounced') return 'danger';
  if (delivery.status === 'sent') return 'warning';
  return 'default';
}

function yesNo(value: boolean | null): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '—';
}

function preferenceChannels(row: HomeownerPreferenceRow): string {
  const channels = [row.channelEmail && 'Email', row.channelSms && 'SMS', row.channelInApp && 'In-app'].filter(Boolean);
  return channels.length ? channels.join(', ') : 'No channels enabled';
}

export default function HomeownerNotificationsClient({ initialData }: { initialData: HomeownerNotificationsPageData }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('alerts');
  const [search, setSearch] = useState('');

  const filteredAlerts = useMemo(
    () => initialData.alerts.filter((alert) => matches([alert.title, alert.message, alert.leadLabel].filter(Boolean).join(' '), search)),
    [initialData.alerts, search],
  );
  const filteredLinks = useMemo(
    () => initialData.links.filter((row) => matches([row.homeownerLabel, row.propertyLabel, row.permissionLevel].join(' '), search)),
    [initialData.links, search],
  );
  const filteredPrefs = useMemo(
    () => initialData.preferences.filter((row) => matches([row.homeownerLabel, row.propertyLabel, preferenceChannels(row)].join(' '), search)),
    [initialData.preferences, search],
  );
  const filteredDeliveries = useMemo(
    () => initialData.deliveries.filter((row) => matches([row.kind, row.subject, row.recipientEmail, row.propertyLabel].filter(Boolean).join(' '), search)),
    [initialData.deliveries, search],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader
        icon={Bell}
        title="Homeowner Notifications"
        description="Read-only operations view. It reflects the real homeowner tables and tracked delivery logs without sending new email or SMS."
        actions={
          <button type="button" onClick={() => router.refresh()} className={buttonSecondary}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      <StatGrid
        columns={4}
        stats={[
          { label: 'Linked homeowner properties', value: initialData.summary.linkedProperties.toLocaleString(), hint: 'Exact count from property_homeowners', icon: Bell, tone: 'primary' },
          { label: 'Preference rows', value: initialData.summary.preferenceRows.toLocaleString(), hint: 'Exact count from homeowner_notification_prefs', icon: Mail, tone: 'default' },
          { label: 'Alerts in 24h', value: initialData.summary.alertsLast24h.toLocaleString(), hint: 'homeowner_inquiry + homeowner_email_bounced', icon: Bell, tone: 'warning' },
          { label: 'Tracked homeowner emails', value: initialData.summary.homeownerEmailsLast30d.toLocaleString(), hint: 'homeowner_report + homeowner_confirmation in outreach_history', icon: Mail, tone: 'success' },
          { label: 'SMS suppressions', value: initialData.summary.smsSuppressions.toLocaleString(), hint: `${initialData.summary.optedOutLeads.toLocaleString()} leads have sms_opted_out_at set`, icon: Smartphone, tone: 'danger' },
          { label: 'Protected contacts linked', value: initialData.summary.protectedContacts.toLocaleString(), hint: 'Matched with protected Wampole contact guard', icon: ShieldCheck, tone: 'warning' },
        ]}
      />

      <Panel>
        <div className="grid gap-4 lg:grid-cols-[auto,1fr] lg:items-center">
          <SegmentedTabs
            tabs={[
              { key: 'alerts', label: 'Admin alerts', badge: initialData.alerts.length },
              { key: 'preferences', label: 'Links & preferences', badge: initialData.links.length },
              { key: 'deliveries', label: 'Tracked emails', badge: initialData.deliveries.length },
            ]}
            value={tab}
            onChange={(value) => setTab(value)}
          />
          <label className="relative block lg:ml-auto lg:w-96">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search the visible table"
              className={`${inputClass} pl-9`}
            />
          </label>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <Panel title={tab === 'alerts' ? 'Recent homeowner alerts' : tab === 'preferences' ? 'Notification coverage' : 'Tracked homeowner email deliveries'} padded={false}>
          {tab === 'alerts' ? (
            filteredAlerts.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={Bell} title="No homeowner alerts found" hint="This table only shows real homeowner-related app_notifications rows." />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredAlerts.map((alert) => (
                  <div key={alert.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={alertTone(alert)}>{alert.type.replace(/_/g, ' ')}</StatusPill>
                      <span className="text-xs text-muted-foreground">{relativeTime(alert.createdAt)}</span>
                      {alert.leadLabel ? <span className="text-xs text-muted-foreground">• {alert.leadLabel}</span> : null}
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground">{alert.title}</p>
                    {alert.message ? <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p> : null}
                  </div>
                ))}
              </div>
            )
          ) : null}

          {tab === 'preferences' ? (
            <div className="space-y-4 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Linked homeowner-property records</p>
                {filteredLinks.length === 0 ? (
                  <EmptyState icon={ShieldCheck} title="No property_homeowners rows" hint="Until a homeowner is linked to a property, no per-property preference row can exist." />
                ) : (
                  <div className="mt-3 space-y-3">
                    {filteredLinks.map((row: HomeownerLinkRow) => (
                      <div key={row.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{row.propertyLabel}</p>
                          <StatusPill>{row.permissionLevel}</StatusPill>
                          {row.protectedContact ? <StatusPill tone="danger">Protected contact</StatusPill> : null}
                          {row.smsOptedOutAt ? <StatusPill tone="warning">SMS opted out</StatusPill> : null}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{row.homeownerLabel}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Email opt-in: {yesNo(row.emailOptIn)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-foreground">Preference records</p>
                {filteredPrefs.length === 0 ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    No rows exist in homeowner_notification_prefs yet, so the product does not currently have per-property homeowner notification settings to display.
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {filteredPrefs.map((row: HomeownerPreferenceRow) => (
                      <div key={row.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{row.propertyLabel}</p>
                          <StatusPill tone="primary">{preferenceChannels(row)}</StatusPill>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{row.homeownerLabel}</p>
                        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <p>New booking: <span className="text-foreground">{yesNo(row.notifyNewBooking)}</span></p>
                          <p>Payout processed: <span className="text-foreground">{yesNo(row.notifyPayoutProcessed)}</span></p>
                          <p>Request update: <span className="text-foreground">{yesNo(row.notifyRequestUpdate)}</span></p>
                          <p>Monthly statement: <span className="text-foreground">{yesNo(row.notifyMonthlyStatement)}</span></p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {tab === 'deliveries' ? (
            filteredDeliveries.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={Mail} title="No tracked homeowner emails" hint="No homeowner_report or homeowner_confirmation rows were found in outreach_history for the current sample." />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredDeliveries.map((delivery: HomeownerDeliveryRow) => (
                  <div key={delivery.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={deliveryTone(delivery)}>{delivery.kind.replace(/_/g, ' ')}</StatusPill>
                      <StatusPill>{delivery.status}</StatusPill>
                      <span className="text-xs text-muted-foreground">{relativeTime(delivery.sentAt)}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground">{delivery.subject || 'No subject recorded'}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{delivery.recipientEmail || 'No recipient email stored'}</p>
                    {delivery.propertyLabel ? <p className="mt-1 text-xs text-muted-foreground">{delivery.propertyLabel}</p> : null}
                    {delivery.failureReason ? <p className="mt-2 text-xs text-danger">{delivery.failureReason}</p> : null}
                  </div>
                ))}
              </div>
            )
          ) : null}
        </Panel>

        <div className="space-y-6">
          <Panel title="Guardrails in effect">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>This page is intentionally read-only. It does not expose any button that sends homeowner email or SMS.</p>
              <p>The protected-contact guard still covers Jennifer and Spencer Wampole by surname, including trust / LLC variants, before SMS campaign sends proceed.</p>
              <p>Real suppression data is shown through <span className="font-medium text-foreground">sms_suppressions</span> and <span className="font-medium text-foreground">leads.sms_opted_out_at</span>; nothing here bypasses those checks.</p>
            </div>
          </Panel>

          <Panel title="What is actually live?">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">Admin alerts</span> come from app_notifications rows such as homeowner inquiries and homeowner report bounces.</p>
              <p><span className="font-medium text-foreground">Tracked homeowner emails</span> are only the kinds recorded in outreach_history today: homeowner_report and homeowner_confirmation.</p>
              <p><span className="font-medium text-foreground">Preference records</span> only exist when homeowner_notification_prefs has rows. Right now this view honestly shows an empty state when none are present.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
