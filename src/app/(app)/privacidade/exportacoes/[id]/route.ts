import { z } from 'zod';
import { requireAppSession } from '@/modules/consent/server';
import { getReportsService } from '@/modules/reports/server';

/**
 * Download da exportação ou do relatório (LEG-D03, ADR-0032): é o "link" que expira. Só com sessão válida
 * (validada no banco, LEG-S04), do próprio dono (RLS), com consentimento ativo e dentro do prazo (≤ 24 h).
 * O arquivo nunca tem endereço público; a resposta não é guardada em cache.
 */
const idSchema = z.uuid();

const notFound = () =>
  new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(_request: Request, ctx: RouteContext<'/privacidade/exportacoes/[id]'>) {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) return notFound();
  const file = await getReportsService().download(session.userId, parsed.data);
  if (!file) return notFound();
  return new Response(file.body, {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.body.byteLength),
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
