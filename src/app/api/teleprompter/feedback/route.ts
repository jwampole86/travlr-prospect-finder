import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/teleprompter/feedback
 * Records whether an agent used, ignored, or modified a suggestion.
 * 
 * Body:
 *   sessionId: string
 *   suggestionId: string (client-generated UUID for this suggestion)
 *   suggestionText: string
 *   nextAgentLine: string (what the agent actually said next)
 *   source: 'llm' | 'objection_library' | 'static_fallback'
 *   objectionId?: string
 *   scriptId: string
 *   leadId?: string
 */
export async function POST(request: NextRequest) {
  try {
    const {
      sessionId,
      suggestionId,
      suggestionText,
      nextAgentLine,
      source,
      objectionId,
      scriptId,
      leadId,
    } = await request.json();

    if (!sessionId || !suggestionText) {
      return NextResponse.json({ error: 'sessionId and suggestionText required' }, { status: 400 });
    }

    // Compute rough usage signal: did the agent's next line closely match the suggestion?
    const usageSignal = computeUsageSignal(suggestionText, nextAgentLine || '');

    const { error } = await supabase.from('teleprompter_suggestion_feedback').insert({
      session_id: sessionId,
      suggestion_id: suggestionId || null,
      suggestion_text: suggestionText,
      next_agent_line: nextAgentLine || null,
      usage_signal: usageSignal,
      source: source || 'llm',
      objection_id: objectionId || null,
      script_id: scriptId || null,
      lead_id: leadId || null,
      recorded_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, usageSignal });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/**
 * GET /api/teleprompter/feedback?sessionId=...
 * Returns aggregated feedback patterns for a session or across all sessions.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const scriptId = searchParams.get('scriptId');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('teleprompter_suggestion_feedback')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (sessionId) query = query.eq('session_id', sessionId);
    if (scriptId) query = query.eq('script_id', scriptId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Aggregate patterns
    const total = data?.length || 0;
    const used = data?.filter(r => r.usage_signal === 'used').length || 0;
    const ignored = data?.filter(r => r.usage_signal === 'ignored').length || 0;
    const modified = data?.filter(r => r.usage_signal === 'modified').length || 0;

    // Objection library hit rate
    const objectionHits = data?.filter(r => r.source === 'objection_library') || [];
    const objectionUsed = objectionHits.filter(r => r.usage_signal === 'used').length;

    // Most ignored objection types
    const ignoredByObjection: Record<string, number> = {};
    data?.filter(r => r.usage_signal === 'ignored' && r.objection_id).forEach(r => {
      ignoredByObjection[r.objection_id] = (ignoredByObjection[r.objection_id] || 0) + 1;
    });

    return NextResponse.json({
      total,
      used,
      ignored,
      modified,
      useRate: total > 0 ? Math.round((used / total) * 100) : 0,
      objectionLibraryHits: objectionHits.length,
      objectionLibraryUseRate: objectionHits.length > 0 ? Math.round((objectionUsed / objectionHits.length) * 100) : 0,
      mostIgnoredObjections: Object.entries(ignoredByObjection)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([id, count]) => ({ objectionId: id, ignoredCount: count })),
      records: data,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/**
 * Compute a rough usage signal by comparing suggestion text to agent's next line. * Returns:'used' | 'modified' | 'ignored'
 */
function computeUsageSignal(suggestion: string, agentLine: string): 'used' | 'modified' | 'ignored' {
  if (!agentLine || agentLine.trim().length < 3) return 'ignored';

  // Extract the actual suggested text (strip formatting)
  const suggestionClean = suggestion
    .replace(/^(Suggested next line:|Option [AB]:)/gm, '')
    .replace(/^"(.*)"$/s, '$1')
    .replace(/\[Note:.*\]/g, '')
    .toLowerCase()
    .trim();

  const agentClean = agentLine.toLowerCase().trim();

  if (!suggestionClean) return 'ignored';

  // Tokenize and compare
  const suggWords = suggestionClean.split(/\s+/).filter(w => w.length > 3);
  const agentWords = agentClean.split(/\s+/).filter(w => w.length > 3);

  if (suggWords.length === 0) return 'ignored';

  const matchCount = suggWords.filter(w => agentClean.includes(w)).length;
  const matchRatio = matchCount / suggWords.length;

  if (matchRatio >= 0.7) return 'used';
  if (matchRatio >= 0.3) return 'modified';
  return 'ignored';
}
