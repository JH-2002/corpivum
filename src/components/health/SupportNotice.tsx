import { HeartHandshake } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Orientação de apoio (§48, LEG-I07, CLAUDE.md regra 9): CVV 188 e SAMU 192. Texto do namespace
 * `disclaimer.*` (revisão jurídica e clínica, OI-09). Não avalia risco nem dá conselho.
 */
export function SupportNotice({ emphasis = false }: { emphasis?: boolean }) {
  const t = useTranslations('disclaimer');
  return (
    <aside
      role={emphasis ? 'status' : undefined}
      className={
        emphasis
          ? 'flex items-start gap-3 rounded-lg border border-primary bg-primary-soft p-4 text-sm text-primary-soft-fg'
          : 'flex items-start gap-3 rounded-lg border border-border bg-surface p-4 text-sm'
      }
    >
      <HeartHandshake className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p>{t('riskSupport')}</p>
    </aside>
  );
}
