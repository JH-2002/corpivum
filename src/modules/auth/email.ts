/**
 * Endereços de e-mail.
 * - `normalizeEmail`: forma gravada e usada para achar a conta (trim + minúsculas).
 * - `canonicalMailbox`: a CAIXA que recebe a mensagem, usada só na chave dos limites por destinatário
 *   (PR1a-R3-M1). Variações como `x+1@` ou, no Gmail, `x.y@` caem no mesmo balde e não multiplicam
 *   os e-mails enviados a uma mesma pessoa. Nunca é gravada nem usada para achar conta.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Domínios em que pontos na parte local são ignorados pelo provedor. */
const DOTLESS_DOMAINS: Readonly<Record<string, string>> = {
  'gmail.com': 'gmail.com',
  'googlemail.com': 'gmail.com',
};

export function canonicalMailbox(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return normalized;
  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  const dotless = DOTLESS_DOMAINS[domain];
  if (dotless) {
    local = local.replaceAll('.', '');
    domain = dotless;
  }
  return `${local}@${domain}`;
}
