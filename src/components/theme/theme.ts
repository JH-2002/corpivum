export const THEME_STORAGE_KEY = 'hm.theme';
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(raw: string | null): Theme {
  return THEMES.find((t) => t === raw) ?? 'system';
}

/**
 * Script executado antes da pintura para aplicar a classe `dark` sem "flash" de tema.
 * Mantido estático (sem interpolação de dados) para poder receber hash/nonce na CSP (Fase 1a).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t==='dark'||((t!=='light')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
