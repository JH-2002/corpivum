'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { REQUIRED_DOCUMENTS } from '@/modules/consent';
import { getConsentService, requireAppSession } from '@/modules/consent/server';

const acknowledgeSchema = z.object({
  documents: z.array(z.enum(REQUIRED_DOCUMENTS)).min(1).max(REQUIRED_DOCUMENTS.length),
});

/**
 * "Entendi" do aviso de versão nova não substancial (ADR-0031): registra a ciência (prova + AuditLog) e o aviso
 * some. Funciona também com reconsentimento pendente, como o resto do shell.
 */
export async function acknowledgePolicyNoticeAction(form: FormData): Promise<void> {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const parsed = acknowledgeSchema.safeParse({ documents: form.getAll('document') });
  if (!parsed.success) return;
  await getConsentService().acknowledgeDocuments(session.userId, parsed.data.documents);
  revalidatePath('/', 'layout');
}
