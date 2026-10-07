import { useTranslations } from 'next-intl';
import { SUBPROCESSORS } from '@/modules/privacy';

/**
 * Subprocessadores com finalidade, dados e região (LEG-D06, LEG-S10). Em telas estreitas vira lista
 * (sem rolagem horizontal da página).
 */
export function SubprocessorTable() {
  const t = useTranslations('subprocessors');
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border">
        {SUBPROCESSORS.map((key) => (
          <li key={key} className="grid gap-1 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <p className="font-semibold">{t(`items.${key}.service`)}</p>
            <dl className="grid gap-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
              <dt className="font-semibold">{t('columns.purpose')}</dt>
              <dd className="text-fg-muted">{t(`items.${key}.purpose`)}</dd>
              <dt className="font-semibold">{t('columns.data')}</dt>
              <dd className="text-fg-muted">{t(`items.${key}.data`)}</dd>
              <dt className="font-semibold">{t('columns.region')}</dt>
              <dd className="text-fg-muted">{t(`items.${key}.region`)}</dd>
              <dt className="font-semibold">{t('columns.provider')}</dt>
              <dd className="text-fg-muted">{t('toDefine')}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="text-sm text-fg-muted">{t('notUsed')}</p>
    </div>
  );
}
