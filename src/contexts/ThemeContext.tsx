'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === 'system') return getSystemTheme();
  return pref;
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children, userId }: { children: React.ReactNode; userId?: string }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const supabase = createClient();

  // Load preference from Supabase on mount (if logged in)
  useEffect(() => {
    if (!userId) {
      // No user — use localStorage fallback
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('theme_preference') as ThemePreference | null : null;
      const pref: ThemePreference = stored || 'system';
      setThemeState(pref);
      const resolved = resolveTheme(pref);
      setResolvedTheme(resolved);
      applyTheme(resolved);
      return;
    }

    supabase
      .from('user_profiles')
      .select('theme_preference')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const pref: ThemePreference = (data?.theme_preference as ThemePreference) || 'system';
        setThemeState(pref);
        const resolved = resolveTheme(pref);
        setResolvedTheme(resolved);
        applyTheme(resolved);
      })
      .catch(() => {
        // Fallback to system
        const resolved = resolveTheme('system');
        setResolvedTheme(resolved);
        applyTheme(resolved);
      });
  }, [userId]);

  // Listen to OS theme changes when preference is 'system'
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        const resolved = getSystemTheme();
        setResolvedTheme(resolved);
        applyTheme(resolved);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback(async (pref: ThemePreference) => {
    setThemeState(pref);
    const resolved = resolveTheme(pref);
    setResolvedTheme(resolved);
    applyTheme(resolved);

    // Persist to localStorage always (fast, works without auth)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme_preference', pref);
    }

    // Persist to Supabase if user is logged in
    if (userId) {
      try {
        await supabase
          .from('user_profiles')
          .upsert({ id: userId, theme_preference: pref, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      } catch {
        // Silent — localStorage already persisted
      }
    }
  }, [userId, supabase]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
