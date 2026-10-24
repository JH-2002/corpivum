// FFmpeg do `ffmpeg-static` (só desenvolvimento) para `pnpm readme:midia` e `pnpm video:vitrine` (ADR-0056): baixado
// na primeira vez e executado só com o SHA-256 conferido.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/**
 * SHA-256 do binário do FFmpeg do release `b6.1.1` do ffmpeg-static 5.3.0, por plataforma, conforme o `digest` que o
 * GitHub publica para cada asset (`gh api repos/eugeneware/ffmpeg-static/releases/tags/b6.1.1`). O install do pacote
 * não confere integridade; aqui, binário diferente não roda. Atualizar junto com a versão do pacote (ADR-0056).
 */
const FFMPEG_SHA256 = {
  'win32-x64': '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00',
  'linux-x64': 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99',
  'linux-arm64': '6bb182d0d75d23028db82e9e4f723ca69b853d055698486e6984ddb2c06fb8ce',
  'darwin-x64': 'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894',
  'darwin-arm64': 'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584',
};
/** Variáveis com que o ffmpeg-static troca o binário ou a origem do download: ignoradas. */
const FFMPEG_OVERRIDE_VARS = ['FFMPEG_BIN', 'FFMPEG_BINARIES_URL', 'FFMPEG_BINARY_RELEASE'];

let verifiedBin;

/**
 * Caminho do FFmpeg conferido pelo SHA-256; baixa o binário na primeira vez (o install do pacote fica desligado
 * no pnpm-workspace).
 */
export function ffmpegBin() {
  if (verifiedBin) return verifiedBin;
  const expected = FFMPEG_SHA256[`${process.platform}-${process.arch}`];
  if (!expected) throw new Error(`sem SHA-256 do FFmpeg para ${process.platform}-${process.arch}`);
  const pkgDir = path.dirname(require.resolve('ffmpeg-static/package.json'));
  const bin = path.join(pkgDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (!existsSync(bin)) {
    console.log('ffmpeg: baixando o binário do FFmpeg (ffmpeg-static)...');
    const env = { ...process.env };
    for (const key of FFMPEG_OVERRIDE_VARS) delete env[key];
    const result = spawnSync(process.execPath, ['install.js'], {
      cwd: pkgDir,
      env,
      stdio: 'inherit',
    });
    if (result.status !== 0 || !existsSync(bin))
      throw new Error('não foi possível baixar o FFmpeg');
  }
  const actual = createHash('sha256').update(readFileSync(bin)).digest('hex');
  if (actual !== expected) {
    rmSync(bin, { force: true });
    throw new Error(`o binário do FFmpeg não confere (SHA-256 ${actual}); apagado sem executar`);
  }
  verifiedBin = bin;
  return bin;
}

export function ffmpeg(args) {
  execFileSync(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  });
}
