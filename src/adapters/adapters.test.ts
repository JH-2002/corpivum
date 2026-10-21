// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdapterError, NotEnabledError, NotFoundError } from '@/lib/errors';
import { createLogger, type LogRecord } from '@/lib/logger';
import { parseEnv } from '@/lib/env';
import { NoAgeSignalProvider } from './age-signal/none';
import { createAdapters } from './index';
import { MemoryJobQueue } from './jobs/memory';
import { LocalKmsProvider } from './kms/local';
import { ConsoleMailProvider } from './mail/console';
import { LocalStorageProvider } from './storage/local';
import { isValidStorageKey } from './storage/types';
import { DisabledWearableProvider } from './wearable/disabled';

const masterKey = Buffer.alloc(32, 1).toString('base64');

function captureLogger() {
  const records: LogRecord[] = [];
  return { records, logger: createLogger({ minLevel: 'debug', sink: (r) => records.push(r) }) };
}

describe('createAdapters', () => {
  it('monta todas as implementações locais a partir do env', () => {
    const env = parseEnv({
      APP_ENV: 'test',
      APP_REGION: 'gru1',
      DATABASE_URL: 'postgresql://app_user:x@localhost/db',
      WORKER_DATABASE_URL: 'postgresql://app_worker:x@localhost/db',
      KMS_LOCAL_MASTER_KEY: masterKey,
      APP_URL: 'http://localhost:3000',
      SESSION_SECRET: Buffer.alloc(32, 1).toString('base64'),
      RATE_LIMIT_SECRET: Buffer.alloc(32, 2).toString('base64'),
      RECOVERY_CODE_PEPPER: Buffer.alloc(32, 3).toString('base64'),
    });
    const adapters = createAdapters(env);
    expect(Object.fromEntries(Object.entries(adapters).map(([k, v]) => [k, v.id]))).toEqual({
      kms: 'local',
      storage: 'local',
      mail: 'console',
      jobs: 'memory',
      ageSignal: 'none',
      wearable: 'disabled',
      errorReporter: 'console',
    });
  });
});

describe('LocalKmsProvider', () => {
  const ctx = { userId: 'u1', table: 'sleep_entries', column: 'content' };

  it('cifra e decifra a chave de dados (envelope)', async () => {
    const kms = new LocalKmsProvider(masterKey);
    const dataKey = await kms.generateDataKey(ctx);
    expect(dataKey.plaintext).toHaveLength(32);
    expect(Buffer.from(dataKey.encrypted).includes(Buffer.from(dataKey.plaintext))).toBe(false);
    const decrypted = await kms.decryptDataKey(dataKey.encrypted, dataKey.keyId, ctx);
    expect(Buffer.from(decrypted).equals(Buffer.from(dataKey.plaintext))).toBe(true);
  });

  it('rejeita DEK adulterada ou chave mestra diferente', async () => {
    const kms = new LocalKmsProvider(masterKey);
    const { encrypted, keyId } = await kms.generateDataKey(ctx);
    const tampered = new Uint8Array(encrypted);
    tampered[tampered.length - 1]! ^= 0xff;
    await expect(kms.decryptDataKey(tampered, keyId, ctx)).rejects.toBeInstanceOf(AdapterError);

    const other = new LocalKmsProvider(Buffer.alloc(32, 2).toString('base64'));
    await expect(other.decryptDataKey(encrypted, keyId, ctx)).rejects.toBeInstanceOf(AdapterError);
    await expect(kms.decryptDataKey(encrypted, 'outra-chave', ctx)).rejects.toBeInstanceOf(
      AdapterError,
    );
  });

  it('falha com contexto diferente (impede trocar valor cifrado entre usuários)', async () => {
    const kms = new LocalKmsProvider(masterKey);
    const { encrypted, keyId } = await kms.generateDataKey(ctx);
    await expect(
      kms.decryptDataKey(encrypted, keyId, { ...ctx, userId: 'u2' }),
    ).rejects.toBeInstanceOf(AdapterError);
    // A ordem das chaves do contexto não importa.
    const reordered = { column: 'content', userId: 'u1', table: 'sleep_entries' };
    await expect(kms.decryptDataKey(encrypted, keyId, reordered)).resolves.toHaveLength(32);
  });

  it('recusa chave mestra com tamanho inválido', () => {
    expect(() => new LocalKmsProvider('Y3VydGE=')).toThrow(AdapterError);
  });
});

describe('LocalStorageProvider', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'hm-storage-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('grava, lê, verifica e apaga objetos', async () => {
    const storage = new LocalStorageProvider(dir);
    const body = new TextEncoder().encode('{"demo":true}');
    await storage.put('exports/u1/arquivo.json', body, { contentType: 'application/json' });
    expect(await storage.exists('exports/u1/arquivo.json')).toBe(true);
    const { body: read, info } = await storage.get('exports/u1/arquivo.json');
    expect(new TextDecoder().decode(read)).toBe('{"demo":true}');
    expect(info).toEqual({
      key: 'exports/u1/arquivo.json',
      size: body.byteLength,
      contentType: 'application/json',
    });
    await storage.delete('exports/u1/arquivo.json');
    expect(await storage.exists('exports/u1/arquivo.json')).toBe(false);
    await expect(storage.get('exports/u1/arquivo.json')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lista as chaves sob o prefixo, sem os metadados, em ordem e até o limite (OI-35)', async () => {
    const storage = new LocalStorageProvider(dir);
    const opts = { contentType: 'application/octet-stream' };
    await storage.put('exports/u2/b.bin', new Uint8Array([1]), opts);
    await storage.put('exports/u1/a.bin', new Uint8Array([1]), opts);
    await storage.put('outro/c.bin', new Uint8Array([1]), opts);
    expect(await storage.list('exports', 10)).toEqual(['exports/u1/a.bin', 'exports/u2/b.bin']);
    expect(await storage.list('exports', 1)).toEqual(['exports/u1/a.bin']);
    expect(await storage.list('exports', 10, 'exports/u1/a.bin')).toEqual(['exports/u2/b.bin']);
    expect(await storage.list('vazio', 10)).toEqual([]);
  });

  it.each(['../fora', '/absoluto', 'a/../../b', 'a//b', '', 'C:\\x'])(
    'recusa chave insegura %j',
    async (key) => {
      expect(isValidStorageKey(key)).toBe(false);
      await expect(new LocalStorageProvider(dir).exists(key)).rejects.toBeInstanceOf(AdapterError);
    },
  );
});

describe('ConsoleMailProvider', () => {
  it('guarda a mensagem e loga só template e destinatário mascarado', async () => {
    const { records, logger } = captureLogger();
    const mail = new ConsoleMailProvider({ logger, keepOutbox: true });
    await mail.send({
      to: 'pessoa@example.com',
      template: 'email-verification',
      params: { url: 'https://local/verificar?token=segredo' },
    });
    expect(mail.outbox).toHaveLength(1);
    const logged = JSON.stringify(records);
    expect(logged).toContain('email-verification');
    expect(logged).not.toContain('pessoa@example.com');
    expect(logged).not.toContain('segredo');
  });

  it('não guarda mensagens (nem tokens) fora de teste', async () => {
    const mail = new ConsoleMailProvider({ logger: captureLogger().logger });
    await mail.send({ to: 'a@b.test', template: 'password-reset', params: { url: 'x' } });
    expect(mail.outbox).toHaveLength(0);
  });
});

describe('MemoryJobQueue', () => {
  it('executa jobs vencidos e respeita agendamento', async () => {
    const queue = new MemoryJobQueue(captureLogger().logger);
    const seen: string[] = [];
    queue.register('reminder.send', async (payload) => {
      seen.push(String(payload.reminderId));
    });
    const now = new Date('2026-01-01T12:00:00Z');
    await queue.enqueue('reminder.send', { reminderId: 'r1' }, { runAt: now });
    await queue.enqueue(
      'reminder.send',
      { reminderId: 'r2' },
      { runAt: new Date('2026-01-02T12:00:00Z') },
    );
    expect(await queue.drain(now)).toBe(1);
    expect(seen).toEqual(['r1']);
  });

  it('drain chamado durante outro: sem execução dupla, mas o job novo roda na mesma rodada', async () => {
    const queue = new MemoryJobQueue(captureLogger().logger);
    const seen: string[] = [];
    let concurrent: Promise<number> | undefined;
    queue.register('slow', async () => {
      seen.push('slow');
      await queue.enqueue('fast', {});
      concurrent = queue.drain();
    });
    queue.register('fast', async () => {
      seen.push('fast');
    });
    await queue.enqueue('slow', {});
    expect(await queue.drain()).toBe(2);
    expect(await concurrent).toBe(0);
    expect(seen).toEqual(['slow', 'fast']);
  });

  it('marca como falho após o limite de tentativas, logando só metadados', async () => {
    const { records, logger } = captureLogger();
    const queue = new MemoryJobQueue(logger);
    queue.register('export.build', async () => {
      throw new Error('conteúdo que não deve ir para o log');
    });
    const id = await queue.enqueue('export.build', { exportId: 'e1' }, { maxAttempts: 2 });
    await queue.drain();
    expect(queue.statusOf(id)).toBe('pending');
    await queue.drain();
    expect(queue.statusOf(id)).toBe('failed');
    expect(records).toHaveLength(2);
    expect(JSON.stringify(records)).not.toContain('conteúdo que não deve');
  });
});

describe('NoAgeSignalProvider', () => {
  it('retorna unknown', async () => {
    expect(await new NoAgeSignalProvider().getAgeSignal()).toEqual({ status: 'unknown' });
  });
});

describe('DisabledWearableProvider', () => {
  it('está desativado e recusa leitura (LEG-X04)', async () => {
    const wearable = new DisabledWearableProvider();
    expect(wearable.enabled).toBe(false);
    await expect(wearable.fetchSamples()).rejects.toBeInstanceOf(NotEnabledError);
  });
});
