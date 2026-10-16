'use client';

import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LANGUAGES } from '@/lib/i18n/languages';

/** Four always-visible language buttons for the top bar of every page. */
export default function LanguageSwitcher({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { lang, setLang, t } = useLanguage();

  return (
    <div role="group" aria-label={t('lang.label')} className={`inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5 ${className}`}>
      {!compact && <Globe size={13} className="mx-1.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.native}
          lang={l.htmlLang}
          className={`whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
            lang === l.code ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
