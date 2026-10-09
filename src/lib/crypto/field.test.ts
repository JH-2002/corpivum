// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { LocalKmsProvider } from '@/adapters/kms/local';
import { decryptField, encryptField, type FieldContext } from './field';

const kms = new LocalKmsProvider(randomBytes(32).toString('base64'));
const ctx: FieldContext = { userId: 'u-1', table: 'users', column: 'totp_secret' };

describe('criptografia de campo (LEG-S02, ADR-0016)', () => {
  it('cifra e decifra com o mesmo contexto', async () => {
    const blob = await encryptField(kms, ctx, 'segredo sintético');
    expect((await decryptField(kms, ctx, blob)).toString('utf8')).toBe('segredo sintético');
  });

  it('não deixa o texto em claro no envelope e usa IV/DEK novos a cada escrita', async () => {
    const a = await encryptField(kms, ctx, 'segredo sintético');
    const b = await encryptField(kms, ctx, 'segredo sintético');
    expect(Buffer.from(a).includes(Buffer.from('segredo sintético'))).toBe(false);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(a[0]).toBe(0x01);
  });

  it.each([
    { userId: 'u-2', table: 'users', column: 'totp_secret' },
    { userId: 'u-1', table: 'sleep_entries', column: 'totp_secret' },
    { userId: 'u-1', table: 'users', column: 'outra' },
  ])('falha com contexto diferente %o', async (other) => {
    const blob = await encryptField(kms, ctx, 'x');
    await expect(decryptField(kms, other, blob)).rejects.toThrow(/crypto|kms/);
  });

  it('falha se o envelope for adulterado ou truncado', async () => {
    const blob = await encryptField(kms, ctx, 'valor');
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 0xff;
    await expect(decryptField(kms, ctx, tampered)).rejects.toThrow();
    await expect(decryptField(kms, ctx, blob.subarray(0, 10))).rejects.toThrow();
    await expect(decryptField(kms, ctx, new Uint8Array([0x02, 0]))).rejects.toThrow();
  });

  it('falha com outra chave mestra', async () => {
    const blob = await encryptField(kms, ctx, 'valor');
    const other = new LocalKmsProvider(randomBytes(32).toString('base64'));
    await expect(decryptField(other, ctx, blob)).rejects.toThrow();
  });

  it('erros não carregam o conteúdo', async () => {
    const blob = await encryptField(kms, ctx, 'conteudo-que-nao-pode-vazar');
    const err = await decryptField(kms, { ...ctx, userId: 'x' }, blob).catch((e: unknown) => e);
    expect(String((err as Error).message)).not.toContain('conteudo-que-nao-pode-vazar');
  });
});
