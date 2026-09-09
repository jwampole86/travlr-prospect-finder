import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/sms/inbound-thread
 * Called by the inbound SMS webhook to upsert conversation threads.
 * Also handles GET for thread listing and PUT for status updates.
 */

const supabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, message_body, lead_id, campaign_id, twilio_message_sid } = body;

    if (!phone || !message_body) {
      return NextResponse.json({ error: 'phone and message_body required' }, { status: 400 });
    }

    const db = supabase();

    // Find or create thread
    let threadId: string | null = null;

    const threadQuery = campaign_id
      ? db.from('sms_conversation_threads').select('id,unread_count').eq('campaign_id', campaign_id).eq('phone', phone).maybeSingle()
      : db.from('sms_conversation_threads').select('id,unread_count').eq('phone', phone).is('campaign_id', null).maybeSingle();

    const { data: existing } = await threadQuery;

    if (existing) {
      threadId = existing.id;
      // Update thread with latest inbound
      await db.from('sms_conversation_threads').update({
        last_inbound_at: new Date().toISOString(),
        last_message_preview: message_body.slice(0, 100),
        unread_count: (existing.unread_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', threadId);
    } else {
      // Create new thread
      const { data: newThread } = await db.from('sms_conversation_threads').insert({
        campaign_id: campaign_id ?? null,
        lead_id: lead_id ?? null,
        phone,
        conversation_status: 'pending',
        last_inbound_at: new Date().toISOString(),
        last_message_preview: message_body.slice(0, 100),
        unread_count: 1,
      }).select('id').single();
      threadId = newThread?.id ?? null;
    }

    if (!threadId) {
      return NextResponse.json({ error: 'Failed to create/find thread' }, { status: 500 });
    }

    // Insert message
    await db.from('sms_thread_messages').insert({
      thread_id: threadId,
      direction: 'inbound',
      body: message_body,
      twilio_message_sid: twilio_message_sid ?? null,
      status: 'received',
    });

    return NextResponse.json({ success: true, thread_id: threadId });
  } catch (err) {
    console.error('[inbound-thread]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get('campaign_id');
  const status = searchParams.get('status');

  const db = supabase();
  let query = db
    .from('sms_conversation_threads')
    .select('*')
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(100);

  if (campaignId) query = query.eq('campaign_id', campaignId);
  if (status && status !== 'all') query = query.eq('conversation_status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ threads: data ?? [] });
}

export async function PUT(req: NextRequest) {
  try {
    const { thread_id, conversation_status, notes } = await req.json();
    if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 });

    const db = supabase();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (conversation_status) updates.conversation_status = conversation_status;
    if (notes !== undefined) updates.notes = notes;

    const { error } = await db.from('sms_conversation_threads').update(updates).eq('id', thread_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[inbound-thread PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
