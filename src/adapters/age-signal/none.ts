import type { AgeSignal, AgeSignalProvider } from './types';

/** Nenhuma fonte de sinal de idade disponível na web: sempre `unknown`. */
export class NoAgeSignalProvider implements AgeSignalProvider {
  readonly id = 'none';

  async getAgeSignal(): Promise<AgeSignal> {
    return { status: 'unknown' };
  }
}
