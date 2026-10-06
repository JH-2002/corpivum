'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useStoredValue } from '@/lib/browser-store';
import { cn } from '@/lib/cn';
import { applyTheme, parseTheme, THEME_STORAGE_KEY, THEMES, type Theme } from './theme';

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

/** Tema claro/escuro/sistema (§46). Preferência só de interface, guardada no navegador. */
export function ThemeSelector() {
  const t = useTranslations('theme');
  const [raw, setRaw] = useStoredValue('local', THEME_STORAGE_KEY);
  const theme = parseTheme(raw);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{t('label')}</legend>
      <div className="flex flex-wrap gap-2">
        {THEMES.map((option: Theme) => {
          const Icon = ICONS[option];
          const checked = theme === option;
          return (
            <label
              key={option}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                checked
                  ? 'border-primary bg-primary-soft font-semibold text-primary-soft-fg'
                  : 'border-border-strong bg-surface',
              )}
            >
              <input
                type="radio"
                name="theme"
                value={option}
                checked={checked}
                onChange={() => setRaw(option)}
                className="sr-only"
              />
              <Icon className="size-4" aria-hidden="true" />
              {t(option)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
