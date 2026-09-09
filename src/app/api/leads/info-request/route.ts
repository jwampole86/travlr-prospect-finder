import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { getChatCompletion } from '@/lib/ai/chatCompletion';

// ─── POST /api/leads/info-request ─────────────────────────────────────────────
// Generate a unique info-request link tied to a specific lead record.
// Agent-initiated: sends a short form to the homeowner to self-confirm contact info.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadId, sentVia = 'email' } = body;

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    const supabase = createClient();

    // Verify lead exists
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, address, city, state, zip')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Generate unique token
    const linkToken = crypto.randomUUID();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new';
    const infoRequestUrl = `${siteUrl}/info-request/${linkToken}`;

    // Store the info request record
    const { error: insertError } = await supabase
      .from('lead_info_requests')
      .insert({
        lead_id: leadId,
        link_token: linkToken,
        sent_via: sentVia,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Log to activity timeline
    await supabase.from('activity_events').insert({
      lead_id: leadId,
      event_type: 'info_request_sent',
      description: `Info request link sent via ${sentVia}`,
      metadata: { link_token: linkToken, sent_via: sentVia },
      created_at: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      link_token: linkToken,
      info_request_url: infoRequestUrl,
      lead_address: `${lead.address}, ${lead.city}, ${lead.state}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT /api/leads/info-request — Process homeowner submission ───────────────
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { linkToken, firstName, lastName, phone, email, addressConfirmed, addressAsSubmitted } = body;

    if (!linkToken || !firstName || !lastName || !phone || !email) {
      return NextResponse.json({ error: 'linkToken, firstName, lastName, phone, and email are required' }, { status: 400 });
    }

    const supabase = createClient();

    // Find the info request by token
    const { data: infoRequest, error: tokenError } = await supabase
      .from('lead_info_requests')
      .select('id, lead_id, submitted_at')
      .eq('link_token', linkToken)
      .single();

    if (tokenError || !infoRequest) {
      return NextResponse.json({ error: 'Invalid or expired link token' }, { status: 404 });
    }

    if (infoRequest.submitted_at) {
      return NextResponse.json({ error: 'This link has already been used' }, { status: 409 });
    }

    const leadId = infoRequest.lead_id;

    // Get the lead record
    const { data: lead } = await supabase
      .from('leads')
      .select('id, address, city, state, zip, contact_name, phone, email, assigned_agent_id')
      .eq('id', leadId)
      .single();

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Use Claude to generate a brief summary
    let claudeSummary = `Homeowner self-confirmed contact info via direct info-request link. Name: ${firstName} ${lastName}. Phone: ${phone}. Email: ${email}.`;
    try {
      const aiResponse = await getChatCompletion(
        'ANTHROPIC',
        'claude-haiku-4-5-20251001',
        [{
          role: 'user',
          content: `A homeowner responded to a direct info-request link for the property at ${lead.address}, ${lead.city}, ${lead.state}. They confirmed: Name: ${firstName} ${lastName}, Phone: ${phone}, Email: ${email}. Address confirmed: ${addressConfirmed !== false ? 'yes' : 'no — they edited it to: ' + (addressAsSubmitted || 'unknown')}. Write a 1-2 sentence plain-language summary for the agent's lead record. Be concise and factual.`,
        }],
        { temperature: 0.3, max_tokens: 120 }
      );
      const content = aiResponse?.choices?.[0]?.message?.content;
      if (content) claudeSummary = content;
    } catch {
      // Use default summary
    }

    // Update the info request record with submission
    await supabase
      .from('lead_info_requests')
      .update({
        submitted_at: new Date().toISOString(),
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        address_confirmed: addressConfirmed !== false,
        address_as_submitted: addressConfirmed === false ? addressAsSubmitted : null,
        claude_summary: claudeSummary,
      })
      .eq('id', infoRequest.id);

    // Update the lead record — self-submitted contact info takes priority
    await supabase
      .from('leads')
      .update({
        contact_name: `${firstName} ${lastName}`,
        phone,
        email,
        lead_status_tag: 'Warm — Contact Confirmed',
        contact_info_source: 'self_submitted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    // Flag address discrepancy for agent review if homeowner edited it
    if (addressConfirmed === false && addressAsSubmitted) {
      await supabase.from('activity_events').insert({
        lead_id: leadId,
        event_type: 'address_discrepancy_flagged',
        description: `Homeowner edited pre-filled address. Original: ${lead.address}. Submitted: ${addressAsSubmitted}. Requires agent review.`,
        metadata: { original_address: lead.address, submitted_address: addressAsSubmitted },
        created_at: new Date().toISOString(),
      }).catch(() => {});
    }

    // Log submission to activity timeline
    await supabase.from('activity_events').insert({
      lead_id: leadId,
      event_type: 'info_request_submitted',
      description: claudeSummary,
      metadata: { first_name: firstName, last_name: lastName, phone, email, address_confirmed: addressConfirmed !== false },
      created_at: new Date().toISOString(),
    }).catch(() => {});

    // Send high-priority notification to assigned agent
    if (lead.assigned_agent_id) {
      await supabase.from('notifications').insert({
        user_id: lead.assigned_agent_id,
        type: 'info_request_submitted',
        priority: 'high',
        title: 'Homeowner confirmed contact info',
        message: `${firstName} ${lastName} responded to your info request for ${lead.address}. Ready for direct outreach.`,
        lead_id: leadId,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      status_tag: 'Warm — Contact Confirmed',
      claude_summary: claudeSummary,
      address_discrepancy_flagged: addressConfirmed === false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
