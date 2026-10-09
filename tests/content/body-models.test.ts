import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BODY_ASSETS } from '@/modules/twin/bodyAssets';
import { BODY_REGIONS, MORPH_NAMES } from '@/modules/twin';

/**
 * Modelos `.glb` do corpo (ADR-0028): orçamento de tamanho, hash conferido com o manifesto e com
 * `docs/ASSETS.md`, compressão meshopt, nada externo (sem imagens, texturas ou URIs) e as regiões e morphs
 * que a cena espera. Parser do contêiner GLB próprio (cabeçalho + chunk JSON), sem dependência.
 */
const ROOT = path.resolve(__dirname, '../..');
const MODELS_DIR = path.join(ROOT, 'public', 'models');
const ASSETS_DOC = readFileSync(path.join(ROOT, 'docs', 'ASSETS.md'), 'utf8');
const BUDGET_BYTES = 300 * 1024;
const ALLOWED_EXTENSIONS = ['EXT_meshopt_compression', 'KHR_mesh_quantization'];
const MATERIALS = [...BODY_REGIONS, 'rest'].map((r) => `region_${r}`);

interface Gltf {
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  images?: unknown[];
  textures?: unknown[];
  samplers?: unknown[];
  buffers?: { uri?: string }[];
  nodes?: { name?: string; mesh?: number }[];
  meshes?: {
    extras?: { targetNames?: string[] };
    primitives: { material?: number; targets?: unknown[] }[];
  }[];
  materials?: {
    name?: string;
    pbrMetallicRoughness?: { baseColorTexture?: unknown; metallicRoughnessTexture?: unknown };
    normalTexture?: unknown;
    emissiveTexture?: unknown;
    occlusionTexture?: unknown;
  }[];
}

function readGlb(bytes: Buffer): Gltf {
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a); // "JSON"
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as Gltf;
}

const entries = Object.entries(BODY_ASSETS);

describe('modelos do corpo (ADR-0028)', () => {
  it('todo .glb em public/models está no manifesto', () => {
    const files = existsSync(MODELS_DIR)
      ? readdirSync(MODELS_DIR).filter((f) => f.endsWith('.glb'))
      : [];
    const listed = entries.map(([, a]) => path.basename(a.file));
    expect(files.sort()).toEqual(listed.sort());
  });

  describe.each(entries)('%s', (variant, asset) => {
    const file = path.join(ROOT, 'public', asset.file);
    const bytes = readFileSync(file);
    const gltf = readGlb(bytes);

    it('cabe no orçamento e o hash confere com o manifesto, o nome e o ASSETS.md', () => {
      expect(bytes.length).toBeLessThanOrEqual(BUDGET_BYTES);
      expect(bytes.length).toBe(asset.bytes);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      expect(sha256).toBe(asset.sha256);
      expect(asset.file).toBe(`/models/body-${variant}.${sha256.slice(0, 8)}.glb`);
      expect(ASSETS_DOC).toContain(sha256);
      expect(ASSETS_DOC).toContain(`public${asset.file}`);
    });

    it('comprimido com meshopt e sem nada externo', () => {
      expect(gltf.extensionsRequired ?? []).toContain('EXT_meshopt_compression');
      for (const ext of [...(gltf.extensionsUsed ?? []), ...(gltf.extensionsRequired ?? [])]) {
        expect(ALLOWED_EXTENSIONS).toContain(ext);
      }
      expect(gltf.images ?? []).toEqual([]);
      expect(gltf.textures ?? []).toEqual([]);
      expect(gltf.samplers ?? []).toEqual([]);
      expect((gltf.buffers ?? []).map((b) => b.uri ?? null).filter(Boolean)).toEqual([]);
      for (const m of gltf.materials ?? []) {
        expect([
          m.pbrMetallicRoughness?.baseColorTexture,
          m.pbrMetallicRoughness?.metallicRoughnessTexture,
          m.normalTexture,
          m.emissiveTexture,
          m.occlusionTexture,
        ]).toEqual([undefined, undefined, undefined, undefined, undefined]);
      }
    });

    it('um nó "body", uma malha, uma primitiva por região e os morphs esperados', () => {
      // O gltfpack (-kn) mantém o nó nomeado e pendura a malha num nó filho sem nome.
      expect((gltf.nodes ?? []).map((n) => n.name)).toContain('body');
      expect(gltf.meshes).toHaveLength(1);
      const mesh = gltf.meshes?.[0];
      expect(mesh).toBeDefined();
      const materials = mesh!.primitives.map((p) => gltf.materials?.[p.material ?? -1]?.name);
      expect([...materials].sort()).toEqual([...MATERIALS].sort());
      expect([...(mesh!.extras?.targetNames ?? [])].sort()).toEqual([...MORPH_NAMES].sort());
      for (const p of mesh!.primitives) expect(p.targets).toHaveLength(MORPH_NAMES.length);
    });

    it('calibração coerente: min < base < max em cada região e altura plausível', () => {
      const { baseHeightM, girthCm } = asset.calibration;
      expect(baseHeightM).toBeGreaterThan(1.4);
      expect(baseHeightM).toBeLessThan(2.1);
      for (const region of BODY_REGIONS) {
        const { min, base, max } = girthCm[region];
        expect(min).toBeLessThan(base);
        expect(base).toBeLessThan(max);
      }
    });
  });
});
