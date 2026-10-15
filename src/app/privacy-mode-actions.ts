'use server';

import { z } from 'zod';
import { leavePresentationState } from '@/lib/presentation-server';
import { writePrivacyMode } from '@/lib/privacy-mode-server';

const inputSchema = z.object({ on: z.boolean(), scope: z.enum(['shell', 'presentation']) });

/**
 * Liga ou desliga o modo privacidade (ADR-0035). Pública de propósito, como o período: também vale no demo
 * sem login (LEG-X02) e só guarda uma preferência de interface, sem identificador e sem dado de saúde.
 * Mudar fora da apresentação (`shell`) encerra qualquer apresentação deixada aberta (saída pelo voltar do
 * navegador): a próxima entrada volta a ligar o modo e a guardar a escolha atual (revisão M1).
 */
export async function setPrivacyModeAction(on: unknown, scope: unknown = 'shell'): Promise<void> {
  const parsed = inputSchema.safeParse({ on, scope });
  if (!parsed.success) return;
  await writePrivacyMode(parsed.data.on);
  if (parsed.data.scope === 'shell') await leavePresentationState();
}
