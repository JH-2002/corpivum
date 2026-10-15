import { CheckCircle2, CircleSlash, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PurposeDetails } from '@/components/privacy/PurposeDetails';
import { HealthRevokeDialog, MinorClosureDialog } from '@/components/privacy/PrivacyDialogs';
import { AccountDeletionDialog, PrivacyRequestForm } from '@/components/privacy/RightsForms';
import { SubprocessorTable } from '@/components/privacy/SubprocessorTable';
import { ExportFiles } from '@/components/reports/ExportFiles';
import { FullExportForm } from '@/components/reports/ExportForms';
import { buttonClasses } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { getEnv } from '@/lib/env';
import { getAuthService } from '@/modules/auth/server';
import { healthPurgeDate, type PurposeState } from '@/modules/consent';
import { getConsentState, requireAppSession } from '@/modules/consent/server';
import type { PrivacyRequestSummary } from '@/modules/privacy';
import { getPrivacyService } from '@/modules/privacy/server';
import { EXPORT_TABLES, type ExportTableName } from '@/modules/reports';
import { getReportsService } from '@/modules/reports/server';
import { revokeSessionAction } from '../configuracoes/seguranca/actions';
import { grantConsentAction, revokeConsentAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('privacy') };
}

const linkClass = 'font-semibold text-primary underline underline-offset-2';

/** Onde cada categoria é vista e corrigida (LEG-D02: correção na própria tela). */
const CORRECT_AT: Record<
  ExportTableName,
  '/sono' | '/habitos' | '/corpo' | '/alimentacao' | '/atividade' | '/metas'
> = {
  sleep: '/sono',
  habits: '/habitos',
  habit_checks: '/habitos',
  body_measurements: '/corpo',
  meals: '/alimentacao',
  water: '/alimentacao',
  activities: '/atividade',
  strength_sets: '/atividade',
  goals: '/metas',
  reminders: '/habitos',
};

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-sm"
    >
      <div>
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Central de Privacidade (§46 + adendo; LEG-C04, LEG-D01–D07, LEG-F04, LEG-S04): autorizações por
 * finalidade (conceder/revogar em 1–2 cliques), seus dados, documentos aceitos, sessões ativas,
 * subprocessadores, pedidos do titular, exclusão de conta e encerramento de conta de menor. Acessível mesmo
 * com reconsentimento pendente.
 */
export default async function PrivacyCenterPage() {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession({ allowPendingUpdate: true });
  const env = getEnv();
  const reports = getReportsService();
  const auth = getAuthService();
  const [state, sessions, security, requests, counts, exports] = await Promise.all([
    getConsentState(session.userId),
    auth.listSessions(session.userId, session.sessionId),
    auth.getSecurityOverview(session.userId),
    getPrivacyService()
      .listOpenRequests(session.userId)
      .catch((): null => null),
    reports.dataSummary(session.userId),
    reports.list(session.userId),
  ]);
  const t = await getTranslations('privacyCenter');
  const tc = await getTranslations('consent');
  const ts = await getTranslations('auth.security');
  const format = await getFormatter();
  const date = (d: Date) => format.dateTime(d, { dateStyle: 'long' });
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'short', timeStyle: 'short' });
  const purgeAt = state.health.status === 'revoked' ? state.health.purgeAt : null;
  // Carência (OI-32): só até a data da eliminação, mesmo que o job ainda não tenha rodado (revisão B4).
  const graceUntil = purgeAt && purgeAt > new Date() ? purgeAt : null;
  const canExport = session.dataMode === 'own' && (counts !== null || graceUntil !== null);
  const fullExports = exports.filter((j) => j.kind === 'full_export');
  const retention = {
    proofDays: env.PROOF_RETENTION_DAYS,
    accessDays: env.ACCESS_LOG_RETENTION_DAYS,
    backupDays: env.BACKUP_RETENTION_DAYS,
  };

  function status(p: PurposeState) {
    if (p.active) {
      return (
        <>
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          {tc('status.active')}
        </>
      );
    }
    if (p.purpose === 'health_data' && purgeAt) {
      return (
        <>
          <Clock className="size-4 text-warning" aria-hidden="true" />
          {tc('status.revokedPending', { date: date(purgeAt) })}
        </>
      );
    }
    return (
      <>
        <CircleSlash className="size-4" aria-hidden="true" />
        {tc('status.inactive')}
      </>
    );
  }

  function action(p: PurposeState) {
    const title = tc(`purposes.${p.purpose}.title`);
    if (p.active && p.purpose === 'health_data') {
      return (
        <HealthRevokeDialog
          purgeDate={date(healthPurgeDate(new Date(), env.HEALTH_DATA_GRACE_DAYS))}
          graceDays={env.HEALTH_DATA_GRACE_DAYS}
        />
      );
    }
    return (
      <form action={p.active ? revokeConsentAction : grantConsentAction}>
        <input type="hidden" name="purpose" value={p.purpose} />
        <button
          type="submit"
          className={buttonClasses(p.active ? 'secondary' : 'primary')}
          aria-label={tc(p.active ? 'revokeLabel' : 'grantLabel', { purpose: title })}
        >
          {tc(p.active ? 'revoke' : 'grant')}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p>{t('intro')}</p>

      <Section id="autorizacoes" title={t('consentsTitle')} description={t('consentsDescription')}>
        <ul className="flex flex-col divide-y divide-border">
          {state.purposes.map((p) => (
            <li key={p.purpose} className="flex flex-col gap-3 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{tc(`purposes.${p.purpose}.title`)}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-sm">{status(p)}</p>
                  {p.active && p.grantedAt && p.version !== null ? (
                    <p className="text-sm text-fg-muted">
                      {tc('since', { date: date(p.grantedAt) })} ·{' '}
                      {tc('version', { version: p.version })}
                    </p>
                  ) : null}
                </div>
                {action(p)}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-primary">
                  {tc('details', { purpose: tc(`purposes.${p.purpose}.title`) })}
                </summary>
                <div className="pt-2">
                  <PurposeDetails purpose={p.purpose} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="seus-dados" title={t('data.title')} description={t('data.description')}>
        <h3 className="text-base font-semibold">{t('data.healthTitle')}</h3>
        {session.dataMode === 'demo' ? (
          <p className="text-sm">{t('data.demo')}</p>
        ) : counts === null ? (
          <p className="text-sm">
            {graceUntil ? t('data.grace', { date: date(graceUntil) }) : t('data.noConsent')}
          </p>
        ) : (
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {EXPORT_TABLES.map((name) => (
              <li
                key={name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <span>
                  <span className="font-semibold">{t(`data.categories.${name}`)}</span>
                  {' · '}
                  {t('data.count', { count: counts[name] })}
                </span>
                <Link
                  href={CORRECT_AT[name]}
                  className={linkClass}
                  aria-label={t('data.correct', { category: t(`data.categories.${name}`) })}
                >
                  {t('data.correctShort')}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <h3 className="text-base font-semibold">{t('data.accountTitle')}</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>{t('data.accountItems.account')}</li>
          <li>{t('data.accountItems.proofs')}</li>
          <li>{t('data.accountItems.sessions')}</li>
          <li>{t('data.accountItems.access', { days: env.ACCESS_LOG_RETENTION_DAYS })}</li>
        </ul>
        {/* Na carência após revogar (OI-32), a cópia completa continua disponível até a eliminação. */}
        {canExport ? (
          <>
            <h3 className="text-base font-semibold">{t('data.exportTitle')}</h3>
            <p className="text-sm text-fg-muted">{t('data.exportDescription')}</p>
            <FullExportForm />
            <ExportFiles jobs={exports} href="/privacidade" until={graceUntil} />
          </>
        ) : null}
      </Section>

      <Section id="documentos" title={t('documentsTitle')}>
        <ul className="flex flex-col gap-2 text-sm">
          {state.documents.map((d) => (
            <li key={d.document}>
              <Link
                href={d.document === 'terms' ? '/legal/termos' : '/legal/politica-de-privacidade'}
                className={linkClass}
              >
                {d.document === 'terms' ? t('terms') : t('privacyPolicy')}
              </Link>
              {d.acceptedVersion !== null && d.acceptedAt ? (
                <span className="text-fg-muted">
                  {' · '}
                  {t('documentsAccepted', {
                    version: d.acceptedVersion,
                    date: date(d.acceptedAt),
                  })}
                </span>
              ) : null}
              {d.acknowledgedVersion !== null && d.acknowledgedAt ? (
                <span className="text-fg-muted">
                  {' · '}
                  {t('documentsAcknowledged', {
                    version: d.acknowledgedVersion,
                    date: date(d.acknowledgedAt),
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="sessoes" title={t('sessionsTitle')} description={t('sessionsDescription')}>
        <ul className="flex flex-col divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {s.deviceLabel}
                  {s.current ? (
                    <span className="ml-2 rounded-full border border-border-strong px-2 py-0.5 text-xs">
                      {ts('currentSession')}
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-fg-muted">
                  {ts('lastSeen', { when: when(s.lastSeenAt) })}
                </p>
              </div>
              <form action={revokeSessionAction}>
                <input type="hidden" name="sessionId" value={s.id} />
                <button
                  type="submit"
                  className={buttonClasses('secondary')}
                  aria-label={ts('revokeLabel', { device: s.deviceLabel })}
                >
                  {ts('revoke')}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <Link href="/configuracoes/seguranca" className={`${linkClass} text-sm`}>
          {t('manageSecurity')}
        </Link>
      </Section>

      <Section
        id="subprocessadores"
        title={t('subprocessorsTitle')}
        description={t('subprocessorsDescription')}
      >
        <SubprocessorTable />
        <Link href="/legal/subprocessadores" className={`${linkClass} text-sm`}>
          {t('subprocessorsPublic')}
        </Link>
      </Section>

      <Section id="pedidos" title={t('requestsTitle')} description={t('requests.description')}>
        <RequestList requests={requests} />
        <h3 className="text-base font-semibold">{t('requests.newTitle')}</h3>
        <PrivacyRequestForm />
      </Section>

      <Section
        id="excluir-conta"
        title={t('deletion.title')}
        description={t('deletion.description')}
      >
        <h3 className="text-base font-semibold">{t('deletion.whatTitle')}</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>{t('deletion.what.now')}</li>
          <li>{t('deletion.what.erased')}</li>
          <li>{t('deletion.what.proofs', { days: retention.proofDays })}</li>
          <li>{t('deletion.what.access', { days: retention.accessDays })}</li>
          <li>{t('deletion.what.backups', { days: retention.backupDays })}</li>
          <li>{t('deletion.what.final')}</li>
        </ul>
        <h3 className="text-base font-semibold">{t('deletion.exportTitle')}</h3>
        {canExport ? (
          <>
            <p className="text-sm text-fg-muted">{t('deletion.exportDescription')}</p>
            <FullExportForm />
            <ExportFiles
              jobs={fullExports}
              href="/privacidade"
              until={graceUntil}
              headingId="deletion-export-files"
            />
          </>
        ) : (
          <p className="text-sm">{t('deletion.exportUnavailable')}</p>
        )}
        <div>
          <AccountDeletionDialog
            mfaEnabled={security.mfaEnabled}
            hasExport={fullExports.some((j) => j.downloadable)}
            retention={retention}
          />
        </div>
      </Section>

      <Section id="menor-de-18" title={t('minorTitle')} description={t('minorDescription')}>
        <div>
          <MinorClosureDialog retention={retention} mfaEnabled={security.mfaEnabled} />
        </div>
      </Section>
    </div>
  );
}

async function RequestList({ requests }: { requests: PrivacyRequestSummary[] | null }) {
  const t = await getTranslations('privacyCenter');
  const format = await getFormatter();
  const date = (d: Date) => format.dateTime(d, { dateStyle: 'long' });
  if (requests === null) {
    return <StateView state="error" />;
  }
  if (requests.length === 0) {
    return <p className="text-sm text-fg-muted">{t('requestsEmpty')}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {requests.map((r) => (
        <li key={r.id} className="py-3">
          <p className="font-semibold">{t(`requestKind.${r.kind}`)}</p>
          <p className="text-sm text-fg-muted">
            {t(`requestStatus.${r.status}`)} · {t('requestOpened', { date: date(r.createdAt) })} ·{' '}
            {t('requestDue', { date: date(r.dueAt) })}
          </p>
        </li>
      ))}
    </ul>
  );
}
