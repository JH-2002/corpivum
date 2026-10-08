import { daysBetween, dbDateToIso, isoToDbDate, localDay } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import type { HealthDeps } from '@/modules/health/core';
import type { JournalFilter, JournalInput } from './schemas';
import type { JournalRecord } from './types';

const CONTENT = { table: 'journal_entries', column: 'content_enc' } as const;

export type JournalWriteResult = { ok: true; id: string } | { ok: false; error: 'future' };

/**
 * Diário (§19). Conteúdo cifrado em nível de campo (LEG-S02), sem busca textual. Só decifra o texto
 * quando a tela pede (`withText`); o dashboard usa só datas e contagens. A IA não lê o diário (Fase 5,
 * só trechos escolhidos e com consentimento de IA, LEG-I02).
 */
export function createJournalService(deps: HealthDeps) {
  const now = deps.now ?? (() => new Date());
  const isFuture = (day: string) => daysBetween(localDay(now(), deps.timeZone), day) > 0;

  return {
    async list(
      userId: string,
      range: DateRange,
      opts: { withText?: boolean; filter?: JournalFilter } = {},
    ): Promise<JournalRecord[]> {
      return deps.run(userId, async (tx) => {
        const rows = await tx.journalEntry.findMany({
          where: {
            entryDate: { gte: isoToDbDate(range.from), lte: isoToDbDate(range.to) },
            ...(opts.filter?.mood ? { mood: opts.filter.mood } : {}),
            ...(opts.filter?.tag ? { tags: { has: opts.filter.tag } } : {}),
          },
          orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        });
        return Promise.all(
          rows.map(async (r) => ({
            id: r.id,
            day: dbDateToIso(r.entryDate),
            mood: r.mood,
            tags: r.tags,
            content: opts.withText ? await deps.cipher.open(userId, CONTENT, r.contentEnc) : null,
          })),
        );
      });
    },

    async get(userId: string, id: string): Promise<JournalRecord | null> {
      return deps.run(userId, async (tx) => {
        const r = await tx.journalEntry.findFirst({ where: { id } });
        if (!r) return null;
        return {
          id: r.id,
          day: dbDateToIso(r.entryDate),
          mood: r.mood,
          tags: r.tags,
          content: await deps.cipher.open(userId, CONTENT, r.contentEnc),
        };
      });
    },

    async create(userId: string, input: JournalInput): Promise<JournalWriteResult> {
      if (isFuture(input.day)) return { ok: false, error: 'future' };
      // Cifra só dentro da transação, depois da checagem de consentimento (regra 1).
      const row = await deps.run(userId, async (tx) => {
        const contentEnc = await deps.cipher.seal(userId, CONTENT, input.content);
        return tx.journalEntry.create({
          data: {
            userId,
            entryDate: isoToDbDate(input.day),
            contentEnc,
            mood: input.mood ?? null,
            tags: input.tags,
          },
          select: { id: true },
        });
      });
      return { ok: true, id: row.id };
    },

    async update(
      userId: string,
      id: string,
      input: JournalInput,
    ): Promise<JournalWriteResult | null> {
      if (isFuture(input.day)) return { ok: false, error: 'future' };
      // Cifra só dentro da transação, depois da checagem de consentimento (regra 1).
      const { count } = await deps.run(userId, async (tx) => {
        const contentEnc = await deps.cipher.seal(userId, CONTENT, input.content);
        return tx.journalEntry.updateMany({
          where: { id },
          data: {
            entryDate: isoToDbDate(input.day),
            contentEnc,
            mood: input.mood ?? null,
            tags: input.tags,
          },
        });
      });
      return count === 1 ? { ok: true, id } : null;
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) =>
        tx.journalEntry.deleteMany({ where: { id } }),
      );
      return count === 1;
    },
  };
}

export type JournalService = ReturnType<typeof createJournalService>;
