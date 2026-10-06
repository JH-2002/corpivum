import { getEnv, type Env } from '@/lib/env';
import { createAgeSignalProvider, type AgeSignalProvider } from './age-signal';
import { createJobQueue, type JobQueue } from './jobs';
import { createKmsProvider, type KmsProvider } from './kms';
import { createLlmProvider, type LlmProvider } from './llm';
import { createMailProvider, type MailProvider } from './mail';
import { createStorageProvider, type StorageProvider } from './storage';
import { createWearableProvider, type WearableProvider } from './wearable';

/**
 * Adaptadores trocáveis (§37). A implementação é escolhida pelo ambiente; em produção,
 * implementações fake/locais são recusadas por `parseEnv`. Somente servidor.
 */
export interface Adapters {
  llm: LlmProvider;
  kms: KmsProvider;
  storage: StorageProvider;
  mail: MailProvider;
  jobs: JobQueue;
  ageSignal: AgeSignalProvider;
  wearable: WearableProvider;
}

export function createAdapters(env: Env): Adapters {
  return {
    llm: createLlmProvider(env),
    kms: createKmsProvider(env),
    storage: createStorageProvider(env),
    mail: createMailProvider(env),
    jobs: createJobQueue(env),
    ageSignal: createAgeSignalProvider(env),
    wearable: createWearableProvider(env),
  };
}

let cached: Adapters | undefined;

export function getAdapters(): Adapters {
  cached ??= createAdapters(getEnv());
  return cached;
}
