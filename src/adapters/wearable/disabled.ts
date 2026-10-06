import { NotEnabledError } from '@/lib/errors';
import type { WearableProvider, WearableSample } from './types';

/** Placeholder até haver finalidade, consentimento e RIPD revisado (LEG-X04). */
export class DisabledWearableProvider implements WearableProvider {
  readonly id = 'disabled';
  readonly enabled = false;

  async fetchSamples(): Promise<WearableSample[]> {
    throw new NotEnabledError('wearables (LEG-X04)');
  }
}
