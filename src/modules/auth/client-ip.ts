/**
 * IP do cliente, usado SÓ como chave HMAC do limite de tentativas (LEG-S05). Nunca é gravado em claro.
 *
 * - Com `trustedHeader` (env `CLIENT_IP_HEADER`, obrigatório em produção): usa o cabeçalho que a
 *   hospedagem escreve e o cliente não controla (ex.: `x-real-ip`). Fase 7: confirmar na hospedagem.
 * - Sem ele (desenvolvimento): usa o ÚLTIMO valor de X-Forwarded-For, acrescentado pelo proxy mais
 *   próximo. O primeiro valor é escolhido pelo cliente e não serve para limite.
 */
export function clientIp(headers: Headers, trustedHeader?: string): string {
  if (trustedHeader) {
    const value = headers.get(trustedHeader)?.split(',')[0]?.trim();
    return value || 'unknown';
  }
  const hops = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return hops.at(-1) ?? 'local';
}
