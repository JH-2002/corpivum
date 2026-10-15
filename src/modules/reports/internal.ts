/**
 * Valores só internos (LEG-M06, ADR-0032): calculados para regras (guardrails, calibração do twin), NUNCA
 * exibidos nem exportados. Os serializadores trabalham com listas de colunas permitidas; esta lista é a
 * rede de segurança conferida nos testes (nenhum nome daqui aparece em JSON, CSV, PDF ou tela).
 */
export const INTERNAL_ONLY_VALUES = ['bmi', 'imc', 'waistHipRatio', 'waist_hip', 'whr'] as const;

const PATTERN = new RegExp(`\\b(${INTERNAL_ONLY_VALUES.join('|')})\\b`, 'i');

/** Algum nome de valor só interno no texto? (cabeçalhos, chaves de JSON, texto do PDF). */
export function mentionsInternalValue(text: string): boolean {
  return PATTERN.test(text);
}
