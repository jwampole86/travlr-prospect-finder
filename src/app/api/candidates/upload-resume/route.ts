import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─── Resume text extraction helpers ──────────────────────────────────────────

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid SSR issues
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(buffer);
    return result.text || '';
  } catch (err) {
    console.error('[resume-upload] PDF parse error:', err);
    return '';
  }
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (err) {
    console.error('[resume-upload] DOCX parse error:', err);
    return '';
  }
}

// ─── Candidate name extraction ────────────────────────────────────────────────

function extractCandidateName(rawText: string, fileName: string): { firstName: string; lastName: string; fullName: string; source: string } {
  // Strategy 1: Look for name at top of resume (first 500 chars)
  const topSection = rawText.slice(0, 500).trim();
  const lines = topSection.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // First non-empty line that looks like a name (2-4 words, no special chars, no email/phone)
  for (const line of lines.slice(0, 5)) {
    const cleaned = line.replace(/[^a-zA-Z\s\-\.]/g, '').trim();
    const words = cleaned.split(/\s+/).filter(w => w.length > 1);
    if (
      words.length >= 2 &&
      words.length <= 4 &&
      !line.includes('@') &&
      !line.match(/\d{3}/) &&
      !line.toLowerCase().includes('resume') &&
      !line.toLowerCase().includes('curriculum') &&
      words.every(w => /^[A-Z]/.test(w))
    ) {
      const fullName = words.join(' ');
      const parts = fullName.split(' ');
      return {
        firstName: parts[0],
        lastName: parts[parts.length - 1],
        fullName,
        source: 'resume_text',
      };
    }
  }

  // Strategy 2: Parse from filename
  const baseName = fileName.replace(/\.(pdf|docx|doc)$/i, '');
  const nameFromFile = baseName
    .replace(/[_\-\.]+/g, ' ')
    .replace(/resume/gi, '')
    .replace(/cv/gi, '')
    .trim();

  const fileWords = nameFromFile.split(/\s+/).filter(w => w.length > 1 && /^[a-zA-Z]/.test(w));
  if (fileWords.length >= 2) {
    const fullName = fileWords.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    const parts = fullName.split(' ');
    return {
      firstName: parts[0],
      lastName: parts[parts.length - 1],
      fullName,
      source: 'filename',
    };
  }

  return {
    firstName: 'Unknown',
    lastName: 'Candidate',
    fullName: 'Unknown Candidate',
    source: 'fallback',
  };
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

async function findExistingCandidate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fullName: string,
  email?: string,
  phone?: string,
): Promise<{ id: string; full_name: string; resume_version: number } | null> {
  // Priority 1: email match
  if (email) {
    const { data } = await supabase
      .from('candidates')
      .select('id, full_name, resume_version')
      .eq('email', email)
      .limit(1)
      .single();
    if (data) return data;
  }

  // Priority 2: phone match
  if (phone) {
    const { data } = await supabase
      .from('candidates')
      .select('id, full_name, resume_version')
      .eq('phone', phone)
      .limit(1)
      .single();
    if (data) return data;
  }

  // Priority 3: normalized full name
  const normalized = fullName.toLowerCase().replace(/\s+/g, ' ').trim();
  const { data } = await supabase
    .from('candidates')
    .select('id, full_name, resume_version')
    .ilike('full_name', normalized)
    .limit(1)
    .single();

  return data || null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const formData = await req.formData();
    const files = formData.getAll('resumes') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const results: Array<{
      fileName: string;
      candidateId?: string;
      fullName?: string;
      status: 'created' | 'updated' | 'possible_duplicate' | 'error';
      message?: string;
    }> = [];

    for (const file of files) {
      try {
        const fileName = file.name;
        const mimeType = file.type;
        const buffer = Buffer.from(await file.arrayBuffer());

        // Extract text
        let rawText = '';
        if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
          rawText = await extractTextFromPDF(buffer);
        } else if (
          mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          fileName.toLowerCase().endsWith('.docx') ||
          fileName.toLowerCase().endsWith('.doc')
        ) {
          rawText = await extractTextFromDOCX(buffer);
        } else {
          results.push({ fileName, status: 'error', message: 'Unsupported file type. Use PDF or DOCX.' });
          continue;
        }

        if (!rawText || rawText.trim().length < 50) {
          results.push({ fileName, status: 'error', message: 'Could not extract text from file.' });
          continue;
        }

        // Extract name
        const nameInfo = extractCandidateName(rawText, fileName);

        // Upload file to Supabase storage (interview-recordings bucket exists; create resumes path)
        const filePath = `resumes/${Date.now()}_${fileName.replace(/\s+/g, '_')}`;
        const { error: uploadError } = await supabase.storage
          .from('interview-recordings')
          .upload(filePath, buffer, {
            contentType: mimeType,
            upsert: false,
          });

        if (uploadError) {
          console.error('[resume-upload] storage error:', uploadError);
          // Continue without file URL - still process the resume
        }

        // Check for existing candidate
        const existing = await findExistingCandidate(supabase, nameInfo.fullName);

        if (existing) {
          // Update existing candidate with new resume version
          const newVersion = (existing.resume_version || 1) + 1;
          const { data: updated, error: updateError } = await supabase
            .from('candidates')
            .update({
              resume_file_name: fileName,
              resume_file_path: filePath,
              resume_raw_text: rawText,
              resume_parsed_at: new Date().toISOString(),
              resume_version: newVersion,
              candidate_status: 'PROCESSING',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .select()
            .single();

          if (updateError) throw updateError;

          await supabase.from('candidate_audit_events').insert({
            candidate_id: existing.id,
            event_type: 'CANDIDATE_RESUME_UPDATED',
            event_data: { file_name: fileName, version: newVersion },
          });

          results.push({
            fileName,
            candidateId: existing.id,
            fullName: existing.full_name,
            status: 'updated',
            message: `Resume v${newVersion} uploaded for ${existing.full_name}`,
          });
        } else {
          // Create new candidate
          const { data: created, error: createError } = await supabase
            .from('candidates')
            .insert({
              first_name: nameInfo.firstName,
              last_name: nameInfo.lastName,
              full_name: nameInfo.fullName,
              resume_file_name: fileName,
              resume_file_path: filePath,
              resume_raw_text: rawText,
              resume_parsed_at: new Date().toISOString(),
              resume_version: 1,
              candidate_status: 'PROCESSING',
            })
            .select()
            .single();

          if (createError) throw createError;

          await supabase.from('candidate_audit_events').insert({
            candidate_id: created.id,
            event_type: 'CANDIDATE_RESUME_UPLOADED',
            event_data: { file_name: fileName, name_source: nameInfo.source },
          });

          results.push({
            fileName,
            candidateId: created.id,
            fullName: nameInfo.fullName,
            status: 'created',
            message: `Candidate ${nameInfo.fullName} created`,
          });
        }
      } catch (fileErr) {
        console.error('[resume-upload] file error:', fileErr);
        results.push({
          fileName: file.name,
          status: 'error',
          message: fileErr instanceof Error ? fileErr.message : 'Processing failed',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[resume-upload] error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
