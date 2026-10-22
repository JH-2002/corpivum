import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { logoutAction } from '@/app/(auth)/actions';
import {
  ChangePassword,
  DisableMfa,
  EnableMfa,
  RegenerateCodes,
} from '@/components/auth/SecurityForms';
import { buttonClasses } from '@/components/ui/Button';
import { getAuthService } from '@/modules/auth/server';
import { requireAppSession } from '@/modules/consent/server';
import { revokeOtherSessionsAction, revokeSessionAction } from './actions';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.security');
  return { title: t('title') };
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Segurança da conta (§46, LEG-S04): sessões ativas, verificação em duas etapas e senha. */
async function SecurityPage() {
  // Trocar a senha ou mexer no MFA nunca depende de aceitar uma versão nova (P7-B3, LEG-C06).
  const session = await requireAppSession({ allowPendingUpdate: true });
  const service = getAuthService();
  const [sessions, overview] = await Promise.all([
    service.listSessions(session.userId, session.sessionId),
    service.getSecurityOverview(session.userId),
  ]);
  const t = await getTranslations('auth.security');
  const format = await getFormatter();
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'short', timeStyle: 'short' });
  const others = sessions.filter((s) => !s.current);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="sr-only">{t('title')}</h2>

      <Card title={t('sessionsTitle')} description={t('sessionsDescription')}>
        <ul className="flex flex-col divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {s.deviceLabel}
                  {s.current ? (
                    <span className="ml-2 rounded-full border border-border-strong px-2 py-0.5 text-xs">
                      {t('currentSession')}
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-fg-muted">
                  {t('lastSeen', { when: when(s.lastSeenAt) })} ·{' '}
                  {t('startedAt', { when: when(s.createdAt) })}
                </p>
              </div>
              <form action={revokeSessionAction}>
                <input type="hidden" name="sessionId" value={s.id} />
                <button
                  type="submit"
                  className={buttonClasses('secondary')}
                  aria-label={t('revokeLabel', { device: s.deviceLabel })}
                >
                  {t('revoke')}
                </button>
              </form>
            </li>
          ))}
        </ul>
        {others.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('sessionsEmpty')}</p>
        ) : (
          <form action={revokeOtherSessionsAction}>
            <button type="submit" className={buttonClasses('secondary')}>
              {t('revokeOthers')}
            </button>
          </form>
        )}
        <form action={logoutAction}>
          <button type="submit" className={buttonClasses('ghost')}>
            {t('signOut')}
          </button>
        </form>
      </Card>

      <Card
        title={t('mfaTitle')}
        description={
          overview.mfaEnabled ? t('mfaOn', { count: overview.recoveryLeft }) : t('mfaOff')
        }
      >
        {overview.mfaEnabled ? (
          <div className="grid gap-6 md:grid-cols-2">
            <RegenerateCodes />
            <DisableMfa />
          </div>
        ) : (
          <EnableMfa />
        )}
      </Card>

      <Card title={t('passwordTitle')}>
        <ChangePassword />
      </Card>
    </div>
  );
}

export default withRouteMessages('(app)/configuracoes/seguranca', SecurityPage);
