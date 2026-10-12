'use client';

import { useEffect } from 'react';

/** Keeps the page in light mode while mounted (public homeowner documents), restoring the user's theme on leave. */
export function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    const previousScheme = root.style.colorScheme;
    const enforce = () => {
      if (root.classList.contains('dark')) root.classList.remove('dark');
      root.style.colorScheme = 'light';
    };
    enforce();
    const observer = new MutationObserver(enforce);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      root.style.colorScheme = previousScheme;
      if (hadDark) root.classList.add('dark');
    };
  }, []);
}
