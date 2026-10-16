export const SMS_OPT_OUT_LINE = 'Reply STOP to opt out.';

const OPT_OUT_PATTERN = /\b(reply\s+stop|text\s+stop|opt.?out|unsubscribe)\b/i;

export function hasOptOutLanguage(body: string): boolean {
  return OPT_OUT_PATTERN.test(body);
}

/** Commercial texts must carry opt-out language; append it when the author left it out. */
export function withOptOutLanguage(body: string): string {
  const trimmed = body.trimEnd();
  if (!trimmed.trim() || hasOptOutLanguage(trimmed)) return body;
  return `${trimmed} ${SMS_OPT_OUT_LINE}`;
}
