import { useTranslations } from 'next-intl';
import type { WellbeingScore } from '@/modules/wellbeing';

/**
 * "Como é calculado" (§14, LEG-D08): componentes, pesos nominal e efetivo, valor, amostra e motivo de
 * exclusão, com a versão do Índice. `<details>` nativo: abre com teclado e toque, sem JavaScript.
 */
export function ScoreExplanation({ score }: { score: WellbeingScore }) {
  const t = useTranslations('wellbeing');
  const pct = (w: number | null) => (w === null ? '—' : `${Math.round(w * 100)}%`);
  return (
    <details className="text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
        {t('howTitle')}
      </summary>
      <div className="flex flex-col gap-3 pt-2">
        <p>{t('howIntro')}</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t('tableCaption', { version: score.version })}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border p-2">
                  {t('col.component')}
                </th>
                <th scope="col" className="border-b border-border p-2">
                  {t('col.value')}
                </th>
                <th scope="col" className="border-b border-border p-2">
                  {t('col.weight')}
                </th>
                <th scope="col" className="border-b border-border p-2">
                  {t('col.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {score.components.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="border-b border-border p-2 align-top font-normal">
                    <span className="block font-semibold">{t(`components.${c.id}.name`)}</span>
                    <span className="block text-fg-muted">{t(`components.${c.id}.rule`)}</span>
                  </th>
                  <td className="tabular border-b border-border p-2 align-top">
                    {c.value === null ? '—' : `${c.value}/100`}
                  </td>
                  <td className="tabular border-b border-border p-2 align-top">
                    {t('weightValue', {
                      nominal: pct(c.weight),
                      effective: pct(c.effectiveWeight),
                    })}
                  </td>
                  <td className="border-b border-border p-2 align-top">
                    {c.included
                      ? t(c.id === 'activity' ? 'includedDays' : 'included', { count: c.sample })
                      : t(`excluded.${c.reason ?? 'insufficient_data'}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-fg-muted">{t('howFooter', { version: score.version })}</p>
      </div>
    </details>
  );
}
