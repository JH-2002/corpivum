import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NavLink } from '@/components/shell/NavLink';
import { MORE_ITEMS } from '@/components/shell/nav-config';
import { requireAppSession } from '@/modules/consent/server';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.more');
  return { title: t('title') };
}

/** Destino do item "Mais" da navegação inferior: as seções que não cabem na barra (§7). */
async function MorePage() {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  await requireAppSession();
  const t = await getTranslations('nav');
  return (
    <nav aria-label={t('moreTitle')}>
      <ul className="grid gap-1 sm:grid-cols-2">
        {MORE_ITEMS.map((item) => (
          <li key={item.key}>
            <NavLink navKey={item.key} className="border border-border bg-surface" />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default withRouteMessages('(app)/mais', MorePage);
