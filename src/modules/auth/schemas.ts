import { z } from 'zod';
import { PASSWORD_MAX } from './constants';

/**
 * Validação Zod de toda entrada dos formulários de auth (LEG-S05). Limites de tamanho evitam abuso
 * (ex.: senha gigante no Argon2). As regras de força da senha ficam em `checkPasswordPolicy`.
 */
const email = z.string().trim().max(254).pipe(z.email());
const password = z
  .string()
  .min(1)
  .max(PASSWORD_MAX * 4);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const birthDateSchema = z.object({ birthDate: z.string().max(10) });

export const loginSchema = z.object({ email, password });

export const signupSchema = z
  .object({ email, password, confirmPassword: z.string().max(PASSWORD_MAX * 4) })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  });

export const emailOnlySchema = z.object({ email });

export const mfaCodeSchema = z.object({ code: z.string().trim().min(6).max(16) });

export const tokenSchema = z.object({ token });

export const resetSchema = z
  .object({ token, password, confirmPassword: z.string().max(PASSWORD_MAX * 4) })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  });

export const changePasswordSchema = z
  .object({
    currentPassword: password,
    password,
    confirmPassword: z.string().max(PASSWORD_MAX * 4),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  });

export const sessionIdSchema = z.object({ sessionId: z.uuid() });

export const passwordAndCodeSchema = z.object({
  password,
  code: z.string().trim().min(6).max(16),
});

export const passwordOnlySchema = z.object({ password });

/** FormData → objeto simples (só strings), para o Zod. */
export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
