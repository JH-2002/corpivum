import { EnvValidationError } from './errors';

/**
 * Modo só demo (ADR-0043): `DEMO_ONLY=true` publica apenas a demonstração pública com dados fictícios
 * (LEG-X02). Cadastro, login, área logada, Central de Privacidade, route handlers, server actions do app
 * completo e jobs ficam desligados, e não há banco, segredo nem adaptador.
 *
 * Sem dependências de runtime: lido pelo proxy, pelo servidor e pelos testes. Valor diferente de `true`,
 * `false` ou vazio é erro (falha alto em vez de cair num dos modos sem querer).
 */
export function isDemoOnly(source: Record<string, string | undefined> = process.env): boolean {
  const value = source.DEMO_ONLY;
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new EnvValidationError(['DEMO_ONLY: use "true" ou "false"']);
}
