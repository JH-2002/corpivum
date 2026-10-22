import {
  Activity,
  Apple,
  FileText,
  History,
  House,
  ListChecks,
  type LucideIcon,
  Moon,
  Orbit,
  PersonStanding,
  Settings,
  ShieldCheck,
  Target,
} from 'lucide-react';
import type { Route } from 'next';

export type NavKey =
  | 'home'
  | 'body'
  | 'sleep'
  | 'habits'
  | 'nutrition'
  | 'activity'
  | 'goals'
  | 'timeline'
  | 'twin'
  | 'reports'
  | 'settings'
  | 'privacy';

export interface NavItem {
  key: NavKey;
  href: Route;
  icon: LucideIcon;
  /** Ativo só na rota exata (ex.: início do demo, que é prefixo das outras rotas do demo). */
  exact?: boolean;
}

/** Itens da sidebar, na ordem da §9. */
export const SIDEBAR_ITEMS: readonly NavItem[] = [
  { key: 'home', href: '/inicio', icon: House },
  { key: 'body', href: '/corpo', icon: PersonStanding },
  { key: 'sleep', href: '/sono', icon: Moon },
  { key: 'habits', href: '/habitos', icon: ListChecks },
  { key: 'nutrition', href: '/alimentacao', icon: Apple },
  { key: 'activity', href: '/atividade', icon: Activity },
  { key: 'goals', href: '/metas', icon: Target },
  { key: 'timeline', href: '/timeline', icon: History },
  { key: 'twin', href: '/twin', icon: Orbit },
  { key: 'reports', href: '/relatorios', icon: FileText },
  { key: 'settings', href: '/configuracoes', icon: Settings },
];

export const PRIVACY_ITEM: NavItem = { key: 'privacy', href: '/privacidade', icon: ShieldCheck };

/** Grupo "Conta" da sidebar (9b): relatórios, configurações e Central de Privacidade, separados dos módulos. */
export const ACCOUNT_KEYS: readonly NavKey[] = ['reports', 'settings', 'privacy'];

export const ALL_NAV_ITEMS: readonly NavItem[] = [...SIDEBAR_ITEMS, PRIVACY_ITEM];

export const NAV_ITEMS_BY_KEY = Object.fromEntries(
  ALL_NAV_ITEMS.map((item) => [item.key, item]),
) as Record<NavKey, NavItem>;

/** Itens que já estão na própria barra inferior; o resto vai para o "Mais". */
const BOTTOM_BAR_KEYS: readonly NavKey[] = ['home', 'twin', 'timeline'];

/** Itens que ficam no "Mais" da navegação inferior (os demais estão na própria barra). */
export const MORE_ITEMS: readonly NavItem[] = ALL_NAV_ITEMS.filter(
  (item) => !BOTTOM_BAR_KEYS.includes(item.key),
);

/**
 * Demo público sem login (LEG-X02, ADR-0021): só os módulos com dados de demonstração. Rotas próprias em
 * `/demo`, fora da área logada.
 */
export const DEMO_ITEMS: readonly NavItem[] = [
  { key: 'home', href: '/demo', icon: House, exact: true },
  { key: 'body', href: '/demo/corpo', icon: PersonStanding },
  { key: 'sleep', href: '/demo/sono', icon: Moon },
  { key: 'habits', href: '/demo/habitos', icon: ListChecks },
  { key: 'nutrition', href: '/demo/alimentacao', icon: Apple },
  { key: 'activity', href: '/demo/atividade', icon: Activity },
  { key: 'goals', href: '/demo/metas', icon: Target },
  { key: 'timeline', href: '/demo/timeline', icon: History },
  { key: 'twin', href: '/demo/twin', icon: Orbit },
];

/** "Mais" do demo: os módulos do demo que não estão na barra inferior (mesma barra do app, 9b). */
export const DEMO_MORE_ITEMS: readonly NavItem[] = DEMO_ITEMS.filter(
  (item) => !BOTTOM_BAR_KEYS.includes(item.key),
);

/** Rotas da barra inferior por variante: Início · Twin · Registrar · Timeline · Mais. */
export const BOTTOM_NAV_HREFS = {
  app: { home: '/inicio', twin: '/twin', timeline: '/timeline', more: '/mais' },
  demo: { home: '/demo', twin: '/demo/twin', timeline: '/demo/timeline', more: '/demo/mais' },
} as const satisfies Record<string, Record<'home' | 'twin' | 'timeline' | 'more', Route>>;

export function isActivePath(pathname: string, href: string, exact = false): boolean {
  return pathname === href || (!exact && pathname.startsWith(`${href}/`));
}

export function isItemActive(pathname: string, item: NavItem): boolean {
  return isActivePath(pathname, item.href, item.exact);
}

export function navItemForPath(
  pathname: string,
  items: readonly NavItem[] = ALL_NAV_ITEMS,
): NavItem | undefined {
  return items.find((item) => isItemActive(pathname, item));
}

export type ShellVariant = 'app' | 'demo';
