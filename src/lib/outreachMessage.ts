interface OutreachMessageSource {
  full_body?: string | null;
  body_preview?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** The complete text of a logged message. body_preview is cut to 120-200 characters, so it is only the last resort. */
export function outreachMessageText(row: OutreachMessageSource): string {
  const md = row.metadata ?? {};
  const candidates = [row.full_body, md.message, md.body, row.body_preview];
  for (const c of candidates) if (typeof c === 'string' && c.trim()) return c;
  return '';
}
