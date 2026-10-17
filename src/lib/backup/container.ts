import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Transform, Writable, type Readable, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';

/**
 * Arquivo cifrado de backup e de livro de reaplicação (ADR-0040; LEG-S07). Formato:
 * `MAGIC (8) | IV (12) | AES-256-GCM( u32 tamanho do manifesto | manifesto JSON | conteúdo ) | TAG (16)`, com o
 * MAGIC como dado autenticado. O conteúdo (o `pg_dump` ou o livro) só existe em claro dentro do pipe: nunca é
 * gravado sem cifra. Na leitura, a etiqueta é conferida numa passada inteira ANTES de qualquer byte decifrado ser
 * usado (`verifyBackupFile`), e de novo na passada que restaura.
 */
export const BACKUP_MAGIC = Buffer.from('HM360BK\x01', 'latin1');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = BACKUP_MAGIC.length + IV_BYTES;
const MAX_MANIFEST_BYTES = 1024 * 1024;

const tableCounts = z.record(
  z.string().regex(/^[a-z_][a-z0-9_.]{0,126}$/),
  z.number().int().min(0),
);

/** Só metadados técnicos: nomes de tabela, contagens e migrações. Nunca conteúdo de linha. */
export const backupManifestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('database'),
    version: z.literal(1),
    /** Instante do snapshot (relógio do banco): o ponto restaurado. */
    takenAt: z.iso.datetime({ offset: true }),
    database: z.string().regex(/^[a-z0-9_]{1,63}$/),
    migrations: z.array(z.string().regex(/^[0-9]{14}_[a-z0-9_]+$/)),
    counts: tableCounts,
  }),
  z.object({
    kind: z.literal('ledger'),
    version: z.literal(1),
    /** Instante da leitura do livro na origem. */
    takenAt: z.iso.datetime({ offset: true }),
    database: z.string().regex(/^[a-z0-9_]{1,63}$/),
  }),
]);
export type BackupManifest = z.infer<typeof backupManifestSchema>;

export class BackupFormatError extends Error {
  override name = 'BackupFormatError';
}

/** Chave de 32 bytes em base64 (`BACKUP_ENCRYPTION_KEY`). */
export function parseBackupKey(value: string | undefined): Buffer {
  const key = Buffer.from(value ?? '', 'base64');
  if (key.length !== 32) {
    throw new BackupFormatError('BACKUP_ENCRYPTION_KEY precisa ter 32 bytes em base64');
  }
  return key;
}

/** Transform que cifra o conteúdo que passa, com o manifesto à frente. */
export function createBackupEncryptStream(key: Buffer, manifest: BackupManifest): Transform {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(BACKUP_MAGIC);
  const json = Buffer.from(JSON.stringify(backupManifestSchema.parse(manifest)), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  let started = false;
  const start = (stream: Transform) => {
    if (started) return;
    started = true;
    stream.push(Buffer.concat([BACKUP_MAGIC, iv, cipher.update(length), cipher.update(json)]));
  };
  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      start(this);
      callback(null, cipher.update(chunk));
    },
    flush(callback: TransformCallback) {
      start(this);
      this.push(cipher.final());
      callback(null, cipher.getAuthTag());
    },
  });
}

/** Separa o manifesto (prefixo decifrado) do conteúdo. */
class ManifestSplitter extends Transform {
  #buffer = Buffer.alloc(0);
  #manifest: BackupManifest | undefined;

  get manifest(): BackupManifest | undefined {
    return this.#manifest;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    if (this.#manifest) return callback(null, chunk);
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    if (this.#buffer.length < 4) return callback();
    const size = this.#buffer.readUInt32BE(0);
    if (size > MAX_MANIFEST_BYTES) return callback(new BackupFormatError('manifesto inválido'));
    if (this.#buffer.length < 4 + size) return callback();
    try {
      const raw: unknown = JSON.parse(this.#buffer.subarray(4, 4 + size).toString('utf8'));
      this.#manifest = backupManifestSchema.parse(raw);
    } catch {
      return callback(new BackupFormatError('manifesto inválido'));
    }
    const rest = this.#buffer.subarray(4 + size);
    this.#buffer = Buffer.alloc(0);
    callback(null, rest.length > 0 ? rest : undefined);
  }

  override _flush(callback: TransformCallback) {
    callback(this.#manifest ? null : new BackupFormatError('manifesto ausente'));
  }
}

async function readEnvelope(file: string): Promise<{ iv: Buffer; tag: Buffer; size: number }> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    if (size < HEADER_BYTES + TAG_BYTES) throw new BackupFormatError('arquivo curto demais');
    const header = Buffer.alloc(HEADER_BYTES);
    await handle.read(header, 0, HEADER_BYTES, 0);
    if (!header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
      throw new BackupFormatError('não é um arquivo de backup do HealthMind 360');
    }
    const tag = Buffer.alloc(TAG_BYTES);
    await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
    return { iv: header.subarray(BACKUP_MAGIC.length), tag, size };
  } finally {
    await handle.close();
  }
}

/**
 * Decifra o arquivo e entrega o conteúdo a `sink`. A etiqueta GCM só é conferida no fim: quem consome precisa
 * tratar o conteúdo como não confiável até a promessa resolver (por isso `verifyBackupFile` vem antes).
 */
export async function decryptBackupFile(
  file: string,
  key: Buffer,
  sink: (manifest: () => BackupManifest | undefined) => NodeJS.WritableStream,
): Promise<BackupManifest> {
  const { iv, tag, size } = await readEnvelope(file);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(BACKUP_MAGIC);
  decipher.setAuthTag(tag);
  const splitter = new ManifestSplitter();
  const source: Readable = createReadStream(file, {
    start: HEADER_BYTES,
    end: size - TAG_BYTES - 1,
  });
  try {
    await pipeline(
      source,
      decipher,
      splitter,
      sink(() => splitter.manifest),
    );
  } catch (error) {
    if (error instanceof BackupFormatError) throw error;
    // Etiqueta errada (chave errada ou arquivo alterado) e erros do destino chegam aqui sem mensagem do conteúdo.
    throw new BackupFormatError(
      error instanceof Error && /auth/i.test(error.message)
        ? 'arquivo alterado ou chave errada'
        : 'falha ao ler o arquivo',
    );
  }
  const manifest = splitter.manifest;
  if (!manifest) throw new BackupFormatError('manifesto ausente');
  return manifest;
}

/** Passada inteira só para conferir a etiqueta; o conteúdo decifrado é descartado. */
export async function verifyBackupFile(file: string, key: Buffer): Promise<BackupManifest> {
  return decryptBackupFile(
    file,
    key,
    () =>
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      }),
  );
}

/** Lê o conteúdo inteiro para a memória (livro de reaplicação, pequeno), depois de conferir a etiqueta. */
export async function readBackupFile(
  file: string,
  key: Buffer,
): Promise<{ manifest: BackupManifest; body: Buffer }> {
  const chunks: Buffer[] = [];
  const manifest = await decryptBackupFile(
    file,
    key,
    () =>
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      }),
  );
  return { manifest, body: Buffer.concat(chunks) };
}
