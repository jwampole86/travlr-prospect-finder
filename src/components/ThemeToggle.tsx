'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme, ThemePreference } from '@/contexts/ThemeContext';
import Icon from '@/components/ui/AppIcon';


interface ThemeToggleProps {
  collapsed?: boolean;
  variant?: 'sidebar' | 'settings';
}

const OPTIONS: { value: ThemePreference; label: string; Icon: React.ElementType }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

export default function ThemeToggle({ collapsed = false, variant = 'sidebar' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  if (variant === 'settings') {
    return (
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg border border-border">
        {OPTIONS.map(({ value, label, Icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            title={label}
            aria-label={`Switch to ${label} mode`}
            aria-pressed={theme === value}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all duration-150 ${
              theme === value
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={13} className="shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    );
  }

  // Sidebar variant — compact
  if (collapsed) {
    // Cycle through options when collapsed
    const currentIdx = OPTIONS.findIndex(o => o.value === theme);
    const next = OPTIONS[(currentIdx + 1) % OPTIONS.length];
    const CurrentIcon = OPTIONS[currentIdx]?.Icon || Moon;
    return (
      <button
        onClick={() => setTheme(next.value)}
        title={`Theme: ${OPTIONS[currentIdx]?.label || 'Dark'} — click to switch`}
        aria-label="Toggle theme"
        className="w-full flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all min-h-[40px]"
      >
        <CurrentIcon size={15} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md">
      <span className="text-[10px] text-muted-foreground font-medium shrink-0 w-12">Theme</span>
      <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5 flex-1">
        {OPTIONS.map(({ value, label, Icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            title={label}
            aria-label={`${label} mode`}
            aria-pressed={theme === value}
            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium transition-all duration-150 ${
              theme === value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={11} className="shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
