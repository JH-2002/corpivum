/**
 * ZIP mínimo, sem compressão (método 0, "stored"), para juntar os CSVs da exportação (ADR-0032). Escrito
 * aqui para não trazer dependência (ADR-0009). Nomes em UTF-8 (bit 11), sem pastas e sem ZIP64: cada
 * arquivo e o total precisam caber em 4 GiB, muito acima de uma exportação pessoal.
 */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Data e hora no formato MS-DOS (resolução de 2 s), em UTC. */
function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

const MAX_U32 = 0xffffffff;
const SAFE_NAME = /^[\w.-]+$/;

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((acc, p) => acc + p.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

export function buildZip(entries: readonly ZipEntry[], modified: Date): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime(modified);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (!SAFE_NAME.test(entry.name)) throw new Error('nome inválido no zip');
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.byteLength;
    if (size > MAX_U32 || offset > MAX_U32) throw new Error('zip grande demais');

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão necessária
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.byteLength, true);
    locals.push(new Uint8Array(local.buffer), name, entry.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(12, time, true);
    central.setUint16(14, day, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.byteLength, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.byteLength + size;
  }

  const centralSize = centrals.reduce((acc, part) => acc + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return concat([...locals, ...centrals, new Uint8Array(end.buffer)]);
}

/** Lê os arquivos de um ZIP "stored" (testes e conferência). Confere assinatura e CRC. */
export function readZip(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();
  const out: ZipEntry[] = [];
  let at = 0;
  while (at + 30 <= zip.byteLength && view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extraLen = view.getUint16(at + 28, true);
    const name = decoder.decode(zip.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extraLen;
    const data = zip.slice(start, start + size);
    if (crc32(data) !== crc) throw new Error(`CRC inválido em ${name}`);
    out.push({ name, data });
    at = start + size;
  }
  return out;
}
