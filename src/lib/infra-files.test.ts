import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkInfraFiles } from './infra-files';

/** Arquivos reais do repositório: a CI roda a mesma checagem com `pnpm check:infra`. */
const real = {
  regionsJson: readFileSync('infra/regions.json', 'utf8'),
  retentionJson: readFileSync('infra/retention.json', 'utf8'),
  envExample: readFileSync('.env.example', 'utf8'),
  subprocessorsMd: readFileSync('docs/privacy/SUBPROCESSORS.md', 'utf8'),
};

function withRegions(
  edit: (
    r: Record<string, unknown> & {
      components: Record<string, { region: string }>;
      outsideBrazil: Array<Record<string, unknown>>;
    },
  ) => void,
) {
  const regions = JSON.parse(real.regionsJson);
  edit(regions);
  return checkInfraFiles({ ...real, regionsJson: JSON.stringify(regions) });
}

describe('checkInfraFiles (LEG-S10, ADR-0036 D1)', () => {
  it('os arquivos do repositório passam', () => {
    expect(checkInfraFiles(real)).toEqual([]);
  });

  it.each([
    'functions',
    'worker',
    'logs',
    'database',
    'backups',
    'queue',
    'storage',
    'kms',
    'ledgerStorage',
    'secrets',
  ])('%s fora do Brasil falha', (name) => {
    const problems = withRegions((r) => {
      const c = r.components[name];
      if (c) c.region = 'us-east-1';
    });
    expect(problems.join('\n')).toContain(`${name} fora do Brasil`);
  });

  it('componente obrigatório ausente falha', () => {
    expect(withRegions((r) => delete r.components.kms).join('\n')).toContain(
      'falta o componente kms',
    );
  });

  it('componente novo fora do Brasil precisa ir para outsideBrazil', () => {
    const problems = withRegions((r) => {
      r.components.cdn = { description: 'CDN', provider: '{{CDN}}', region: 'global' } as never;
    });
    expect(problems.join('\n')).toContain('cdn fora do Brasil');
  });

  it('serviço fora do Brasil precisa constar em SUBPROCESSORS.md e não pode ter dado de saúde', () => {
    expect(
      withRegions((r) => {
        r.outsideBrazil.push({ service: 'Analytics', provider: 'x', healthData: false, data: 'x' });
      }).join('\n'),
    ).toContain('"Analytics" fora do Brasil sem linha em SUBPROCESSORS.md');
    expect(
      withRegions((r) => {
        const first = r.outsideBrazil[0];
        if (first) first.healthData = true;
      }).length,
    ).toBeGreaterThan(0);
  });

  it('APP_REGION diferente da região das funções falha', () => {
    const problems = checkInfraFiles({
      ...real,
      envExample: real.envExample.replace(/^APP_REGION=.*$/m, 'APP_REGION=sa-east-1'),
    });
    expect(problems.join('\n')).toContain('APP_REGION');
  });

  it('região dos backups fora da política de retenção falha', () => {
    const problems = withRegions((r) => {
      const b = r.components.backups;
      if (b) b.region = 'brazilsouth';
    });
    expect(problems.join('\n')).toContain('backups.region');
  });

  it('JSON inválido falha', () => {
    expect(checkInfraFiles({ ...real, regionsJson: '{' })).toEqual([
      'infra/regions.json: JSON inválido',
    ]);
  });
});
