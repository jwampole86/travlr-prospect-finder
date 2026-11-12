const FORWARDED = ['cookie', 'authorization', 'x-job-secret'] as const;

/** Credentials to pass along when one API route calls another on the server, so the second route sees the same caller (a signed-in admin or a scheduled job). */
export function forwardAuth(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of FORWARDED) {
    const value = req.headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}
