import 'server-only';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { FormState } from '@/components/forms/form-state';
import {
  clearKnownDeviceCookie,
  clearSessionCookie,
  setAgeBlockCookie,
} from '@/modules/auth/server';
import { getReportsService } from '@/modules/reports/server';
import { isDeletionPhrase } from './deletion';
import { getPrivacyService } from './server';

/**
 * Saída da conta (LEG-D04, LEG-F04), comum à Central de Privacidade e à tela mínima do onboarding (P7-M2,
 * ADR-0037): quem ainda não concluiu o onboarding também exclui ou encerra a conta, com o e-mail confirmado e
 * a reautenticação. As actions chamam a guarda antes; aqui só validação (Zod), serviço e cookies. Em sucesso,
 * devolve `null` e a action redireciona.
 */
const passwordSchema = z.object({
  password: z.string().min(1).max(512),
  mfaCode: z.string().trim().max(64).optional(),
});

export async function runMinorClosure(userId: string, form: FormData): Promise<FormState | null> {
  const t = await getTranslations('privacyCenter');
  const parsed = passwordSchema.safeParse({
    password: form.get('password'),
    mfaCode: form.get('mfaCode') || undefined,
  });
  const result = parsed.success
    ? await getPrivacyService().closeMinorAccount(userId, parsed.data.password, parsed.data.mfaCode)
    : 'invalid_password';
  if (result === 'invalid_password') {
    return { status: 'error', fieldErrors: { password: t('minorError') } };
  }
  await clearSessionCookie();
  await clearKnownDeviceCookie();
  // Desencoraja novo cadastro imediato, sem identificar ninguém (LEG-F01).
  await setAgeBlockCookie();
  return null;
}

const deletionSchema = z.object({
  password: z.string().min(1).max(512),
  mfaCode: z.string().trim().max(64).optional(),
  phrase: z.string().max(200).refine(isDeletionPhrase),
  skipExport: z.literal('on').optional(),
});

/**
 * Exclusão de conta (purga imediata): reautenticação (senha e, com MFA, o 2º fator) e a frase exata, conferida
 * aqui. `offerExport`: na Central, sem cópia pronta, é preciso marcar "não quero baixar". No onboarding não
 * há dado de bem-estar a baixar (sem consentimento não há registro), então a oferta não se aplica.
 */
export async function runAccountDeletion(
  userId: string,
  form: FormData,
  options: { offerExport: boolean },
): Promise<FormState | null> {
  const t = await getTranslations('privacyCenter.deletion');
  const parsed = deletionSchema.safeParse({
    password: form.get('password') ?? '',
    mfaCode: form.get('mfaCode') || undefined,
    phrase: form.get('phrase') ?? '',
    skipExport: form.get('skipExport') || undefined,
  });
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((i) => String(i.path[0])));
    return {
      status: 'error',
      fieldErrors: {
        ...(fields.has('phrase') ? { phrase: t('phraseError') } : {}),
        ...(fields.has('password') ? { password: t('credentialsError') } : {}),
      },
    };
  }
  if (options.offerExport && !parsed.data.skipExport) {
    const files = await getReportsService().list(userId);
    if (!files.some((f) => f.kind === 'full_export' && f.downloadable)) {
      return { status: 'error', fieldErrors: { skipExport: t('exportChoiceError') } };
    }
  }
  const result = await getPrivacyService().deleteAccount(userId, {
    password: parsed.data.password,
    ...(parsed.data.mfaCode ? { mfaCode: parsed.data.mfaCode } : {}),
  });
  if (result !== 'deleted') {
    return { status: 'error', fieldErrors: { password: t('credentialsError') } };
  }
  await clearSessionCookie();
  await clearKnownDeviceCookie();
  return null;
}
