'use client';

import { FlaskConical } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useDemoOnly } from '@/components/demo/DemoOnlyContext';

/**
 * Formulário em modo exemplo na demonstração (9b): o mesmo formulário do app, preenchido com dados fictícios e
 * dentro de um `<fieldset disabled>`, que desativa campos e envio de uma vez. Nada é enviado ao servidor
 * (regras 4 e 6; LEG-X02). Um aviso só: nada é salvo e, fora do modo só demo, como registrar os próprios dados.
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
  // Modo só demo (ADR-0043): não há conta a criar, então o aviso não convida a registrar.
  const demoOnly = useDemoOnly();
  const notice = demoOnly
    ? 'exampleNoticeDemoOnly'
    : publicDemo
      ? 'exampleNoticePublic'
      : 'exampleNotice';
  return (
    // Alvo do foco ao chegar pelo "Registrar" (os campos estão desativados); sem moldura depois de clique.
    <div tabIndex={-1} data-example-focus="" className="flex flex-col gap-3">
      <p
        id={noticeId}
        className="flex items-start gap-2 rounded-md border border-border bg-surface-muted p-3 text-sm font-semibold"
      >
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        {t(notice)}
      </p>
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
