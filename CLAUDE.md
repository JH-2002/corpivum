# HealthMind 360

Plataforma pessoal de acompanhamento do desenvolvimento corporal com foco em bem-estar (corpo e medidas,
sono, hábitos, alimentação, atividade física, metas), com twin 3D do corpo e resumos por regras.
Público: adultos (18+) no Brasil. Idioma principal: pt-BR. Escopo atual e módulos removidos: `docs/DECISIONS.md`.

## Leia antes de planejar
- `docs/LEGAL_REQUIREMENTS.md`: requisitos legais com IDs `LEG-xx`
- `docs/SPEC_ADDENDUM.md`: substituições e acréscimos ao spec
- `docs/PRODUCT_SPEC.md`: visão, UX, visual, módulos (spec original)
- `docs/INTENDED_USE.md`, `docs/DECISIONS.md`, `docs/legal/OPEN_ISSUES.md`

Em conflito: LEGAL_REQUIREMENTS > SPEC_ADDENDUM > PRODUCT_SPEC.

## Posicionamento (inegociável)
Produto de bem-estar e autoacompanhamento. NÃO é dispositivo médico: não diagnostica, não trata,
não monitora doenças, não sugere doses, não prescreve dieta nem treino, não substitui profissional de saúde.
Imagem corporal e alimentação são requisito central: nada julga o corpo nem incentiva restrição
(LEG-M04, M06, M07, M08; guardrails em `src/modules/guardrails`). Nenhum texto de
interface pode contradizer isso.

## Regras inegociáveis
1. Dado de saúde é dado pessoal sensível. Nunca tratar sem `ConsentRecord` ativo para a finalidade.
2. Nunca vender ou compartilhar dados de saúde. Sem SDKs de publicidade, sem trackers de terceiros.
3. Sem assistente de IA, sem provedor de LLM e sem recomendações automáticas; resumos só por regras fixas (ADR-0030, LEGAL_REQUIREMENTS B6).
4. Menores de 18 não criam conta e não têm dado persistido.
5. Nunca logar conteúdo de saúde, notas, alimentação ou medidas. Só metadados.
6. Nunca usar dados reais em desenvolvimento (apenas seed sintético). Nunca commitar segredos.
7. Todo dado exibido tem selo: MEDIDO | INFORMADO | ESTIMADO | INFERIDO | DEMO.
8. Nunca afirmar estado cerebral, nível de neurotransmissor, liberação de substância, transtorno
   ou diagnóstico.
9. Sinais de risco → orientação profissional; emergência SAMU 192; apoio emocional CVV 188.
10. Texto jurídico é RASCUNHO marcado `LEGAL-REVIEW`. Nunca escrever "em conformidade com a LGPD".

## Stack
Next.js (App Router) · React · TypeScript strict · Tailwind · React Three Fiber (sem Drei, ADR-0026) · Recharts ·
PostgreSQL · Prisma · auth próprio (ADR-0014; Auth.js descartado) · Zod · Vitest · Playwright · pnpm.
Adaptadores trocáveis: `KmsProvider`, `StorageProvider`, `MailProvider`, `JobQueue`,
`AgeSignalProvider`, `WearableProvider`. Módulos em `src/modules/<dominio>`.

## Armadilhas conhecidas (não ignore)
- **Autenticação:** o Credentials do Auth.js só funciona com JWT, então usamos módulo próprio
  (`src/modules/auth`, ADR-0014). Sessão opaca em tabela, validada a cada requisição (LEG-S04). O pré-login
  usa funções SECURITY DEFINER com `search_path` fixo, sem SQL dinâmico e com retorno mínimo (ADR-0015).
  Comparações de segredo só via `constantTimeEqual`.
- **Prisma + RLS:** a aplicação conecta com o papel `app_user` (não é dono das tabelas, sem
  BYPASSRLS). Migrações usam `app_migrator`. Toda consulta com dados de usuário roda em transação
  que executa `SET LOCAL app.user_id = '<id>'` (extensão do Prisma Client). Políticas RLS usam
  `current_setting('app.user_id', true)`. Sem o setting, a consulta deve retornar zero linhas.
- **Região:** banco, storage, filas e execução das funções no Brasil (ex.: sa-east-1 / `gru1`).
  Qualquer serviço fora do Brasil entra em `docs/privacy/SUBPROCESSORS.md`.
- **Teste de strings proibidas:** varre os arquivos i18n e falha com alegações clínicas, EXCETO nas
  chaves do namespace `disclaimer.*`, que contêm negações obrigatórias ("não diagnostica...").
- **Criptografia de campo × busca:** campos criptografados (notas, descrição de refeição, nomes de hábito e de
  exercício) não são pesquisáveis no banco. Filtros só por data e campos não sensíveis; agrupar por nome cifrado
  só em memória, depois de decifrar.
- **Arquivos temporários:** nunca criar arquivos em `C:\JOOHOM~1` (o caminho curto do Windows mal resolvido) nem
  em qualquer lugar fora do repositório. Arquivo temporário vai no scratchpad da sessão; o que precisa durar vai
  para o repositório (ex.: `scripts/`).

## Convenções
- Sem `any`. Zod em toda entrada. Erros tipados. Strings de UI em i18n.
- WCAG 2.2 AA: foco visível, teclado, aria-label, `prefers-reduced-motion`, cor nunca como único canal.
- 3D com lazy loading, fallback sem WebGL e `prefers-reduced-motion`.

## Fluxo de trabalho
- Plano antes de codar, uma fase por sessão, commits pequenos.
- Antes de encerrar: `pnpm lint && pnpm typecheck && pnpm test`.
- Decisões → `docs/DECISIONS.md`. Dívida legal → marcar `LEGAL-REVIEW` e registrar em
  `docs/legal/OPEN_ISSUES.md`.
- Ao tocar em dados sensíveis, auth, consentimento, exportação ou logs, rode o subagente
  `privacy-reviewer` antes de finalizar.

## Definition of Done
Funciona · tem teste · acessível · responsivo (320–1920px) · sem dado sensível em log · estados
loading/empty/error/no-data/partial-data · requisitos LEG-xx afetados atendidos e citados no commit/PR.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
