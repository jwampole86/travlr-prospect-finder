'use server';

import { NextRequest, NextResponse } from 'next/server';

const HUBSPOT_API_KEY = process.env.NEXT_PUBLIC_HUBSPOT_API_KEY;
const BASE_URL = 'https://api.hubapi.com';

interface PushClosedDealPayload {
  leadId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  dealRevenue?: number | null;
  dealNotes?: string;
  closedAt: string;
  portfolioKey?: string;
}

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

async function findOrCreateContact(email: string, name: string, phone?: string): Promise<string> {
  // Search for existing contact by email
  if (email) {
    try {
      const searchRes = await hubspotRequest('/crm/v3/objects/contacts/search', 'POST', {
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
        properties: ['email', 'firstname', 'lastname'],
        limit: 1,
      });
      if (searchRes.results?.length > 0) {
        return searchRes.results[0].id;
      }
    } catch {
      // continue to create
    }
  }

  // Create new contact
  const nameParts = (name || '').trim().split(' ');
  const firstname = nameParts[0] || 'Unknown';
  const lastname = nameParts.slice(1).join(' ') || 'Homeowner';

  const contactBody: Record<string, string> = { firstname, lastname };
  if (email) contactBody.email = email;
  if (phone) contactBody.phone = phone;

  const created = await hubspotRequest('/crm/v3/objects/contacts', 'POST', {
    properties: contactBody,
  });
  return created.id;
}

async function createDeal(
  contactId: string,
  address: string,
  city: string,
  state: string,
  revenue: number | null,
  closedAt: string,
  notes?: string
): Promise<string> {
  const dealName = `${address}, ${city}, ${state} — Closed Deal`;
  const closeDateMs = new Date(closedAt).getTime();

  const dealBody: Record<string, string> = {
    dealname: dealName,
    dealstage: 'closedwon',
    pipeline: 'default',
    closedate: new Date(closedAt).toISOString().split('T')[0],
  };

  if (revenue != null && revenue > 0) {
    dealBody.amount = String(revenue);
  }
  if (notes) {
    dealBody.description = notes;
  }

  const deal = await hubspotRequest('/crm/v3/objects/deals', 'POST', {
    properties: dealBody,
    associations: [
      {
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
      },
    ],
  });

  return deal.id;
}

export async function POST(req: NextRequest) {
  if (!HUBSPOT_API_KEY || HUBSPOT_API_KEY === 'your-hubspot-api-key-here') {
    return NextResponse.json(
      { error: 'HubSpot API key not configured', skipped: true },
      { status: 200 }
    );
  }

  let payload: PushClosedDealPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const {
    address,
    city,
    state,
    zip,
    contactName,
    contactEmail,
    contactPhone,
    dealRevenue,
    dealNotes,
    closedAt,
  } = payload;

  try {
    // Step 1: Find or create contact
    const contactId = await findOrCreateContact(
      contactEmail || '',
      contactName || `${address} Owner`,
      contactPhone
    );

    // Step 2: Create deal linked to contact
    const dealId = await createDeal(
      contactId,
      address,
      city,
      state,
      dealRevenue ?? null,
      closedAt,
      dealNotes
    );

    return NextResponse.json({
      success: true,
      hubspotContactId: contactId,
      hubspotDealId: dealId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[HubSpot push-closed-deal]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
