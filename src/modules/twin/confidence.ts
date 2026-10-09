import type { BrainTheme } from './regions';

/**
 * Nível de confiança do painel do cérebro 3D (§17). Mede só a SUFICIÊNCIA dos registros da pessoa nos
 * temas ligados à região (quantos dias têm registro no período), nunca o estado da região (LEG-M05).
 * Mudar um limiar muda o texto exibido: atualize os testes.
 */
export const TWIN_RULES = Object.freeze({
  /** Abaixo disso, a confiança é baixa (mesmo mínimo da camada explicativa). */
  minDays: 3,
  /** Dias com registro para confiança alta... */
  highDays: 7,
  /** ...cobrindo pelo menos esta fração do período. */
  highCoverage: 0.5,
});

export type Confidence = 'none' | 'low' | 'medium' | 'high';

/**
 * `none`: região sem tema registrado no app (o painel é só educativo). Senão, pelo tema MENOS coberto:
 * a confiança nunca é maior que a do dado mais escasso.
 */
export function brainConfidence(
  themes: readonly BrainTheme[],
  daysByTheme: Readonly<Record<BrainTheme, number>>,
  periodDays: number,
): Confidence {
  if (themes.length === 0) return 'none';
  const days = Math.min(...themes.map((t) => daysByTheme[t]));
  if (days < TWIN_RULES.minDays) return 'low';
  if (days >= TWIN_RULES.highDays && days / Math.max(1, periodDays) >= TWIN_RULES.highCoverage) {
    return 'high';
  }
  return 'medium';
}
