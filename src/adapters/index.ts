import { getEnv, type Env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createJobErrorSink } from '@/lib/observability/error-report';
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
  const errorReporter = createErrorReporter(env);
  return {
    kms: createKmsProvider(env),
    storage: createStorageProvider(env),
    mail: createMailProvider(env),
    // Erros de job pelo mesmo ErrorReporter e a mesma lista de campos do onRequestError (7c-R3).
    jobs: createJobQueue(env, { onError: createJobErrorSink(() => errorReporter, logger) }),
    ageSignal: createAgeSignalProvider(env),
    wearable: createWearableProvider(env),
    errorReporter,
  };
}

let cached: Adapters | undefined;

export function getAdapters(): Adapters {
  cached ??= createAdapters(getEnv());
  return cached;
}
