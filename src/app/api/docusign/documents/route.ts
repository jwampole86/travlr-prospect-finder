import { NextRequest, NextResponse } from 'next/server';
import { authorizeSigning } from '@/lib/auth/signingAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { downloadEnvelopeDocument } from '@/lib/services/docusignService';

// GET /api/docusign/documents?sessionId=&kind=signed|certificate — the finished PDF straight from DocuSign.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const kind = searchParams.get('kind') === 'certificate' ? 'certificate' : 'signed';
    if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });

    const { data: session } = await getSupabaseAdmin().from('signing_sessions').select('lead_id, envelope_id, session_status').eq('id', sessionId).maybeSingle();
    if (!session) return NextResponse.json({ error: 'Signing session not found' }, { status: 404 });

    const access = await authorizeSigning(req, session.lead_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (session.session_status !== 'completed' || !session.envelope_id) return NextResponse.json({ error: 'The agreement is not signed yet' }, { status: 409 });

    const pdf = await downloadEnvelopeDocument(session.envelope_id, kind);
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${kind === 'signed' ? 'Partnership_Agreement_Signed' : 'Certificate_of_Completion'}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[documents] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not download the document' }, { status: 500 });
  }
}
