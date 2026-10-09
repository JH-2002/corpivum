// Comprime os corpos gerados por build_body.py e registra no app (ADR-0028).
// Uso: node scripts/assets/pack-models.mjs <pasta-de-saída-do-build_body>
// Para cada `body-<variante>.glb`: gltfpack (meshopt + quantização, mantém nomes de materiais, nós e os
// nomes dos morphs), nome por hash em `public/models/`, manifesto em `src/modules/twin/bodyAssets.ts` e as
// linhas para `docs/ASSETS.md`. Remove o arquivo anterior da mesma variante.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const VARIANTS = ['feminine', 'masculine'];
const ROOT = resolve(import.meta.dirname, '../..');
const MODELS_DIR = join(ROOT, 'public', 'models');
const MANIFEST = join(ROOT, 'src', 'modules', 'twin', 'bodyAssets.ts');

const input = process.argv[2];
if (!input || !existsSync(join(input, 'calibration.json'))) {
  console.error(
    'Uso: node scripts/assets/pack-models.mjs <pasta com body-*.glb e calibration.json>',
  );
  process.exit(2);
}

const calibration = JSON.parse(readFileSync(join(input, 'calibration.json'), 'utf8'));
const gltfpack = createRequire(import.meta.url).resolve('gltfpack/cli.js');
mkdirSync(MODELS_DIR, { recursive: true });

const assets = {};
for (const variant of VARIANTS) {
  const source = join(input, `body-${variant}.glb`);
  const info = calibration.variants[variant];
  if (!existsSync(source) || !info) {
    console.error(
      `Falta body-${variant}.glb ou sua calibração em ${input} (gere as duas variantes).`,
    );
    process.exit(1);
  }
  const packed = join(input, `body-${variant}.packed.glb`);
  execFileSync(
    process.execPath,
    [gltfpack, '-i', source, '-o', packed, '-cc', '-km', '-kn', '-ke'],
    {
      stdio: 'inherit',
    },
  );
  const bytes = readFileSync(packed);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const name = `body-${variant}.${sha256.slice(0, 8)}.glb`;
  for (const old of readdirSync(MODELS_DIR)) {
    if (old.startsWith(`body-${variant}.`) && old.endsWith('.glb')) rmSync(join(MODELS_DIR, old));
  }
  writeFileSync(join(MODELS_DIR, name), bytes);
  assets[variant] = {
    file: `/models/${name}`,
    bytes: bytes.length,
    sha256,
    triangles: info.triangles,
    calibration: {
      baseHeightM: info.baseHeightM,
      armAxis: info.planes.arm.normal,
      girthCm: info.girthCm,
    },
    measure: info.planes,
  };
  console.log(`${variant}: ${name} (${(bytes.length / 1024).toFixed(1)} KiB)`);
}

writeFileSync(
  MANIFEST,
  `// Gerado por scripts/assets/pack-models.mjs (ADR-0028). Não editar à mão: rode o pipeline.
import type { BodyAsset, BodyModel } from './bodyModel';

/** Modelos \`.glb\` do corpo por variante. Variante sem arquivo usa a geometria gerada em código. */
export const BODY_ASSETS: Partial<Record<BodyModel, BodyAsset>> = ${JSON.stringify(assets, null, 2)};
`,
);
execFileSync(
  process.execPath,
  [createRequire(import.meta.url).resolve('prettier/bin/prettier.cjs'), '--write', MANIFEST],
  {
    stdio: 'inherit',
  },
);

console.log('\nLinhas para docs/ASSETS.md (complete origem/data do download e o PR):');
for (const [variant, a] of Object.entries(assets)) {
  console.log(
    `| \`public${a.file}\` | MPFB2 (malha base e targets do MakeHuman), Blender ${calibration.blender} | ` +
      `MakeHuman Community | CC0 1.0 | Não exigida | Sim; ${variant}, ${a.triangles} triângulos, ` +
      `sem auxiliares, mamilos achatados, rosto estilizado (remesh), morphs de circunferência e de tamanho, meshopt | \`${a.sha256}\` | |`,
  );
}
