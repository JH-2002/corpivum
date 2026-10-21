import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DraftBanner } from '@/components/privacy/LegalDocument';
import { DEMO_RESPONSIBLE } from '@/config/demo';
import { isDemoOnly } from '@/lib/demo-mode';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('demoAbout');
  return { title: t('title') };
}

const SECTIONS = ['what', 'notCollected', 'browser', 'hosting', 'contact'] as const;

/**
 * Aviso da demonstração pública (ADR-0043, LEG-X02): o que é, o que não é coletado, as preferências guardadas
 * no navegador, os registros técnicos da hospedagem e o responsável. Só existe no modo só demo. RASCUNHO, `LEGAL-REVIEW` (OI-38).
 */
export default async function DemoAboutPage() {
  // Só no modo só demo: no app completo há cadastro, banco e outro controlador (OI-06).
  if (!isDemoOnly()) notFound();
  const t = await getTranslations('demoAbout');
  const disclaimer = await getTranslations('disclaimer');
  return (
    <article className="flex max-w-3xl flex-col gap-4">
      <DraftBanner />
      {SECTIONS.map((key) => (
        <section key={key} aria-labelledby={`sobre-${key}`} className="flex flex-col gap-1">
          <h2 id={`sobre-${key}`} className="text-lg font-semibold">
            {t(`${key}.title`)}
          </h2>
          <p>
            {t.rich(`${key}.body`, {
              name: DEMO_RESPONSIBLE.name,
              email: () => (
                <a href={`mailto:${DEMO_RESPONSIBLE.email}`} className="text-primary underline">
                  {DEMO_RESPONSIBLE.email}
                </a>
              ),
            })}
          </p>
        </section>
      ))}
      <p className="text-sm text-fg-muted">{disclaimer('wellbeingOnly')}</p>
    </article>
  );
}
