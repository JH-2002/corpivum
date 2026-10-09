import { useTranslations } from 'next-intl';
import { SAFETY_REASONS, type GuardrailReason } from '@/modules/guardrails';
import { SupportNotice } from './SupportNotice';

/**
 * Aviso quando um guardrail bloqueia uma meta ou sugestão (LEG-M04, LEG-M07, §48, ADR-0027). Diz, sem
 * números restritivos e sem juízo, que o app não acompanha esse alvo. Só nos motivos de segurança
 * (`SAFETY_REASONS`) orienta buscar profissional de saúde e mostra o apoio (CVV 188 / SAMU 192); erros
 * comuns de formulário não ganham orientação de crise. Nunca sugere uma versão "mais leve" do mesmo alvo.
 */
export function GuardrailNotice({ reasons }: { reasons: readonly GuardrailReason[] }) {
  const t = useTranslations('guardrails');
  const unique = [...new Set(reasons)];
  const safety = unique.some((r) => SAFETY_REASONS.has(r));
  return (
    <div className="flex flex-col gap-3" data-testid="guardrail-notice">
      <section
        aria-labelledby="guardrail-title"
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm"
      >
        <h2 id="guardrail-title" className="text-base font-semibold">
          {t(safety ? 'title' : 'titleValidation')}
        </h2>
        <ul className="list-disc pl-5">
          {unique.map((reason) => (
            <li key={reason}>{t(`reasons.${reason}`)}</li>
          ))}
        </ul>
        {safety ? <p>{t('professional')}</p> : null}
      </section>
      {safety ? <SupportNotice /> : null}
    </div>
  );
}
