/**
 * Sinal de idade vindo de lojas de aplicativos ou do sistema operacional (LEG-F03).
 * Complementa a data de nascimento declarada no cadastro; não a substitui (LEG-F01).
 */
export type AgeSignal =
  { status: 'unknown' } | { status: 'adult'; source: string } | { status: 'minor'; source: string };

export interface AgeSignalProvider {
  readonly id: string;
  /** `requestHeaders` permite ler sinais enviados pela plataforma, sem identificar a pessoa. */
  getAgeSignal(requestHeaders: Headers): Promise<AgeSignal>;
}
