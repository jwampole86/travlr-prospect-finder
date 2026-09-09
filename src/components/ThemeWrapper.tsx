'use client';

import React from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

export default function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <ThemeProvider userId={user?.id}>
      {children}
    </ThemeProvider>
  );
}
