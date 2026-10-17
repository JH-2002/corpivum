import { describe, expect, it } from 'vitest';
import { exportKey, parseExportKey } from './storage';

const U = '0190a7c4-1234-7abc-8def-0123456789ab';
const J = '0190a7c4-5678-7abc-8def-0123456789cd';

describe('parseExportKey (OI-35)', () => {
  it('decompõe a chave gerada por exportKey', () => {
    expect(parseExportKey(exportKey(U, J))).toEqual({ userId: U, jobId: J });
  });

  it.each([
    `exports/${U}/${J}xbin`,
    `exports/${U}/${J}.bin.meta.json`,
    `exports/${U}/outro.bin`,
    `exports/${J}.bin`,
    `outro/${U}/${J}.bin`,
    `exports/${U}/${J}.bin/x`,
  ])('recusa %s', (key) => {
    expect(parseExportKey(key)).toBeNull();
  });
});
