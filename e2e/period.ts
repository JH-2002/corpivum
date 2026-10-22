import { expect, type Page } from '@playwright/test';

/** Rótulos visíveis das opções do seletor de período (§10). */
export type PeriodLabel = '7 dias' | '30 dias' | '90 dias' | '12 meses' | 'Personalizado';

/**
 * Escolhe uma opção do seletor de período (botões segmentados, 9b). Abaixo de 640px as opções ficam num menu:
 * abre o menu antes.
 */
export async function choosePeriod(page: Page, label: PeriodLabel): Promise<void> {
  const toggle = page.getByRole('button', { name: /^Período: .+\. Trocar período$/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('radiogroup', { name: 'Período' }).getByText(label, { exact: true }).click();
}

export async function expectPeriod(page: Page, label: PeriodLabel): Promise<void> {
  await expect(page.getByRole('radio', { name: label })).toBeChecked();
}
