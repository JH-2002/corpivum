import { useTranslations } from 'next-intl';

/** Quantidade de itens (`p1`…) de cada guia em `twin.guide.<id>.points`. */
export const TWIN_GUIDES = { body: 4, compare: 2, brain: 3 } as const;
export type TwinGuideId = keyof typeof TWIN_GUIDES;

/**
 * "Como ler este modelo" (ADR-0025/0026): mesmo padrão do `ChartGuide`, em `<details>` nativo. Diz o que
 * a forma, a cor e os selos representam e o que fazer com a informação, sem juízo sobre o corpo.
 */
export function TwinGuide({ id }: { id: TwinGuideId }) {
  const t = useTranslations('twin.guide');
  const tb = useTranslations('badges');
  type Key = Parameters<typeof t>[0];
  const points = Array.from({ length: TWIN_GUIDES[id] }, (_, i) => `${id}.points.p${i + 1}` as Key);
  return (
    <details className="text-sm" data-tour="chart-guide">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
        {t('title')}
      </summary>
      <div className="flex flex-col gap-2 pt-1">
        <ul className="list-disc pl-5">
          {points.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <p>
          {t('badges', {
            informed: tb('INFORMADO'),
            estimated: tb('ESTIMADO'),
            inferred: tb('INFERIDO'),
          })}
        </p>
        <p className="font-semibold">{t('whatToDoTitle')}</p>
        <p>{t(`${id}.whatToDo`)}</p>
      </div>
    </details>
  );
}
