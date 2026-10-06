/**
 * Integrações com wearables e plataformas de saúde (fora do MVP, §4/§50).
 * Ativar exige nova finalidade, novo consentimento e revisão do RIPD (LEG-X04).
 * Dados vindos daqui recebem o selo MEDIDO (§39).
 */
export type WearableMetric = 'sleep' | 'steps' | 'heart_rate' | 'activity';

export interface WearableSample {
  metric: WearableMetric;
  start: Date;
  end: Date;
  value: number;
  unit: string;
}

export interface WearableProvider {
  readonly id: string;
  readonly enabled: boolean;
  fetchSamples(userId: string, range: { from: Date; to: Date }): Promise<WearableSample[]>;
}
