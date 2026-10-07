// Carregador mínimo para rodar scripts TypeScript do repositório com o Node 24 (remoção de tipos nativa),
// sem dependência nova (ADR-0009): resolve o alias `@/` para `src/`, completa extensões `.ts` e troca o
// `server-only` (que só faz sentido dentro do Next) por um módulo vazio.
import { register } from 'node:module';

register('./ts-loader-hooks.mjs', import.meta.url);
