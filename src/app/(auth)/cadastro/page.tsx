import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AgeForm } from '@/components/auth/AuthForms';
import { hasAgeBlockCookie } from '@/modules/auth/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signup');
  return { title: t('stepAgeTitle') };
}

/** Passo 1 (§52, LEG-F01): só a data de nascimento, que nunca é guardada. */
export default async function SignupAgePage() {
  // Desencoraja nova tentativa imediata, sem identificar ninguém (cookie de sessão do navegador).
  if (await hasAgeBlockCookie()) redirect('/cadastro/indisponivel');

  const t = await getTranslations('auth.signup');
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">{t('stepAgeTitle')}</h1>
      <p className="mb-4 text-sm text-fg-muted">{t('stepAgeDescription')}</p>
      <AgeForm />
    </>
  );
}
