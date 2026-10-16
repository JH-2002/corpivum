'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { enterPresentation, exitPresentation } from '@/lib/presentation-server';

/**
 * Entrar e sair do modo apresentação (§45, ADR-0035). Públicas de propósito, como o período e o modo
 * privacidade: valem no demo sem login e só mexem em preferências de interface (cookies de sessão sem
 * identificador). O destino é fixo por escopo: nunca um endereço vindo do formulário.
 */
const scopeSchema = z.enum(['app', 'demo']);
const DESTINATION = {
  // `?apresentacao=encerrada`: o destino avisa que o modo privacidade continua ligado (OI-36 d).
  app: { enter: '/apresentacao', exit: '/inicio?apresentacao=encerrada' },
  demo: { enter: '/demo/apresentacao', exit: '/demo?apresentacao=encerrada' },
} as const;

function scopeOf(form: FormData) {
  return scopeSchema.safeParse(form.get('scope')).data ?? 'demo';
}

export async function enterPresentationAction(form: FormData): Promise<void> {
  const scope = scopeOf(form);
  await enterPresentation();
  redirect(DESTINATION[scope].enter);
}

export async function exitPresentationAction(form: FormData): Promise<void> {
  const scope = scopeOf(form);
  await exitPresentation();
  redirect(DESTINATION[scope].exit);
}
