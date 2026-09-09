'use client';

import { createBrowserClient } from '@supabase/ssr';

const PFX = 'sb_';

const isBrowser = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

const canUseCookies = (() => {
  let cache: boolean | null = null;
  return () => {
    if (!isBrowser()) return false;
    if (cache !== null) return cache;
    const k = '__sb_test__';
    try {
      if (isBrowser()) {
        document.cookie = `${k}=1; Path=/; SameSite=None; Secure; Partitioned`;
        cache = document.cookie.includes(k);
        document.cookie = `${k}=; Path=/; Max-Age=0; SameSite=None; Secure`;
      } else {
        cache = false;
      }
    } catch {
      cache = false;
    }
    return cache ?? false;
  };
})();

const fromCookies = () => {
  if (!isBrowser()) return [];
  try {
    const cookieStr = document.cookie ?? '';
    return cookieStr
      .split(';')
      .filter(Boolean)
      .map((c) => {
        const parts = c.trim().split('=');
        const name = parts[0];
        const value = decodeURIComponent(parts.slice(1).join('='));
        return { name: name.trim(), value };
      })
      .filter((c) => c.name);
  } catch {
    return [];
  }
};

const fromStorage = () => {
  if (typeof window === 'undefined') return [];
  try {
    const storage = window.localStorage;
    if (!storage) return [];
    return Object.keys(storage)
      .filter((k) => k.startsWith(PFX))
      .map((k) => ({ name: k.slice(PFX.length), value: storage.getItem(k) || '' }));
  } catch {
    return [];
  }
};

const setCookie = (name: string, value: string, options?: Record<string, unknown>) => {
  if (!isBrowser()) return;
  let s = `${name}=${encodeURIComponent(value)}; Path=${options?.path || '/'}; SameSite=None; Secure; Partitioned`;
  if (options?.maxAge) s += `; Max-Age=${options.maxAge}`;
  if (options?.domain) s += `; Domain=${options.domain}`;
  if (options?.expires) s += `; Expires=${new Date(options.expires as string).toUTCString()}`;
  document.cookie = s;
};

const deleteCookie = (name: string) => {
  if (!isBrowser()) return;
  let host = '';
  try {
    host = window.location.hostname ?? '';
  } catch {
    host = '';
  }
  const domains = ['', host, host ? `.${host}` : ''].filter(Boolean);
  const variants = [
    'Path=/; SameSite=Lax',
    'Path=/; SameSite=None; Secure',
    'Path=/; SameSite=None; Secure; Partitioned',
  ];
  variants.forEach((attrs) => {
    document.cookie = `${name}=; Max-Age=0; ${attrs}`;
    domains.forEach((domain) => {
      document.cookie = `${name}=; Max-Age=0; Domain=${domain}; ${attrs}`;
    });
  });
};

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => {
          if (!isBrowser()) return [];
          return canUseCookies() ? fromCookies() : fromStorage();
        },
        setAll(cookiesToSet) {
          if (typeof window === 'undefined') return;
          if (canUseCookies()) {
            cookiesToSet.forEach(({ name, value, options }) =>
              value ? setCookie(name, value, options as Record<string, unknown>) : deleteCookie(name)
            );
          } else {
            cookiesToSet.forEach(({ name, value, options }) => {
              if (typeof window === 'undefined') return;
              try {
                const storage = window.localStorage;
                if (!storage) return;
                value
                  ? storage.setItem(`${PFX}${name}`, value)
                  : storage.removeItem(`${PFX}${name}`);
              } catch {}
              if (value) setCookie(name, value, options as Record<string, unknown>);
            });
          }
        },
      },
    }
  );
}
