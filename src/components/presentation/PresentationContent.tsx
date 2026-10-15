import { Dashboard } from '@/components/dashboard/Dashboard';
import type { HealthMode } from '@/components/health/HealthPage';
import { TimelineView } from '@/components/modules/timeline/TimelineView';
import { ReportView } from '@/components/reports/ReportView';
import { TwinBodyView } from '@/components/twin/TwinViews';
import type { DateRange } from '@/lib/period';
import { buildDashboard } from '@/modules/health/dashboard';
import { maskBodyScreen, maskDashboard, maskTimeline } from '@/modules/health/mask';
import { loadTimeline } from '@/modules/health/screens';
import type { HealthDataSource } from '@/modules/health/source';
import { buildReport, calendarRange } from '@/modules/reports';
import { buildTimeline } from '@/modules/timeline';
import type { PresentationScreen } from './screens';

/**
 * Conteúdo de cada tela do modo apresentação (§45, ADR-0035), com os mesmos componentes, selos e regras das
 * telas normais: dashboard, corpo 3D (só o corpo), timeline e relatório do mês. No modo privacidade os
 * valores saem no servidor, como nas outras telas; com dados próprios, o twin fica na forma de referência.
 */
export async function PresentationContent({
  screen,
  source,
  mode,
  hidden,
  range,
  today,
}: {
  screen: PresentationScreen;
  source: HealthDataSource;
  mode: HealthMode;
  hidden: boolean;
  range: DateRange;
  today: string;
}) {
  const own = mode === 'own';
  switch (screen) {
    case 'painel': {
      const data = await buildDashboard(source, range, today);
      return <Dashboard data={hidden ? maskDashboard(data) : data} mode={mode} hidden={hidden} />;
    }
    case 'twin': {
      const [raw, rawHeight] = await source.session((s) =>
        Promise.all([s.body(range), s.latestHeightCm()]),
      );
      const { records, latestHeightCm } =
        hidden && own ? maskBodyScreen(raw) : { records: raw, latestHeightCm: rawHeight };
      return (
        <TwinBodyView
          records={records}
          latestHeightCm={latestHeightCm}
          range={range}
          today={today}
          mode={mode}
          hidden={hidden}
        />
      );
    }
    case 'timeline': {
      const data = await loadTimeline(source, range);
      const days = buildTimeline({ ...data, range, today, domain: null });
      return (
        <TimelineView
          days={hidden ? maskTimeline(days) : days}
          domain={null}
          basePath={own || mode === 'appDemo' ? '/timeline' : '/demo/timeline'}
          range={range}
          today={today}
          mode={mode}
          hidden={hidden}
          filters={false}
        />
      );
    }
    case 'relatorio': {
      const model = await buildReport(source, {
        period: 'month',
        range: calendarRange('month', today, today),
        today,
        hideBodyValues: hidden,
      });
      return <ReportView model={model} generatedOn={today} />;
    }
  }
}
