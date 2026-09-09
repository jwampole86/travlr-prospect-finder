import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/track/[token]
 * Redirect middleware for tracked SMS links.
 * Records click event, auto-advances lead stage, then redirects to original URL.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  if (!token) {
    return NextResponse.redirect(process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    // Look up the token
    const { data: click, error } = await supabase
      .from('link_clicks')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !click) {
      // Token not found — redirect to site root
      return NextResponse.redirect(process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new');
    }

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || '';

    // Record the click (only first click sets clicked_at)
    await supabase
      .from('link_clicks')
      .update({
        clicked_at: click.clicked_at ?? new Date().toISOString(),
        ip_address: ip,
        user_agent: userAgent,
      })
      .eq('token', token);

    // Auto-advance lead stage on click
    if (click.lead_id) {
      // Fetch current stage
      const { data: lead } = await supabase
        .from('leads')
        .select('stage')
        .eq('id', click.lead_id)
        .single();

      if (lead) {
        const currentStage = lead.stage as string;
        // Advance: New → Contacted, Contacted stays, anything earlier → Contacted
        const advanceMap: Record<string, string> = {
          New: 'Contacted',
          'Not Contacted': 'Contacted',
          Contacted: 'Interested',
        };
        const newStage = advanceMap[currentStage];
        if (newStage) {
          await supabase
            .from('leads')
            .update({ stage: newStage, updated_at: new Date().toISOString() })
            .eq('id', click.lead_id);
        }
      }
    }

    // Redirect to original URL
    return NextResponse.redirect(click.original_url);
  } catch (err) {
    console.error('[Link Track]', err);
    return NextResponse.redirect(process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new');
  }
}
