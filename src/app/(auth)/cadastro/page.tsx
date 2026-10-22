import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AgeForm } from '@/components/auth/AuthForms';
import { hasAgeBlockCookie } from '@/modules/auth/server';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signup');
  return { title: t('stepAgeTitle') };
}

/**
 * §52 passos 1 e 2: boas-vindas curtas (o que o app faz e o que não faz) e a data de nascimento, que nunca
 * é guardada (LEG-F01).
 */
async function SignupAgePage() {
  // Desencoraja nova tentativa imediata, sem identificar ninguém (cookie de sessão do navegador).
  if (await hasAgeBlockCookie()) redirect('/cadastro/indisponivel');

  const t = await getTranslations('auth.signup');
  const tw = await getTranslations('onboarding.welcome');
  return (
    <>
      <section aria-labelledby="boas-vindas" className="mb-6 flex flex-col gap-3">
        <h1 id="boas-vindas" className="text-2xl font-bold">
          {tw('title')}
        </h1>
        <p>{tw('intro')}</p>
        <div className="grid gap-3">
          <div>
            <h2 className="font-semibold">{tw('doesTitle')}</h2>
            <ul className="list-disc pl-5 text-sm">
              <li>{tw('does1')}</li>
              <li>{tw('does2')}</li>
              <li>{tw('does3')}</li>
            </ul>
          </div>
          <div>
            <h2 className="font-semibold">{tw('doesNotTitle')}</h2>
            <ul className="list-disc pl-5 text-sm">
              <li>{tw('doesNot1')}</li>
              <li>{tw('doesNot2')}</li>
            </ul>
          </div>
        </div>
      </section>
      <h2 className="mb-2 text-xl font-bold">{t('stepAgeTitle')}</h2>
      <p className="mb-4 text-sm text-fg-muted">{t('stepAgeDescription')}</p>
      <AgeForm />
    </>
  );
}

export default withRouteMessages('(auth)/cadastro', SignupAgePage);
