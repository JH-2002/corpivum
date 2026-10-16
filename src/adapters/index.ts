import { getEnv, type Env } from '@/lib/env';
import { createAgeSignalProvider, type AgeSignalProvider } from './age-signal';
import { createErrorReporter, type ErrorReporter } from './error-reporter';
import { createJobQueue, type JobQueue } from './jobs';
import { createKmsProvider, type KmsProvider } from './kms';
import { createMailProvider, type MailProvider } from './mail';
import { createStorageProvider, type StorageProvider } from './storage';
import { createWearableProvider, type WearableProvider } from './wearable';

/**
 * Adaptadores trocáveis (§37). A implementação é escolhida pelo ambiente; em produção,
 * implementações fake/locais são recusadas por `parseEnv`. Somente servidor.
 */
export interface Adapters {
  kms: KmsProvider;
  storage: StorageProvider;
  mail: MailProvider;
  jobs: JobQueue;
  ageSignal: AgeSignalProvider;
  wearable: WearableProvider;
  errorReporter: ErrorReporter;
}

export function createAdapters(env: Env): Adapters {
  return {
    kms: createKmsProvider(env),
    storage: createStorageProvider(env),
    mail: createMailProvider(env),
    jobs: createJobQueue(env),
    ageSignal: createAgeSignalProvider(env),
    wearable: createWearableProvider(env),
    errorReporter: createErrorReporter(env),
  };
}

let cached: Adapters | undefined;

export function getAdapters(): Adapters {
  cached ??= createAdapters(getEnv());
  return cached;
}
