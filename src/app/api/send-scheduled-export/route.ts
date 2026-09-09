import { NextRequest, NextResponse } from 'next/server';
import { getResendClient, getResendFrom } from '@/lib/email/resend';

interface LeadRow {
  [key: string]: unknown;
}

function buildCSV(rows: LeadRow[], columns: string[]): string {
  const headers = columns.join(',');
  const rowLines = rows.map((row) =>
    columns
      .map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = Array.isArray(val) ? val.join('; ') : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(',')
  );
  return [headers, ...rowLines].join('\n');
}

function buildCallAnalyticsCSV(analyticsData: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push('TRAVLR Call Analytics Export');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Volume summary
  lines.push('=== CALL VOLUME SUMMARY ===');
  lines.push('Metric,Value');
  const summary = analyticsData.summary as Record<string, unknown> || {};
  lines.push(`Total Calls,${summary.totalCalls ?? 0}`);
  lines.push(`Avg Duration (sec),${summary.avgDuration ?? 0}`);
  lines.push(`Conversion Rate,${summary.conversionRate ?? 0}%`);
  lines.push(`Interested,${summary.interested ?? 0}`);
  lines.push(`Callback,${summary.callback ?? 0}`);
  lines.push(`Voicemail,${summary.voicemail ?? 0}`);
  lines.push(`No Answer,${summary.noAnswer ?? 0}`);
  lines.push('');

  // Agent breakdown
  lines.push('=== CONVERSION BY AGENT ===');
  lines.push('Agent,Total Calls,Interested,Callback,Voicemail,No Answer,Conversion Rate');
  const agents = analyticsData.agents as LeadRow[] || [];
  agents.forEach((a) => {
    lines.push(`${a.agentName},${a.totalCalls},${a.interested},${a.callback},${a.voicemail},${a.noAnswer},${a.conversionRate}%`);
  });
  lines.push('');

  // Daily trending
  lines.push('=== DAILY TRENDING ===');
  lines.push('Date,Total Calls,Interested,Callback');
  const daily = analyticsData.daily as LeadRow[] || [];
  daily.forEach((d) => {
    lines.push(`${d.date},${d.calls},${d.interested},${d.callback}`);
  });

  return lines.join('\n');
}

function buildSystemHealthCSV(healthData: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push('TRAVLR System Health SLA Export');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('=== SERVICE UPTIME SLA ===');
  lines.push('Service,Status,30d Uptime,90d Uptime,SLA Target,SLA Met,Response Time (ms)');
  const services = healthData.services as LeadRow[] || [];
  services.forEach((s) => {
    const slaMet = Number(s.uptime30d) >= Number(s.slaTarget) ? 'YES' : 'NO';
    lines.push(`${s.name},${s.status},${s.uptime30d}%,${s.uptime90d}%,${s.slaTarget}%,${slaMet},${s.responseTime ?? 'N/A'}`);
  });
  lines.push('');

  lines.push('=== THRESHOLD ALERTS ===');
  lines.push('Service,Threshold,Current Value,Alert Triggered');
  const thresholds = healthData.thresholds as LeadRow[] || [];
  thresholds.forEach((t) => {
    lines.push(`${t.service},${t.threshold}%,${t.current}%,${t.triggered ? 'YES' : 'NO'}`);
  });

  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      scheduleId, scheduleName, leads, columns, fileFormat,
      recipientEmails, frequency, reportType,
      analyticsData, healthData,
    } = body;

    if (!recipientEmails?.length) {
      return NextResponse.json({ success: false, error: 'Missing recipient emails' }, { status: 400 });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    let content = '';
    let fileName = '';
    let subjectLabel = scheduleName ?? 'Export';

    if (reportType === 'call_analytics' && analyticsData) {
      content = buildCallAnalyticsCSV(analyticsData as Record<string, unknown>);
      fileName = `travlr-call-analytics-${dateStr}.csv`;
      subjectLabel = scheduleName ?? 'Call Analytics Report';
    } else if (reportType === 'system_health' && healthData) {
      content = buildSystemHealthCSV(healthData as Record<string, unknown>);
      fileName = `travlr-system-health-sla-${dateStr}.csv`;
      subjectLabel = scheduleName ?? 'System Health SLA Report';
    } else if (leads && columns) {
      content = buildCSV(leads as LeadRow[], columns as string[]);
      const ext = fileFormat === 'xlsx' ? 'tsv' : 'csv';
      fileName = `travlr-leads-${dateStr}.${ext}`;
      subjectLabel = scheduleName ?? 'Lead Export';
    } else {
      return NextResponse.json({ success: false, error: 'Missing export data' }, { status: 400 });
    }

    const isCallAnalytics = reportType === 'call_analytics';
    const isHealth = reportType === 'system_health';

    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f9fafb;">
        <div style="background: white; border-radius: 12px; padding: 28px; border: 1px solid #e5e7eb;">
          <h2 style="color: #1a1a2e; margin: 0 0 8px 0; font-size: 20px;">
            ${isCallAnalytics ? '📊' : isHealth ? '🏥' : '📁'} ${subjectLabel}
          </h2>
          <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">
            Your <strong>${frequency ?? 'scheduled'}</strong> report is attached as <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${fileName}</code>.
          </p>
          ${isCallAnalytics && analyticsData ? `
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h3 style="color: #166534; margin: 0 0 10px 0; font-size: 14px;">📈 Quick Summary</h3>
            <table style="width:100%; font-size: 13px; color: #374151;">
              <tr><td style="padding:3px 0;"><strong>Total Calls:</strong></td><td>${(analyticsData as Record<string,unknown>).summary ? ((analyticsData as Record<string,unknown>).summary as Record<string,unknown>).totalCalls : 'N/A'}</td></tr>
              <tr><td style="padding:3px 0;"><strong>Conversion Rate:</strong></td><td>${(analyticsData as Record<string,unknown>).summary ? ((analyticsData as Record<string,unknown>).summary as Record<string,unknown>).conversionRate : 'N/A'}%</td></tr>
            </table>
          </div>` : ''}
          ${isHealth && healthData ? `
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h3 style="color: #1e40af; margin: 0 0 10px 0; font-size: 14px;">🔍 SLA Status</h3>
            <p style="font-size: 13px; color: #374151; margin: 0;">See attached CSV for full uptime SLA breakdown and threshold alerts.</p>
          </div>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 11px; margin: 0;">
            Sent by TRAVLR Prospect Finder · Schedule ID: ${scheduleId ?? 'manual'} · ${new Date().toUTCString()}
          </p>
        </div>
      </div>
    `;

    const { data, error } = await getResendClient().emails.send({
      from: getResendFrom(),
      to: recipientEmails as string[],
      subject: `[TRAVLR] ${subjectLabel} — ${dateStr}`,
      html: htmlBody,
      attachments: [
        {
          filename: fileName,
          content: Buffer.from(content).toString('base64'),
        },
      ],
    });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
