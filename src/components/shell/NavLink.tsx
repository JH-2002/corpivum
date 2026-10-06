'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { isActivePath, NAV_ITEMS_BY_KEY, type NavKey } from './nav-config';

interface NavLinkProps {
  /** Chave do item (serializável, pode vir de um Server Component). */
  navKey: NavKey;
  /** Esconde o rótulo visualmente (sidebar recolhida); continua sendo o nome acessível. */
  labelClassName?: string;
  className?: string;
}

/** Link de navegação. Ativo = aria-current + barra lateral + peso da fonte (não só cor, §9). */
export function NavLink({ navKey, labelClassName, className }: NavLinkProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const item = NAV_ITEMS_BY_KEY[navKey];
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors',
        active
          ? 'bg-primary-soft font-semibold text-primary-soft-fg before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary'
          : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
        className,
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className={labelClassName}>{t(item.key)}</span>
    </Link>
  );
}
