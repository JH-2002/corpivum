import type { JobQueue } from '@/adapters/jobs/types';
import { auditAppend } from '@/lib/db/audit';
import type { Db } from '@/lib/db/client';
import { withUserOn, type Tx } from '@/lib/db/rls';
import { AppError } from '@/lib/errors';
import type { Logger } from '@/lib/logger';
import { expireExportsIn } from '@/modules/reports/expire';
import {
  AVAILABLE_PURPOSES,
  CURRENT_VERSIONS,
  HEALTH_DATA_GRACE_DAYS_IN_TEXT,
  isAvailablePurpose,
  isPolicyDocument,
  POLICY_DOCUMENTS,
  purposeDocument,
  REQUIRED_DOCUMENTS,
  type AvailablePurpose,
  type DocumentVersion,
  type PolicyDocument,
  type RequiredDocument,
} from './catalog';
import {
  HEALTH_ELIMINATION_JOB,
  healthEliminationKey,
  healthPurgeDate,
  type HealthConsentState,
} from './health';

/**
 * Consentimento por finalidade e aceite de documentos (LEG-C01–C06; ADR-0019).
 * Regras:
 * - Nada é concedido por padrão; cada finalidade é uma escolha separada (LEG-C02).
 * - Conceder cria um registro novo com a versão e o hash do texto vigente; revogar só preenche
 *   `revoked_at` (histórico preservado, LEG-R03). Toda mudança grava AuditLog na mesma transação.
 * - Revogar dados de saúde: o tratamento para na hora (o guard e o RLS leem o mesmo registro) e a
 *   eliminação é agendada para `healthDataGraceDays`; reconsentir antes cancela (ADR-0019, LEGAL-REVIEW).
 * - Versão substancial nova (LEG-C06): o consentimento antigo deixa de valer até a pessoa escolher de novo.
 * Logs só com userId e a finalidade (identificador), nunca conteúdo.
 */
export interface ConsentDeps {
  db: Db;
  jobs: JobQueue;
  logger: Logger;
  /** HEALTH_DATA_GRACE_DAYS (LEGAL-REVIEW). */
  healthDataGraceDays: number;
  now?: () => Date;
  /** Versões vigentes esperadas (padrão: o catálogo). Testes publicam versões novas por aqui. */
  catalog?: Partial<Record<PolicyDocument, DocumentVersion>>;
}

export interface PurposeState {
  purpose: AvailablePurpose;
  /** Vale para tratamento agora (não revogado e na versão substancial vigente). */
  active: boolean;
  /** Havia autorização numa versão anterior substancialmente diferente: precisa de nova escolha. */
  needsReconsent: boolean;
  grantedAt: Date | null;
  version: number | null;
}

export interface DocumentState {
  document: RequiredDocument;
  /** Última versão aceita (`kind = accepted`); a ciência de versão não substancial não entra aqui. */
  acceptedVersion: number | null;
  acceptedAt: Date | null;
  currentVersion: number;
  needsAcceptance: boolean;
  /**
   * Versão vigente não substancial ainda sem registro da pessoa (ADR-0031): aviso informativo único, que não
   * bloqueia o app. Some quando ela registra a ciência.
   */
  noticePending: boolean;
  /** Última ciência registrada acima do aceite (ADR-0031), para a Central de Privacidade mostrar a prova. */
  acknowledgedVersion: number | null;
  acknowledgedAt: Date | null;
}

/** Escolha do passo 5 do onboarding (§52.5, ADR-0021). `null` = ainda não escolheu. */
export type DataMode = 'demo' | 'own';

export interface ConsentState {
  onboardingCompleted: boolean;
  /** `demo`: telas com dados fictícios gerados em memória; nada gravado nas tabelas de saúde. */
  dataMode: DataMode | null;
  /** Há documento a aceitar ou finalidade a reconfirmar (LEG-C06). */
  updatePending: boolean;
  /** Documentos com versão nova não substancial a informar (aviso único, ADR-0031). */
  documentNotices: RequiredDocument[];
  purposes: PurposeState[];
  documents: DocumentState[];
  health: HealthConsentState;
}

export type OnboardingInput = {
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  purposes: readonly AvailablePurpose[];
};

export type UpdateInput = {
  acceptDocuments: readonly RequiredDocument[];
  decisions: Partial<Record<AvailablePurpose, 'keep' | 'decline'>>;
};

/** Agendamento da eliminação, feito depois do commit (o cancelamento roda dentro da transação). */
type Effect = { kind: 'schedule'; runAt: Date };

interface VersionRow {
  id: string;
  document: PolicyDocument;
  version: number;
  textHash: string;
  requiresReconsent: boolean;
}

export function createConsentService(deps: ConsentDeps) {
  const { db, jobs, logger } = deps;
  // O prazo está escrito no texto que a pessoa autoriza (hash): configuração diferente mudaria o que ela
  // leu sem nova versão (revisão M3).
  if (deps.healthDataGraceDays !== HEALTH_DATA_GRACE_DAYS_IN_TEXT) {
    throw new AppError(
      'VALIDATION',
      'HEALTH_DATA_GRACE_DAYS diverge do prazo escrito no texto do consentimento',
    );
  }
  const now = deps.now ?? (() => new Date());
  const catalog: Partial<Record<PolicyDocument, DocumentVersion>> =
    deps.catalog ?? CURRENT_VERSIONS;
  const withUser = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => withUserOn(db, userId, fn);

  async function publishedVersions(tx: Tx): Promise<VersionRow[]> {
    const rows = await tx.policyVersion.findMany({
      where: { publishedAt: { lte: now() }, document: { in: [...POLICY_DOCUMENTS] } },
      select: { id: true, document: true, version: true, textHash: true, requiresReconsent: true },
    });
    // O enum do banco ainda tem os valores revogados (ADR-0030); a CHECK impede linhas com eles.
    return rows.filter((row): row is VersionRow => isPolicyDocument(row.document));
  }

  /**
   * Versão vigente no banco, conferida com o catálogo: se o código exibisse outro texto, o consentimento
   * não provaria o que a pessoa leu. Divergência = erro de deploy, nada é gravado.
   */
  function currentVersion(rows: VersionRow[], document: PolicyDocument): VersionRow {
    const latest = rows
      .filter((r) => r.document === document)
      .reduce<VersionRow | undefined>((a, r) => (!a || r.version > a.version ? r : a), undefined);
    const expected = catalog[document];
    if (
      !latest ||
      !expected ||
      latest.version !== expected.version ||
      latest.textHash !== expected.textHash
    ) {
      throw new AppError('VALIDATION', `versão publicada diverge do catálogo: ${document}`);
    }
    return latest;
  }

  function substantialFloor(rows: VersionRow[], document: PolicyDocument): number {
    return rows
      .filter((r) => r.document === document && r.requiresReconsent)
      .reduce((max, r) => Math.max(max, r.version), 0);
  }

  async function grantIn(tx: Tx, userId: string, purpose: AvailablePurpose): Promise<Effect[]> {
    const rows = await publishedVersions(tx);
    const version = currentVersion(rows, purposeDocument(purpose));
    const active = await tx.consentRecord.findMany({
      where: { purpose, revokedAt: null },
      select: { id: true, policyVersionId: true },
    });
    const effects: Effect[] = [];
    if (!active.some((r) => r.policyVersionId === version.id)) {
      // Autorização numa versão anterior é substituída pela nova (não é revogação: não agenda nada).
      if (active.length > 0) {
        await tx.consentRecord.updateMany({
          where: { id: { in: active.map((r) => r.id) } },
          data: { revokedAt: now() },
        });
      }
      const record = await tx.consentRecord.create({
        data: {
          userId,
          purpose,
          policyVersionId: version.id,
          textHash: version.textHash,
          grantedAt: now(),
        },
        select: { id: true },
      });
      await auditAppend(tx, 'consent_granted', 'consent_record', record.id);
    }
    if (purpose === 'health_data') {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { healthDataPurgeAt: true },
      });
      if (user.healthDataPurgeAt) {
        await tx.user.update({ where: { id: userId }, data: { healthDataPurgeAt: null } });
        // Cancela o job da PRÓPRIA pessoa, na mesma transação (revisão M4). Com a fila em memória (dev),
        // o job antigo continua lá, mas a execução rechecha e não faz nada.
        await tx.$executeRaw`SELECT app.health_elimination_cancel()`;
        await auditAppend(tx, 'health_data_elimination_cancelled', 'health_data');
      }
    }
    return effects;
  }

  async function revokeIn(tx: Tx, userId: string, purpose: AvailablePurpose): Promise<Effect[]> {
    // Antes de revogar (depois o RLS já barraria): links de exportação vencem na hora (ADR-0032).
    if (purpose === 'health_data') await expireExportsIn(tx);
    const { count } = await tx.consentRecord.updateMany({
      where: { purpose, revokedAt: null },
      data: { revokedAt: now() },
    });
    if (count === 0) return [];
    await auditAppend(tx, 'consent_revoked', 'consent_record');
    if (purpose !== 'health_data') return [];
    const runAt = healthPurgeDate(now(), deps.healthDataGraceDays);
    await tx.user.update({ where: { id: userId }, data: { healthDataPurgeAt: runAt } });
    await auditAppend(tx, 'health_data_elimination_scheduled', 'health_data');
    return [{ kind: 'schedule', runAt }];
  }

  async function acceptDocumentsIn(tx: Tx, userId: string, documents: readonly RequiredDocument[]) {
    const rows = await publishedVersions(tx);
    for (const document of documents) {
      const version = currentVersion(rows, document);
      // Só um aceite conta: uma ciência da mesma versão não dispensa o aceite exigido (ADR-0031).
      const already = await tx.policyAcceptance.count({
        where: { policyVersionId: version.id, kind: 'accepted' },
      });
      if (already > 0) continue;
      await tx.policyAcceptance.create({
        data: { userId, policyVersionId: version.id, acceptedAt: now() },
      });
      await auditAppend(tx, 'policy_accepted', 'policy_version', version.id);
    }
  }

  /**
   * Agenda a eliminação depois do commit. Se falhar, o estado no banco continua certo: a eliminação vencida
   * é reencontrada pela varredura diária e o job sempre rechecaria o consentimento antes de apagar.
   */
  async function applyEffects(userId: string, effects: Effect[]) {
    for (const effect of effects) {
      try {
        await jobs.enqueue(
          HEALTH_ELIMINATION_JOB,
          { userId },
          { runAt: effect.runAt, singletonKey: healthEliminationKey(userId) },
        );
      } catch {
        // Sem userId nem finalidade (B5).
        logger.warn('consent.job_effect_failed');
      }
    }
  }

  async function getState(userId: string): Promise<ConsentState> {
    return withUser(userId, async (tx) => {
      const [user, rows, records, acceptances] = await Promise.all([
        tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { onboardingCompletedAt: true, healthDataPurgeAt: true, dataMode: true },
        }),
        publishedVersions(tx),
        tx.consentRecord.findMany({
          where: { revokedAt: null },
          select: { purpose: true, grantedAt: true, policyVersion: { select: { version: true } } },
        }),
        tx.policyAcceptance.findMany({
          select: {
            kind: true,
            acceptedAt: true,
            policyVersion: { select: { document: true, version: true } },
          },
        }),
      ]);

      const purposes = AVAILABLE_PURPOSES.map((purpose): PurposeState => {
        const record = records
          .filter((r) => r.purpose === purpose)
          .sort((a, b) => b.policyVersion.version - a.policyVersion.version)[0];
        const floor = substantialFloor(rows, purposeDocument(purpose));
        const version = record?.policyVersion.version ?? null;
        return {
          purpose,
          active: version !== null && version >= floor,
          needsReconsent: version !== null && version < floor,
          grantedAt: record?.grantedAt ?? null,
          version,
        };
      });

      const documents = REQUIRED_DOCUMENTS.map((document): DocumentState => {
        const ofDocument = acceptances
          .filter((a) => a.policyVersion.document === document)
          .sort((a, b) => b.policyVersion.version - a.policyVersion.version);
        const accepted = ofDocument.find((a) => a.kind === 'accepted');
        const floor = substantialFloor(rows, document);
        const acceptedVersion = accepted?.policyVersion.version ?? null;
        const currentVersion = rows
          .filter((r) => r.document === document)
          .reduce((max, r) => Math.max(max, r.version), 0);
        const needsAcceptance = acceptedVersion === null || acceptedVersion < floor;
        const seenVersion = ofDocument[0]?.policyVersion.version ?? 0;
        const acknowledged = ofDocument.find(
          (a) => a.kind === 'acknowledged' && a.policyVersion.version > (acceptedVersion ?? 0),
        );
        return {
          document,
          acceptedVersion,
          acceptedAt: accepted?.acceptedAt ?? null,
          currentVersion,
          needsAcceptance,
          noticePending: !needsAcceptance && seenVersion < currentVersion,
          acknowledgedVersion: acknowledged?.policyVersion.version ?? null,
          acknowledgedAt: acknowledged?.acceptedAt ?? null,
        };
      });

      const healthActive = purposes.find((p) => p.purpose === 'health_data')?.active === true;
      const health: HealthConsentState = healthActive
        ? { status: 'active' }
        : user.healthDataPurgeAt
          ? { status: 'revoked', purgeAt: user.healthDataPurgeAt }
          : { status: 'missing' };

      const onboardingCompleted = user.onboardingCompletedAt !== null;
      return {
        onboardingCompleted,
        dataMode: user.dataMode,
        updatePending:
          onboardingCompleted &&
          (documents.some((d) => d.needsAcceptance) || purposes.some((p) => p.needsReconsent)),
        documentNotices: onboardingCompleted
          ? documents.filter((d) => d.noticePending).map((d) => d.document)
          : [],
        purposes,
        documents,
        health,
      };
    });
  }

  return {
    getState,

    /**
     * Fim do onboarding (§52): Termos e Política obrigatórios; finalidades só as marcadas pela pessoa
     * (LEG-C02: nada pré-marcado; LEG-C05: recusar não bloqueia o app).
     */
    async completeOnboarding(
      userId: string,
      input: OnboardingInput,
    ): Promise<{ ok: true } | { ok: false; error: 'documents_required' }> {
      if (!input.acceptTerms || !input.acceptPrivacy) {
        return { ok: false, error: 'documents_required' };
      }
      const purposes = input.purposes.filter(isAvailablePurpose);
      const effects = await withUser(userId, async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { onboardingCompletedAt: true },
        });
        if (user.onboardingCompletedAt) return [];
        await acceptDocumentsIn(tx, userId, REQUIRED_DOCUMENTS);
        const out: Effect[] = [];
        for (const purpose of purposes) out.push(...(await grantIn(tx, userId, purpose)));
        await tx.user.update({ where: { id: userId }, data: { onboardingCompletedAt: now() } });
        await auditAppend(tx, 'onboarding_completed', 'user', userId);
        return out;
      });
      await applyEffects(userId, effects);
      logger.info('consent.onboarding_completed', { userId, count: purposes.length });
      return { ok: true };
    },

    /**
     * Passo 5 do onboarding (§52.5) e troca posterior "Começar com meus dados". Só depois do onboarding.
     * Não é dado de saúde nem consentimento: só a preferência de exibição.
     */
    async chooseDataMode(userId: string, mode: DataMode): Promise<boolean> {
      const { count } = await withUser(userId, (tx) =>
        tx.user.updateMany({
          where: { id: userId, onboardingCompletedAt: { not: null } },
          data: { dataMode: mode },
        }),
      );
      return count === 1;
    },

    /** Conceder (Central de Privacidade). Reconceder saúde dentro do prazo cancela a eliminação. */
    async grant(
      userId: string,
      purpose: string,
    ): Promise<{ ok: true } | { ok: false; error: 'unavailable' }> {
      if (!isAvailablePurpose(purpose)) return { ok: false, error: 'unavailable' };
      const effects = await withUser(userId, (tx) => grantIn(tx, userId, purpose));
      await applyEffects(userId, effects);
      // Sem a finalidade: o log não liga a conta a "autorizou/revogou dados de saúde" (B5).
      logger.info('consent.granted', { userId });
      return { ok: true };
    },

    /** Revogar (LEG-C04): vale para a próxima operação. Saúde: agenda a eliminação. */
    async revoke(
      userId: string,
      purpose: string,
    ): Promise<{ ok: true; purgeAt: Date | null } | { ok: false; error: 'unavailable' }> {
      if (!isAvailablePurpose(purpose)) return { ok: false, error: 'unavailable' };
      const effects = await withUser(userId, (tx) => revokeIn(tx, userId, purpose));
      await applyEffects(userId, effects);
      logger.info('consent.revoked', { userId });
      const scheduled = effects.find((e) => e.kind === 'schedule');
      return { ok: true, purgeAt: scheduled?.kind === 'schedule' ? scheduled.runAt : null };
    },

    /** Reconsentimento após versão substancial nova (LEG-C06): cada pendência exige uma escolha. */
    async resolveUpdate(
      userId: string,
      input: UpdateInput,
    ): Promise<{ ok: true } | { ok: false; error: 'documents_required' | 'decision_required' }> {
      const state = await getState(userId);
      const docs = state.documents.filter((d) => d.needsAcceptance).map((d) => d.document);
      const pending = state.purposes.filter((p) => p.needsReconsent).map((p) => p.purpose);
      if (docs.some((d) => !input.acceptDocuments.includes(d))) {
        return { ok: false, error: 'documents_required' };
      }
      if (pending.some((p) => !input.decisions[p]))
        return { ok: false, error: 'decision_required' };
      const effects = await withUser(userId, async (tx) => {
        await acceptDocumentsIn(tx, userId, docs);
        const out: Effect[] = [];
        for (const purpose of pending) {
          out.push(
            ...(input.decisions[purpose] === 'keep'
              ? await grantIn(tx, userId, purpose)
              : await revokeIn(tx, userId, purpose)),
          );
        }
        return out;
      });
      await applyEffects(userId, effects);
      logger.info('consent.update_resolved', { userId, count: pending.length + docs.length });
      return { ok: true };
    },

    /**
     * Ciência de versão não substancial (ADR-0031): registra, para os documentos com aviso pendente, a prova
     * `kind = acknowledged` da versão vigente e o AuditLog. Idempotente; documento sem aviso é ignorado. Só vale
     * para quem tem aceite em dia (versão >= a última substancial): nunca substitui um aceite exigido.
     */
    async acknowledgeDocuments(
      userId: string,
      documents: readonly RequiredDocument[],
    ): Promise<number> {
      const recorded = await withUser(userId, async (tx) => {
        const rows = await publishedVersions(tx);
        let count = 0;
        for (const document of REQUIRED_DOCUMENTS) {
          if (!documents.includes(document)) continue;
          const version = currentVersion(rows, document);
          if (version.requiresReconsent) continue;
          const seen = await tx.policyAcceptance.count({
            where: { policyVersion: { document, version: { gte: version.version } } },
          });
          const previous = await tx.policyAcceptance.count({
            where: {
              kind: 'accepted',
              policyVersion: {
                document,
                version: { gte: substantialFloor(rows, document), lt: version.version },
              },
            },
          });
          if (seen > 0 || previous === 0) continue;
          await tx.policyAcceptance.create({
            data: { userId, policyVersionId: version.id, kind: 'acknowledged', acceptedAt: now() },
          });
          await auditAppend(tx, 'policy_acknowledged', 'policy_version', version.id);
          count++;
        }
        return count;
      });
      logger.info('consent.policy_acknowledged', { userId, count: recorded });
      return recorded;
    },
  };
}

export type ConsentService = ReturnType<typeof createConsentService>;
