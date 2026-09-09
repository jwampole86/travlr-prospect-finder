import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/enrichment/provider-health
 * Returns provider health status for all configured enrichment providers.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const [registryRes, healthLogRes] = await Promise.all([
      supabase
        .from('enrichment_provider_registry')
        .select('*')
        .order('provider_name'),
      supabase
        .from('enrichment_provider_health_log')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(50),
    ]);

    const registry = registryRes.data || [];
    const healthLogs = healthLogRes.data || [];

    // Merge latest health log per provider
    const latestHealthByProvider = new Map<string, typeof healthLogs[0]>();
    for (const log of healthLogs) {
      if (!latestHealthByProvider.has(log.provider_name)) {
        latestHealthByProvider.set(log.provider_name, log);
      }
    }

    // Check PropertyReach API key configuration
    const prApiKey = process.env.PROPERTYREACH_API_KEY;
    const prConfigured = prApiKey && prApiKey !== 'your-propertyreach-api-key-here' && prApiKey.trim() !== '';

    const providers = registry.map(p => {
      const latestHealth = latestHealthByProvider.get(p.provider_name);
      let effectiveStatus = p.health_status;

      // Override status if API key not configured
      if (p.provider_name === 'PROPERTYREACH' && !prConfigured) {
        effectiveStatus = 'AUTH_ERROR';
      }

      return {
        ...p,
        health_status: effectiveStatus,
        api_configured: p.provider_name === 'PROPERTYREACH' ? prConfigured : null,
        last_success_at: latestHealth?.last_success_at || null,
        last_failure_at: latestHealth?.last_failure_at || null,
        last_failure_code: latestHealth?.last_failure_code || null,
        requests_today: latestHealth?.requests_today || 0,
        successes_today: latestHealth?.successes_today || 0,
        failures_today: latestHealth?.failures_today || 0,
        avg_response_ms: latestHealth?.avg_response_ms || 0,
        success_rate: latestHealth?.success_rate || null,
      };
    });

    return NextResponse.json({ providers });
  } catch (err) {
    console.error('[Provider Health] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/enrichment/provider-health
 * Update provider health status or enable/disable a provider.
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { providerName, enabled, healthStatus } = body;

    if (!providerName) {
      return NextResponse.json({ error: 'providerName required' }, { status: 400 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (enabled !== undefined) update.enabled = enabled;
    if (healthStatus) update.health_status = healthStatus;

    const { error } = await supabase
      .from('enrichment_provider_registry')
      .update(update)
      .eq('provider_name', providerName);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, providerName, update });
  } catch (err) {
    console.error('[Provider Health] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
