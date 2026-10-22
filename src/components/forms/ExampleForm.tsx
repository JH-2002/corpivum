'use client';

import { FlaskConical } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { DemoReadOnlyNotice } from '@/components/health/DemoModeBanner';

/**
 * Formulário em modo exemplo na demonstração (9b): o mesmo formulário do app, preenchido com dados fictícios e
 * dentro de um `<fieldset disabled>`, que desativa campos e envio de uma vez. Nada é enviado ao servidor
 * (regras 4 e 6; LEG-X02). O aviso fixo diz que na demonstração nada é salvo.
 */
export function ExampleForm({
  publicDemo = false,
  children,
}: {
  publicDemo?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('demo');
  const noticeId = useId();
  return (
    // Alvo do foco ao chegar pelo "Registrar" (os campos estão desativados); sem moldura depois de clique.
    <div tabIndex={-1} data-example-focus="" className="flex flex-col gap-3">
      <div id={noticeId} className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <FlaskConical className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {t('exampleNotice')}
        </p>
        <DemoReadOnlyNotice publicDemo={publicDemo} />
      </div>
      <fieldset
        disabled
        aria-describedby={noticeId}
        data-example-form=""
        className="m-0 min-w-0 border-0 p-0"
      >
        {children}
      </fieldset>
    </div>
  );
}
