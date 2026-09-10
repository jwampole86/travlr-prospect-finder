import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface CreateZoomMeetingBody {
  candidateName?: string;
  roleTitle?: string;
  scheduledAt?: string;
  durationMinutes?: number;
}

function hasConfiguredValue(value: string | undefined): value is string {
  return Boolean(value && !value.toLowerCase().includes('your_') && !value.toLowerCase().includes('placeholder'));
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const hostEmail = process.env.ZOOM_HOST_EMAIL;

  if (![accountId, clientId, clientSecret, hostEmail].every(hasConfiguredValue)) {
    return NextResponse.json(
      { error: 'Zoom is not configured. Add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, and ZOOM_HOST_EMAIL.' },
      { status: 503 }
    );
  }

  let body: CreateZoomMeetingBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const candidateName = body.candidateName?.trim();
  const roleTitle = body.roleTitle?.trim();
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  const durationMinutes = Number(body.durationMinutes);

  if (!candidateName || !roleTitle || !scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'Candidate, role, and a valid interview time are required.' }, { status: 400 });
  }

  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) {
    return NextResponse.json({ error: 'Interview duration must be between 15 and 240 minutes.' }, { status: 400 });
  }

  try {
    const tokenResponse = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId!)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        cache: 'no-store',
      }
    );

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      return NextResponse.json(
        { error: tokenData.reason || tokenData.error || 'Zoom authentication failed. Check the app credentials and activation status.' },
        { status: 502 }
      );
    }

    const meetingResponse = await fetch(
      `https://api.zoom.us/v2/users/${encodeURIComponent(hostEmail!)}/meetings`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: `TRAVLR Interview - ${candidateName}`,
          agenda: `Interview for ${roleTitle}`,
          type: 2,
          start_time: scheduledAt.toISOString(),
          duration: durationMinutes,
          settings: {
            waiting_room: true,
            join_before_host: false,
            mute_upon_entry: true,
            approval_type: 0,
          },
        }),
        cache: 'no-store',
      }
    );

    const meetingData = await meetingResponse.json();
    if (!meetingResponse.ok || !meetingData.join_url) {
      return NextResponse.json(
        { error: meetingData.message || 'Zoom could not create the interview meeting.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      meetingId: String(meetingData.id),
      joinUrl: meetingData.join_url,
    });
  } catch (error) {
    console.error('[interview/zoom/create] error:', error);
    return NextResponse.json({ error: 'Unable to connect to Zoom.' }, { status: 502 });
  }
}