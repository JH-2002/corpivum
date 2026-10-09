import {
  Activity,
  Apple,
  Bot,
  FileText,
  History,
  House,
  ListChecks,
  type LucideIcon,
  Moon,
  Orbit,
  PersonStanding,
  Pill,
  Settings,
  ShieldCheck,
  Target,
} from 'lucide-react';
import type { Route } from 'next';

export type NavKey =
  | 'home'
  | 'sleep'
  | 'habits'
  | 'body'
  | 'nutrition'
  | 'activity'
  | 'medications'
  | 'goals'
  | 'timeline'
  | 'twin'
  | 'ai'
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
  { key: 'sleep', href: '/sono', icon: Moon },
  { key: 'habits', href: '/habitos', icon: ListChecks },
  { key: 'body', href: '/corpo', icon: PersonStanding },
  { key: 'nutrition', href: '/alimentacao', icon: Apple },
  { key: 'activity', href: '/atividade', icon: Activity },
  { key: 'medications', href: '/medicamentos', icon: Pill },
  { key: 'goals', href: '/metas', icon: Target },
  { key: 'timeline', href: '/timeline', icon: History },
  { key: 'twin', href: '/twin', icon: Orbit },
  { key: 'ai', href: '/ia', icon: Bot },
  { key: 'reports', href: '/relatorios', icon: FileText },
  { key: 'settings', href: '/configuracoes', icon: Settings },
];

export const PRIVACY_ITEM: NavItem = { key: 'privacy', href: '/privacidade', icon: ShieldCheck };

export const ALL_NAV_ITEMS: readonly NavItem[] = [...SIDEBAR_ITEMS, PRIVACY_ITEM];

export const NAV_ITEMS_BY_KEY = Object.fromEntries(
  ALL_NAV_ITEMS.map((item) => [item.key, item]),
) as Record<NavKey, NavItem>;

/** Itens que ficam no "Mais" da navegação inferior (os demais estão na própria barra). */
export const MORE_ITEMS: readonly NavItem[] = ALL_NAV_ITEMS.filter(
  (item) => !['home', 'twin', 'timeline'].includes(item.key),
);

/**
 * Demo público sem login (LEG-X02, ADR-0021): só os módulos com dados de demonstração. Rotas próprias em
 * `/demo`, fora da área logada.
 */
export const DEMO_ITEMS: readonly NavItem[] = [
  { key: 'home', href: '/demo', icon: House, exact: true },
  { key: 'sleep', href: '/demo/sono', icon: Moon },
  { key: 'habits', href: '/demo/habitos', icon: ListChecks },
  { key: 'body', href: '/demo/corpo', icon: PersonStanding },
  { key: 'twin', href: '/demo/twin', icon: Orbit },
];

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
