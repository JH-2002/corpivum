import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BackupFormatError,
  createBackupEncryptStream,
  parseBackupKey,
  readBackupFile,
  verifyBackupFile,
  type BackupManifest,
} from './container';

const MANIFEST: BackupManifest = {
  kind: 'database',
  version: 1,
  takenAt: '2026-10-16T12:00:00.000Z',
  database: 'healthmind_test',
  migrations: ['20261016180000_fase_7e_operacao'],
  counts: { users: 3, 'app.read_volume_samples': 0 },
};
const SECRET = 'conteudo-sintetico-que-nao-pode-aparecer-em-claro';

let dir: string;
let key: Buffer;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'hm-backup-'));
  key = randomBytes(32);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(body: Buffer, manifest: BackupManifest = MANIFEST): Promise<string> {
  const file = path.join(dir, 'backup.hmbk');
  await pipeline(
    Readable.from([body.subarray(0, 5), body.subarray(5)]),
    createBackupEncryptStream(key, manifest),
    createWriteStream(file),
  );
  return file;
}

describe('arquivo cifrado de backup (ADR-0040, LEG-S07)', () => {
  it('ida e volta: manifesto e conteúdo; nada em claro no arquivo', async () => {
    const body = Buffer.from(SECRET.repeat(1000));
    const file = await write(body);
    expect((await readFile(file)).includes(Buffer.from(SECRET))).toBe(false);
    expect((await readFile(file)).includes(Buffer.from('healthmind_test'))).toBe(false);
    expect(await verifyBackupFile(file, key)).toEqual(MANIFEST);
    const read = await readBackupFile(file, key);
    expect(read.manifest).toEqual(MANIFEST);
    expect(read.body.equals(body)).toBe(true);
  });

  it('conteúdo vazio também vale', async () => {
    const file = await write(Buffer.alloc(0));
    expect((await readBackupFile(file, key)).body.length).toBe(0);
  });

  it('chave errada é recusada', async () => {
    const file = await write(Buffer.from(SECRET));
    await expect(verifyBackupFile(file, randomBytes(32))).rejects.toBeInstanceOf(BackupFormatError);
  });

  it.each([0, 25, -20, -1])('um byte alterado (posição %i) é recusado', async (at) => {
    const file = await write(Buffer.from(SECRET.repeat(10)));
    const bytes = await readFile(file);
    const i = at < 0 ? bytes.length + at : at;
    bytes[i] = (bytes[i] ?? 0) ^ 1;
    await writeFile(file, bytes);
    await expect(verifyBackupFile(file, key)).rejects.toBeInstanceOf(BackupFormatError);
  });

  it('arquivo cortado é recusado', async () => {
    const file = await write(Buffer.from(SECRET.repeat(10)));
    const bytes = await readFile(file);
    await writeFile(file, bytes.subarray(0, bytes.length - 40));
    await expect(verifyBackupFile(file, key)).rejects.toBeInstanceOf(BackupFormatError);
  });

  it('manifesto fora do formato não é gravado', () => {
    expect(() =>
      createBackupEncryptStream(key, { ...MANIFEST, counts: { 'users; drop': 1 } }),
    ).toThrow();
  });

  it('chave precisa de 32 bytes', () => {
    expect(() => parseBackupKey(undefined)).toThrow(BackupFormatError);
    expect(() => parseBackupKey(randomBytes(16).toString('base64'))).toThrow(BackupFormatError);
    expect(parseBackupKey(key.toString('base64')).equals(key)).toBe(true);
  });
});
