import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signup');
  return { title: t('checkEmailTitle') };
}

/** Mesma tela para e-mail novo ou já cadastrado (anti-enumeração, ADR-0014). */
export default async function CheckEmailPage() {
  const t = await getTranslations('auth');
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('signup.checkEmailTitle')}</h1>
      <p role="status" className="mb-4">
        {t('signup.checkEmailBody')}
      </p>
      <Link href="/entrar" className="font-semibold text-primary underline underline-offset-2">
        {t('login.title')}
      </Link>
    </>
  );
}
