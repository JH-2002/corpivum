'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { FormState } from '@/components/forms/form-state';
import { requireAppSession } from '@/modules/consent/server';
import { reportPeriodSchema } from '@/modules/reports';
import { MAX_PER_DAY, type ExportRequest } from '@/modules/reports/service';
import { getReportsService, processExportsSoon } from '@/modules/reports/server';
import { assertFullApp } from '@/lib/full-app';

/**
 * Pedidos de arquivo (LEG-D03, ADR-0032): relatório (PDF, CSV, JSON) e exportação completa (JSON, CSV).
 * Toda action revalida a sessão no banco. A exportação completa também é pedida na Central de Privacidade,
 * que fica acessível com atualização pendente (exportar nunca depende de aceitar algo antes).
 */
const requestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('full_export'), format: z.enum(['json', 'csv']) }),
  z.object({
    kind: z.literal('report'),
    format: z.enum(['pdf', 'csv', 'json']),
    period: reportPeriodSchema,
    reference: z.iso.date(),
    // `on` = ocultar peso, medidas e calorias (ADR-0032); `off` ou ausente = mostrar.
    hideBodyValues: z.enum(['on', 'off']).optional(),
  }),
]);

export async function requestExportAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const session = await requireAppSession({ allowPendingUpdate: true });
  // Atualização pendente só não bloqueia a exportação completa (portabilidade); o relatório segue a regra das
  // telas de saúde e leva à atualização (revisão N1).
  if (form.get('kind') !== 'full_export') await requireAppSession();
  const t = await getTranslations('reports.generate');
  const parsed = requestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: 'error', message: t('error') };
  const input: ExportRequest =
    parsed.data.kind === 'report'
      ? { ...parsed.data, hideBodyValues: parsed.data.hideBodyValues === 'on' }
      : parsed.data;
  const result = await getReportsService().request(session.userId, input);
  revalidatePath('/relatorios');
  revalidatePath('/privacidade');
  switch (result.status) {
    case 'queued':
      after(processExportsSoon);
      return { status: 'success', message: t('queued') };
    case 'busy':
      return { status: 'error', message: t('busy') };
    case 'limit':
      return { status: 'error', message: t('limit', { max: MAX_PER_DAY }) };
    case 'demo':
      return { status: 'error', message: t('demo') };
    case 'no_consent':
    case 'invalid':
      return { status: 'error', message: t('error') };
  }
}

const deleteSchema = z.object({ id: z.uuid() });

export async function deleteExportAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession({ allowPendingUpdate: true });
  const parsed = deleteSchema.safeParse({ id: form.get('id') });
  if (!parsed.success) return;
  await getReportsService().remove(session.userId, parsed.data.id);
  revalidatePath('/relatorios');
  revalidatePath('/privacidade');
}
