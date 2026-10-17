import { z } from 'zod';
import { BRAZIL_REGIONS } from './env';
import { infraRetentionSchema, parseDotenv } from './retention-files';

/**
 * Checagem da CI (`pnpm check:infra`, ADR-0036 D1, ADR-0040; LEG-S10): `infra/regions.json` declara onde cada
 * parte do sistema roda e guarda dados. Sem Terraform enquanto não houver hospedagem (OI-11); a conferência no
 * provedor real é do CHECKLIST_GO_LIVE. Funções puras; o script só lê os arquivos.
 */

/** Partes que precisam estar no Brasil, inclusive a execução das funções e os logs da plataforma. */
export const REQUIRED_COMPONENTS = [
  'functions',
  'worker',
  'logs',
  'database',
  'backups',
  'queue',
  'storage',
  'kms',
  // Revisão B6 da 7e: o livro guarda ids, provas e IPs; o gerenciador guarda a chave dos backups.
  'ledgerStorage',
  'secrets',
] as const;

const component = z.object({
  description: z.string().min(1),
  /** Fornecedor ou placeholder `{{...}}` até a escolha (OI-11). */
  provider: z.string().min(1),
  region: z.string().min(1),
});

export const infraRegionsSchema = z.object({
  version: z.literal(1),
  components: z.record(z.string(), component),
  /** Serviços fora do Brasil: só sem dado de saúde e já listados em SUBPROCESSORS.md (LEG-D06, OI-03). */
  outsideBrazil: z.array(
    z.object({
      service: z.string().min(1),
      provider: z.string().min(1),
      healthData: z.literal(false),
      data: z.string().min(1),
    }),
  ),
});

const isBrazil = (region: string) => (BRAZIL_REGIONS as readonly string[]).includes(region);

/** Motivos de falha (vazio = ok). Só nomes e regras, nunca segredos. */
export function checkInfraFiles(files: {
  regionsJson: string;
  retentionJson: string;
  envExample: string;
  subprocessorsMd: string;
}): string[] {
  const out: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(files.regionsJson);
  } catch {
    return ['infra/regions.json: JSON inválido'];
  }
  const parsed = infraRegionsSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `infra/regions.json: ${i.path.join('.')}: ${i.message}`);
  }
  const { components, outsideBrazil } = parsed.data;

  for (const name of REQUIRED_COMPONENTS) {
    const c = components[name];
    if (!c) out.push(`infra/regions.json: falta o componente ${name}`);
    else if (!isBrazil(c.region)) {
      out.push(`infra/regions.json: ${name} fora do Brasil (${c.region}) (LEG-S10)`);
    }
  }
  for (const [name, c] of Object.entries(components)) {
    if (!(REQUIRED_COMPONENTS as readonly string[]).includes(name) && !isBrazil(c.region)) {
      out.push(`infra/regions.json: ${name} fora do Brasil: declare em outsideBrazil (LEG-S10)`);
    }
  }

  // A região de execução do ambiente é a das funções.
  const appRegion = parseDotenv(files.envExample).APP_REGION;
  if (components.functions && appRegion !== components.functions.region) {
    out.push('infra/regions.json: functions.region deve ser igual ao APP_REGION do .env.example');
  }

  // A política de backup (ADR-0035) e a região declarada aqui contam a mesma história.
  try {
    const retention = infraRetentionSchema.safeParse(JSON.parse(files.retentionJson));
    const backupRegion = components.backups?.region;
    if (!retention.success) out.push('infra/retention.json: inválido (rode pnpm check:retention)');
    else if (backupRegion && !retention.data.backup.regions.includes(backupRegion)) {
      out.push(
        'infra/regions.json: backups.region deve estar em backup.regions de infra/retention.json',
      );
    }
  } catch {
    out.push('infra/retention.json: JSON inválido');
  }

  // Todo serviço fora do Brasil já consta em SUBPROCESSORS.md antes de ser ativado.
  const rows = files.subprocessorsMd
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|')[1]?.trim() ?? '');
  for (const s of outsideBrazil) {
    if ((REQUIRED_COMPONENTS as readonly string[]).includes(s.service)) {
      out.push(`infra/regions.json: ${s.service} não pode ficar fora do Brasil (LEG-S10)`);
    }
    if (!rows.includes(s.service)) {
      out.push(
        `infra/regions.json: "${s.service}" fora do Brasil sem linha em SUBPROCESSORS.md (LEG-D06)`,
      );
    }
  }
  return out;
}
