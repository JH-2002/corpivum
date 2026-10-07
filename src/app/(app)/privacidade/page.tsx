import { CheckCircle2, CircleSlash, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PurposeDetails } from '@/components/privacy/PurposeDetails';
import { HealthRevokeDialog, MinorClosureDialog } from '@/components/privacy/PrivacyDialogs';
import { SubprocessorTable } from '@/components/privacy/SubprocessorTable';
import { buttonClasses } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { getEnv } from '@/lib/env';
import { getAuthService } from '@/modules/auth/server';
import { healthPurgeDate, type PurposeState } from '@/modules/consent';
import { getConsentState, requireAppSession } from '@/modules/consent/server';
import type { PrivacyRequestSummary } from '@/modules/privacy';
import { getPrivacyService } from '@/modules/privacy/server';
import { revokeSessionAction } from '../configuracoes/seguranca/actions';
import { grantConsentAction, revokeConsentAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('privacy') };
}

const linkClass = 'font-semibold text-primary underline underline-offset-2';

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
 * Central de Privacidade (§46 + adendo; LEG-C04, LEG-D06, LEG-D07, LEG-F04, LEG-S04): autorizações por
 * finalidade (conceder/revogar em 1–2 cliques), documentos aceitos, sessões ativas, subprocessadores,
 * pedidos abertos e encerramento de conta de menor. Acessível mesmo com reconsentimento pendente.
 */
export default async function PrivacyCenterPage() {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession({ allowPendingUpdate: true });
  const env = getEnv();
  const [state, sessions, requests] = await Promise.all([
    getConsentState(session.userId),
    getAuthService().listSessions(session.userId, session.sessionId),
    getPrivacyService()
      .listOpenRequests(session.userId)
      .catch((): null => null),
  ]);
  const t = await getTranslations('privacyCenter');
  const tc = await getTranslations('consent');
  const ts = await getTranslations('auth.security');
  const format = await getFormatter();
  const date = (d: Date) => format.dateTime(d, { dateStyle: 'long' });
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'short', timeStyle: 'short' });
  const purgeAt = state.health.status === 'revoked' ? state.health.purgeAt : null;

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
          exportAvailable={false}
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

      <Section id="pedidos" title={t('requestsTitle')}>
        <RequestList requests={requests} />
      </Section>

      <Section id="menor-de-18" title={t('minorTitle')} description={t('minorDescription')}>
        <div>
          <MinorClosureDialog
            retention={{
              proofDays: env.PROOF_RETENTION_DAYS,
              accessDays: env.ACCESS_LOG_RETENTION_DAYS,
              backupDays: env.BACKUP_RETENTION_DAYS,
            }}
          />
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
