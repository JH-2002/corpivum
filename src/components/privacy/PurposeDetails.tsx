import { useTranslations } from 'next-intl';
import type { AvailablePurpose } from '@/modules/consent';

const FIELDS = ['collected', 'purpose', 'processors', 'refusal', 'revoke'] as const;

/**
 * Texto completo de uma finalidade (LEG-C03): o que é coletado, para quê, quem processa e onde, a
 * consequência de recusar e como revogar. É o texto versionado (hash em PolicyVersion).
 */
export function PurposeDetails({
  purpose,
  graceDays,
}: {
  purpose: AvailablePurpose;
  /** HEALTH_DATA_GRACE_DAYS, citado no texto de revogação dos dados de bem-estar. */
  graceDays: number;
}) {
  const t = useTranslations(`consent.purposes.${purpose}`);
  const tf = useTranslations('consent.fields');
  return (
    <dl className="grid gap-2 text-sm">
      {FIELDS.map((field) => (
        <div key={field}>
          <dt className="font-semibold">{tf(field)}</dt>
          <dd className="text-fg-muted">{t(field, { days: graceDays })}</dd>
        </div>
      ))}
    </dl>
  );
}
