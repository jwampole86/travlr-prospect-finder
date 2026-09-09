'use server';

import { NextRequest, NextResponse } from 'next/server';

const HUBSPOT_API_KEY = process.env.NEXT_PUBLIC_HUBSPOT_API_KEY;
const BASE_URL = 'https://api.hubapi.com';

async function hubspotRequest(path: string, method: string, body?: object) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `HubSpot API error: ${res.status}`);
  }
  return data;
}

// Push agent performance metrics as a HubSpot note on a contact
async function pushAgentMetricsNote(contactId: string, metrics: {
  agentName: string;
  closedLeads: number;
  conversionRate: number;
  avgDaysToClose: number;
  period: string;
}): Promise<string> {
  const noteBody = `Agent Performance Metrics (${metrics.period})\n` +
    `Agent: ${metrics.agentName}\n` +
    `Closed Leads: ${metrics.closedLeads}\n` +
    `Conversion Rate: ${(metrics.conversionRate * 100).toFixed(1)}%\n` +
    `Avg Days to Close: ${metrics.avgDaysToClose}\n` +
    `Synced from TravlrPro`;

  const note = await hubspotRequest('/crm/v3/objects/notes', 'POST', {
    properties: {
      hs_note_body: noteBody,
      hs_timestamp: new Date().toISOString(),
    },
    associations: [
      {
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
      },
    ],
  });
  return note.id;
}

// Push closed lead conversion outcome as a deal note
async function pushConversionOutcome(payload: {
  contactId: string;
  dealId?: string;
  leadAddress: string;
  outcome: 'converted' | 'lost' | 'pending';
  agentName?: string;
  closedAt: string;
  notes?: string;
}): Promise<void> {
  const noteBody = `Conversion Outcome: ${payload.outcome.toUpperCase()}\n` +
    `Property: ${payload.leadAddress}\n` +
    (payload.agentName ? `Agent: ${payload.agentName}\n` : '') +
    `Closed: ${new Date(payload.closedAt).toLocaleDateString()}\n` +
    (payload.notes ? `Notes: ${payload.notes}\n` : '') +
    `Synced from TravlrPro`;

  const associations: object[] = [
    {
      to: { id: payload.contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
    },
  ];

  if (payload.dealId) {
    associations.push({
      to: { id: payload.dealId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }],
    });
  }

  await hubspotRequest('/crm/v3/objects/notes', 'POST', {
    properties: {
      hs_note_body: noteBody,
      hs_timestamp: new Date().toISOString(),
    },
    associations,
  });
}

// Pull HubSpot contact history (notes, emails, calls) to enrich lead records
async function pullContactHistory(email: string): Promise<{
  contactId: string | null;
  touchPoints: Array<{
    type: string;
    timestamp: string;
    subject?: string;
    body?: string;
  }>;
}> {
  // Search for contact by email
  let contactId: string | null = null;
  try {
    const searchRes = await hubspotRequest('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email', 'firstname', 'lastname', 'hs_object_id'],
      limit: 1,
    });
    if (searchRes.results?.length > 0) {
      contactId = searchRes.results[0].id;
    }
  } catch {
    return { contactId: null, touchPoints: [] };
  }

  if (!contactId) return { contactId: null, touchPoints: [] };

  const touchPoints: Array<{ type: string; timestamp: string; subject?: string; body?: string }> = [];

  // Fetch notes
  try {
    const notesRes = await hubspotRequest(
      `/crm/v3/objects/contacts/${contactId}/associations/notes`,
      'GET'
    );
    const noteIds = (notesRes.results || []).slice(0, 10).map((r: { id: string }) => r.id);
    if (noteIds.length > 0) {
      const notesData = await hubspotRequest('/crm/v3/objects/notes/batch/read', 'POST', {
        inputs: noteIds.map((id: string) => ({ id })),
        properties: ['hs_note_body', 'hs_timestamp'],
      });
      for (const note of notesData.results || []) {
        touchPoints.push({
          type: 'note',
          timestamp: note.properties?.hs_timestamp || note.createdAt,
          body: note.properties?.hs_note_body,
        });
      }
    }
  } catch { /* ignore */ }

  // Fetch emails
  try {
    const emailsRes = await hubspotRequest(
      `/crm/v3/objects/contacts/${contactId}/associations/emails`,
      'GET'
    );
    const emailIds = (emailsRes.results || []).slice(0, 5).map((r: { id: string }) => r.id);
    if (emailIds.length > 0) {
      const emailsData = await hubspotRequest('/crm/v3/objects/emails/batch/read', 'POST', {
        inputs: emailIds.map((id: string) => ({ id })),
        properties: ['hs_email_subject', 'hs_email_text', 'hs_timestamp'],
      });
      for (const email of emailsData.results || []) {
        touchPoints.push({
          type: 'email',
          timestamp: email.properties?.hs_timestamp || email.createdAt,
          subject: email.properties?.hs_email_subject,
          body: email.properties?.hs_email_text?.substring(0, 200),
        });
      }
    }
  } catch { /* ignore */ }

  // Sort by timestamp desc
  touchPoints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { contactId, touchPoints };
}

export async function POST(req: NextRequest) {
  if (!HUBSPOT_API_KEY || HUBSPOT_API_KEY === 'your-hubspot-api-key-here') {
    return NextResponse.json({ error: 'HubSpot API key not configured', skipped: true }, { status: 200 });
  }

  let body: {
    action: 'push_metrics' | 'push_conversion' | 'pull_history';
    [key: string]: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    if (body.action === 'push_metrics') {
      const noteId = await pushAgentMetricsNote(
        body.contactId as string,
        body.metrics as {
          agentName: string;
          closedLeads: number;
          conversionRate: number;
          avgDaysToClose: number;
          period: string;
        }
      );
      return NextResponse.json({ success: true, noteId });
    }

    if (body.action === 'push_conversion') {
      await pushConversionOutcome(body as {
        contactId: string;
        dealId?: string;
        leadAddress: string;
        outcome: 'converted' | 'lost' | 'pending';
        agentName?: string;
        closedAt: string;
        notes?: string;
      });
      return NextResponse.json({ success: true });
    }

    if (body.action === 'pull_history') {
      const result = await pullContactHistory(body.email as string);
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[HubSpot sync-metrics]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
