/**
 * Módulo `journal` (§19, LEG-S02, ADR-0021). Conteúdo cifrado, sem busca textual. API pública sem
 * dependência de servidor: tipos e schemas. Serviço: `./service`; integração com o Next: `./server`.
 */
export {
  journalFilterSchema,
  journalInputSchema,
  type JournalFilter,
  type JournalInput,
} from './schemas';
export { JOURNAL_TAGS, type JournalRecord, type JournalTag } from './types';
