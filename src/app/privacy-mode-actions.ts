'use server';

import { writePrivacyMode } from '@/lib/privacy-mode-server';

/**
 * Liga ou desliga o modo privacidade (ADR-0035). Pública de propósito, como o período: também vale no demo
 * sem login (LEG-X02) e só guarda uma preferência de interface, sem identificador e sem dado de saúde.
 */
export async function setPrivacyModeAction(on: boolean): Promise<void> {
  if (typeof on !== 'boolean') return;
  await writePrivacyMode(on);
}
