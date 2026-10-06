import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SignupForm } from '@/components/auth/AuthForms';
import { hasAgeBlockCookie, readAgeOkCookie } from '@/modules/auth/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signup');
  return { title: t('stepAccountTitle') };
}

/** Passo 2: só com o cookie assinado de adulto do passo 1 (validado de novo na action). */
export default async function SignupAccountPage() {
  if (await hasAgeBlockCookie()) redirect('/cadastro/indisponivel');
  if (!(await readAgeOkCookie())) redirect('/cadastro');

  const t = await getTranslations('auth.signup');
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('stepAccountTitle')}</h1>
      <SignupForm />
    </>
  );
}
