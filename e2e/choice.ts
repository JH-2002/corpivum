import { type Locator, type Page } from '@playwright/test';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Botão do seletor no estilo do app (`ChoiceMenu`, 9d0): o nome é "<rótulo>: <opção atual>". */
export function choiceButton(page: Page | Locator, label: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${escape(label)}: `) });
}

/** Escolhe uma opção pelo valor enviado no formulário (o que antes era `selectOption` no `<select>`). */
export async function chooseOption(page: Page | Locator, label: string, value: string) {
  await choiceButton(page, label).click();
  await page
    .getByRole('radiogroup', { name: label, exact: true })
    .locator('label', { has: page.locator(`input[value="${value}"]`) })
    .click();
}
