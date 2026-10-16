import { Download, Trash2 } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useFormatter, useTranslations } from 'next-intl';
import { deleteExportAction } from '@/app/(app)/relatorios/actions';
import { SubmitButton } from '@/components/forms/FormFields';
import { buttonClasses } from '@/components/ui/Button';
import { formatIsoDate } from '@/lib/period';
import type { ExportJobSummary } from '@/modules/reports/service';

const earliest = (a: Date, b: Date | null) => (b && b < a ? b : a);

/**
 * Arquivos das últimas 24 h (LEG-D03, ADR-0032): estado, prazo do link, baixar e apagar. O link aponta para a
 * rota autenticada; não há endereço público. Estado em texto e ícone (a cor nunca é o único canal).
 */
export function ExportFiles({
  jobs,
  href,
  until = null,
  headingId = 'export-files',
}: {
  jobs: ExportJobSummary[];
  href: Route;
  /** Carência após revogar (OI-32): nenhum link vale além da data da eliminação. */
  until?: Date | null;
  /** Id do título, quando a lista aparece mais de uma vez na página (Central: dados e exclusão). */
  headingId?: string;
}) {
  const t = useTranslations('reports.files');
  const th = useTranslations('reports.heading');
  const format = useFormatter();
  const name = (j: ExportJobSummary) =>
    j.kind === 'full_export'
      ? t('kind.full_export', { format: j.format.toUpperCase() })
      : t('kind.report', {
          heading: j.reportPeriod ? th(j.reportPeriod) : '',
          format: j.format.toUpperCase(),
          range: j.range ? `${formatIsoDate(j.range.from)}–${formatIsoDate(j.range.to)}` : '',
        });

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          {t('title')}
        </h2>
        <Link href={href} className={buttonClasses('secondary')}>
          {t('refresh')}
        </Link>
      </div>
      <p className="text-sm text-fg-muted">{t('linkNote')}</p>
      {jobs.length === 0 ? (
        <p className="text-sm">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((j) => {
            const label = name(j);
            // Vencido mas ainda não limpo pelo job: já aparece como expirado (revisão B4).
            const ready = j.downloadable;
            const status = j.status === 'ready' && !ready ? 'expired' : j.status;
            return (
              <li
                key={j.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{label}</span>
                  <span className="text-fg-muted" data-testid="export-status">
                    {t(`status.${status}`)}
                    {ready && j.expiresAt
                      ? ` · ${t('expires', {
                          date: format.dateTime(earliest(new Date(j.expiresAt), until), {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }),
                        })}`
                      : null}
                  </span>
                  {j.hideBodyValues ? (
                    <span className="text-fg-muted">{t('bodyHidden')}</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ready ? (
                    <a
                      href={`/privacidade/exportacoes/${j.id}`}
                      download
                      aria-label={t('downloadLabel', { name: label })}
                      className={buttonClasses('primary')}
                    >
                      <Download aria-hidden className="size-4" />
                      {t('download')}
                    </a>
                  ) : null}
                  <form action={deleteExportAction}>
                    <input type="hidden" name="id" value={j.id} />
                    <SubmitButton
                      variant="secondary"
                      aria-label={t('deleteLabel', { name: label })}
                    >
                      <Trash2 aria-hidden className="size-4" />
                      {t('delete')}
                    </SubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
