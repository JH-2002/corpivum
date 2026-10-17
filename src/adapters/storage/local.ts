import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AdapterError, NotFoundError } from '@/lib/errors';
import { isValidStorageKey, type StorageProvider, type StoredObjectInfo } from './types';

/** Storage em disco para DESENVOLVIMENTO, em pasta ignorada pelo git. Não serve arquivos via HTTP. */
export class LocalStorageProvider implements StorageProvider {
  readonly id = 'local';
  readonly #root: string;

  constructor(rootDir: string) {
    this.#root = path.resolve(rootDir);
  }

  #paths(key: string) {
    if (!isValidStorageKey(key)) throw new AdapterError('storage.local', 'invalid_key');
    const file = path.resolve(this.#root, key);
    if (!file.startsWith(this.#root + path.sep)) {
      throw new AdapterError('storage.local', 'invalid_key');
    }
    return { file, meta: `${file}.meta.json` };
  }

  async put(
    key: string,
    body: Uint8Array,
    options: { contentType: string },
  ): Promise<StoredObjectInfo> {
    const { file, meta } = this.#paths(key);
    const info: StoredObjectInfo = { key, size: body.byteLength, contentType: options.contentType };
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(meta, JSON.stringify(info));
    return info;
  }

  async get(key: string): Promise<{ body: Uint8Array; info: StoredObjectInfo }> {
    const { file, meta } = this.#paths(key);
    try {
      const [body, rawInfo] = await Promise.all([readFile(file), readFile(meta, 'utf8')]);
      return { body: new Uint8Array(body), info: JSON.parse(rawInfo) as StoredObjectInfo };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError('storage object');
      }
      throw new AdapterError('storage.local', 'get', { cause });
    }
  }

  async delete(key: string): Promise<void> {
    const { file, meta } = this.#paths(key);
    await Promise.all([rm(file, { force: true }), rm(meta, { force: true })]);
  }

  async deletePrefix(prefix: string): Promise<void> {
    const { file } = this.#paths(prefix);
    await rm(file, { recursive: true, force: true });
  }

  async list(prefix: string, limit: number, startAfter?: string): Promise<string[]> {
    const { file } = this.#paths(prefix);
    let entries: string[];
    try {
      entries = await readdir(file, { recursive: true });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new AdapterError('storage.local', 'list', { cause });
    }
    const keys: string[] = [];
    for (const entry of entries) {
      const key = `${prefix}/${entry.split(path.sep).join('/')}`;
      if (key.endsWith('.meta.json') || !isValidStorageKey(key)) continue;
      if (
        await stat(path.join(file, entry)).then(
          (s) => s.isFile(),
          () => false,
        )
      )
        keys.push(key);
    }
    return keys
      .sort()
      .filter((k) => startAfter === undefined || k > startAfter)
      .slice(0, limit);
  }

  async exists(key: string): Promise<boolean> {
    const { file } = this.#paths(key);
    return stat(file).then(
      () => true,
      () => false,
    );
  }
}
