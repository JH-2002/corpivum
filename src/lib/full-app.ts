import 'server-only';
import { notFound } from 'next/navigation';
import { isDemoOnly } from './demo-mode';

/**
 * Primeira linha de toda server action e route handler do app completo (ADR-0043). No modo só demo responde
 * 404: uma action é alcançável por POST direto com o ID dela, de qualquer caminho (o Header da demo, por
 * exemplo, importa `logoutAction`), então o bloqueio do proxy não basta. Um teste confere que nenhuma
 * action fora da lista da demo deixa de chamar esta guarda.
 */
export function assertFullApp(): void {
  if (isDemoOnly()) notFound();
}
