import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { ExportFiles } from '@/components/reports/ExportFiles';
import { ReportFileForm } from '@/components/reports/ExportForms';
import { ReportPicker } from '@/components/reports/ReportPicker';
import { ReportView } from '@/components/reports/ReportView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { requireAppSession } from '@/modules/consent/server';
import { todayIso } from '@/modules/health/server';
import {
  buildReport,
  calendarRange,
  isValidReference,
  reportPeriodSchema,
} from '@/modules/reports';
import { getReportsService } from '@/modules/reports/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('reports') };
}

/**
 * Relatórios (§29, ADR-0032): semana, mês ou ano civil, na tela e em arquivo (PDF, CSV, JSON) com link
 * autenticado que expira (LEG-D03). Mesmas regras das telas de saúde: consentimento ou demo (ADR-0021).
 */
export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const t = await getTranslations('reports');
  const today = todayIso();
  const params = await searchParams;
  const period = reportPeriodSchema.safeParse(params.tipo).data ?? 'month';
  const rawRef = typeof params.ref === 'string' ? params.ref : today;
  const invalid = !isValidReference(rawRef, today);
  const reference = invalid ? today : rawRef;
  const range = calendarRange(period, reference, today);
  const view = healthView(session, today);
  const own = view.kind === 'data' && view.mode === 'own';
  const [model, jobs] =
    view.kind === 'data' && !preview
      ? await Promise.all([
          buildReport(view.source, { period, range, today, hideBodyValues: false }),
          own ? getReportsService().list(session.userId) : Promise.resolve([]),
        ])
      : [null, []];

  return (
    <HealthFrame page="reports" href="/relatorios" session={session} view={view} preview={preview}>
      <div className="flex flex-col gap-6">
        <p className="text-sm">{t('intro')}</p>
        <ReportPicker period={period} reference={reference} today={today} invalid={invalid} />
        {model ? <ReportView model={model} generatedOn={today} /> : null}
        <section
          aria-labelledby="report-generate"
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <h2 id="report-generate" className="text-base font-semibold">
            {t('generate.title')}
          </h2>
          {own ? (
            <>
              <p className="text-sm text-fg-muted">{t('generate.intro')}</p>
              <ReportFileForm period={period} reference={reference} />
            </>
          ) : (
            <p className="text-sm">{t('generate.demo')}</p>
          )}
        </section>
        {own ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            <ExportFiles jobs={jobs} href="/relatorios" />
          </div>
        ) : null}
      </div>
    </HealthFrame>
  );
}
