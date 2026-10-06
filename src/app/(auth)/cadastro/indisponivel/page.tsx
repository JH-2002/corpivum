import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signup');
  return { title: t('unavailableTitle') };
}

/** Mensagem neutra e acolhedora para menores de 18 (LEG-F01). Nada foi guardado. */
export default async function SignupUnavailablePage() {
  const t = await getTranslations('auth.signup');
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('unavailableTitle')}</h1>
      <p className="mb-3">{t('unavailableBody')}</p>
      <p className="text-sm text-fg-muted">{t('unavailableSupport')}</p>
    </>
  );
}
