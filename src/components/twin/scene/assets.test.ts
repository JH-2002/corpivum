import { afterEach, describe, expect, it, vi } from 'vitest';
import { BODY_ASSETS } from '@/modules/twin/bodyAssets';
import type { BodyAsset } from '@/modules/twin';

/**
 * Tempo limite do modelo (ADR-0028): `bodyModelArrived` marca a chegada pela rede, antes da decodificação.
 * A cena para o relógio aqui; decodificar devagar (WebGL por software, CPU ocupada) não vira fallback.
 */
async function freshAssets() {
  vi.resetModules();
  return import('./assets');
}

const asset = BODY_ASSETS.feminine as BodyAsset;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bodyModelArrived', () => {
  it('resolve quando o arquivo chega, mesmo que a decodificação falhe depois', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]))));
    vi.stubGlobal('fetch', fetchMock);
    const { bodyModelArrived, loadBodyParts } = await freshAssets();
    await expect(bodyModelArrived(asset)).resolves.toBeUndefined();
    await expect(loadBodyParts(asset)).rejects.toThrow();
    // Um pedido só: a chegada e as partes usam o mesmo fetch (cache por arquivo).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(asset.file, { credentials: 'omit' });
  });

  it('fica pendente enquanto a rede não responde', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const { bodyModelArrived } = await freshAssets();
    const arrived = vi.fn();
    void bodyModelArrived(asset).then(arrived);
    await new Promise((r) => setTimeout(r, 20));
    expect(arrived).not.toHaveBeenCalled();
  });

  it('rejeita resposta de erro e caminho fora do padrão de /models/', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
    );
    const { bodyModelArrived } = await freshAssets();
    await expect(bodyModelArrived(asset)).rejects.toThrow('modelo indisponível');
    await expect(bodyModelArrived({ ...asset, file: '/models/../segredo.glb' })).rejects.toThrow(
      'caminho de modelo inválido',
    );
  });
});
