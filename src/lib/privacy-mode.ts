/**
 * Modo privacidade global (§44/§45 + adendo, ADR-0035, LEG-M06): oculta peso, medidas, altura e calorias em
 * todas as telas. Vive num cookie de sessão sem identificador, lido pelo SERVIDOR, que omite os valores do
 * HTML (não basta escondê-los no navegador). Datas e quantidade de registros continuam visíveis (PR3-B3).
 */
export const PRIVACY_MODE_COOKIE = '__Host-hm_privacy';

export type PrivacyModeValue = 'on' | 'off';

/** Só `on` liga; qualquer outro valor (ausente, adulterado) é `off`. */
export function parsePrivacyMode(raw: string | undefined): boolean {
  return raw === 'on';
}
