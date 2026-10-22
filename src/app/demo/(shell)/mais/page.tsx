import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NavLink } from '@/components/shell/NavLink';
import { DEMO_MORE_ITEMS } from '@/components/shell/nav-config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.more');
  return { title: t('title') };
}

/** "Mais" do demo público (9b): os módulos do demo que não cabem na barra inferior (LEG-X02). */
export default async function DemoMorePage() {
  const t = await getTranslations('nav');
  return (
    <nav aria-label={t('moreTitle')}>
      <ul className="grid gap-1 sm:grid-cols-2">
        {DEMO_MORE_ITEMS.map((item) => (
          <li key={item.key}>
            <NavLink navKey={item.key} variant="demo" className="border border-border bg-surface" />
          </li>
        ))}
      </ul>
    </nav>
  );
}
