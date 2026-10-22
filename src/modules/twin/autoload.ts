/**
 * Sinais do aparelho que o navegador expõe (Network Information e Device Memory). Todos opcionais: o iOS
 * Safari, por exemplo, não expõe `connection` nem `deviceMemory`.
 */
export interface DeviceSignals {
  saveData?: boolean;
  effectiveType?: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

const SLOW_NETWORKS = new Set(['slow-2g', '2g', '3g']);

/**
 * Celular: o 3D do início carrega sozinho quando o aparelho permite (ADR-0049). Não carrega com economia de
 * dados, rede lenta, menos de 4 GB de memória ou menos de 4 núcleos. Sinal ausente conta como "permite"; a
 * pessoa pode trocar para o 2D a qualquer momento e o "Ver em 3D" fica para quando não carrega sozinho.
 */
export function canAutoload3D(signals: DeviceSignals): boolean {
  if (signals.saveData === true) return false;
  if (signals.effectiveType !== undefined && SLOW_NETWORKS.has(signals.effectiveType)) return false;
  if (signals.deviceMemory !== undefined && signals.deviceMemory < 4) return false;
  if (signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency < 4) return false;
  return true;
}
