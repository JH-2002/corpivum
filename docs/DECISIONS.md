# Registro de decisões (ADR)

Formato curto: contexto, decisão, consequências. Decisões novas entram no fim, com número sequencial.
Requisitos citados por ID (`LEG-xx`, ver `docs/LEGAL_REQUIREMENTS.md`).

---

## ADR-0001 — Stack e versões (Fase 0, 2026-10-06)
**Contexto.** CLAUDE.md fixa a stack. Algumas versões "latest" do npm não servem hoje.
**Decisão.**
- Next.js 16 (App Router, Turbopack), React 19, Tailwind 4, Zod 4, next-intl 4, Vitest 5, Playwright.
- **TypeScript 6.0**, não 7: o `typescript-eslint` ainda declara suporte só até `<6.1`.
- **ESLint 9**, embora marcado como fora de suporte: os plugins do `eslint-config-next` (react, jsx-a11y,
  import) ainda não aceitam ESLint 10. Revisar quando houver suporte.
- **Prisma 7.10** (estável). A dist-tag `latest` do npm aponta para um RC da 8.0.
- `eslint-config-next` alinhado à versão do Next (16.3.8), respeitando a idade mínima de release do pnpm.
**Consequências.** Dívida técnica: subir TS 7 e ESLint 10 quando o ecossistema permitir (Dependabot avisa).

## ADR-0002 — Papéis do PostgreSQL e conexões (Fase 0)
**Contexto.** LEG-S03 exige runtime sem privilégio para contornar RLS.
**Decisão.**
- `docker/postgres/init/01-roles.sh` cria `app_migrator` (dono do banco, do schema `public` e das tabelas) e
  `app_user` (LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOINHERIT; só `USAGE` no schema e DML
  via privilégios padrão). `app_migrator` tem `CREATEDB` **só em dev**, para o shadow database do
  `prisma migrate dev`. Nenhum dos dois é superusuário nem tem BYPASSRLS.
- A CLI do Prisma (`prisma.config.ts`) usa `MIGRATION_DATABASE_URL` (app_migrator). O runtime usará
  `DATABASE_URL` (app_user) via `@prisma/adapter-pg` a partir da Fase 1a, junto com as políticas RLS e a
  extensão que executa `SET LOCAL app.user_id`.
- `pnpm db:verify-roles` (também na CI) prova as propriedades acima, inclusive que o runtime não cria tabelas.
- Porta do banco publicada só em `127.0.0.1`.
**Consequências.** Em produção, os papéis são criados pelo provisionamento do banco gerenciado (sem CREATEDB
para o migrator). Registrar no runbook de deploy quando a hospedagem for escolhida.

## ADR-0003 — i18n com next-intl, sem roteamento por idioma (Fase 0)
**Decisão.** Um catálogo (`messages/pt-BR.json`), carregado em `src/i18n/request.ts`, sem prefixo de idioma
nas URLs. Chaves tipadas (`src/i18n/global.d.ts`): chave inexistente quebra o typecheck. Rotas em pt-BR
(`/inicio`, `/sono`, ...).
**Consequências.** Adicionar outro idioma exigirá roteamento por locale; fora do escopo do MVP.

## ADR-0004 — Teste de alegações proibidas e namespace `disclaimer.*` (Fase 0, LEG-M03)
**Decisão.**
- Glossário em `tests/content/forbidden-terms.ts`, aplicado a texto normalizado (minúsculas, sem acentos).
  Cada termo tem exemplo positivo obrigatório no teste, e há exemplos negativos para evitar falso positivo
  (ex.: "tratamento de dados pessoais" é permitido; "tratamento da ansiedade" não).
- `disclaimer.*` é isento da varredura. Em troca: lista fechada de chaves aprovadas
  (`tests/content/approved-disclaimers.ts`) — chave nova quebra o teste —, CODEOWNERS e checklist de PR.
- O teste também exige os avisos obrigatórios (prescritor, CVV 188, SAMU 192).
**Consequências.** Strings de UI fora do catálogo não são varridas; a regra é não escrever texto literal em
componentes (revisão de PR). Avaliar `react/jsx-no-literals` quando houver mais telas.

## ADR-0005 — Design tokens (Fase 0, §6, LEG-X01)
**Decisão.** Valores em `src/styles/tokens.css` (CSS variables, temas claro e `.dark`), expostos ao Tailwind
por `@theme inline` em `globals.css`, que também reduz a escala de texto a 6 tamanhos e raios/sombras a
3 níveis. `tests/design/contrast.test.ts` calcula o contraste WCAG de todos os pares usados (texto ≥ 4,5:1;
bordas de campo e anel de foco ≥ 3:1) nos dois temas.
Fonte: pilha do sistema (usa Inter se instalada). **Sem Google Fonts nem outra fonte remota**: nenhuma
requisição a terceiros ao abrir o app.
**Consequências.** Cor nova só entra pelo arquivo de tokens e pelo teste de contraste.

## ADR-0006 — Tema sem "flash" e preferências de interface no navegador (Fase 0)
**Decisão.** Script inline estático (`THEME_INIT_SCRIPT`) aplica `.dark` antes da pintura. Tema fica em
`localStorage` e o período global em `sessionStorage` (§10: "persiste na sessão"), lidos com
`useSyncExternalStore`, validados (Zod) e com fallback em memória se o storage estiver bloqueado.
São só preferências de interface: **nenhum dado de saúde vai para o storage do navegador.**
**Consequências.** Na Fase 1a, a CSP precisa liberar esse script por hash ou nonce.

## ADR-0007 — Adaptadores trocáveis (Fase 0, §37)
**Decisão.** `src/adapters/<nome>/{types,impl,index}.ts` e `createAdapters(env)`. Implementações locais:
LLM fake (sem rede), KMS local (envelope AES-256-GCM com chave de dev), storage em disco (`.storage/`,
chave validada contra path traversal), e-mail no console (destinatário mascarado), fila em memória,
sinal de idade `unknown`, wearables desativado (`NotEnabledError`, LEG-X04).
- `parseEnv` recusa fake/local/console/memory quando `APP_ENV=production`.
- Payload de job só aceita primitivos: carrega IDs, nunca conteúdo.
- `src/lib/logger.ts` aceita só campos de metadados tipados (LEG-R04, LEG-I08); `console` é proibido pelo
  ESLint fora dele.
**Consequências.** Provedores reais exigem registro em `docs/privacy/SUBPROCESSORS.md` (LEG-S10).

## ADR-0008 — Retenção configurável e checagem de backup (Fase 0)
**Decisão.** `PURGE_DAYS=30`, `ACCESS_LOG_RETENTION_DAYS=180` e `BACKUP_RETENTION_DAYS=30` no `.env.example`.
`parseEnv` falha se `BACKUP_RETENTION_DAYS > PURGE_DAYS` (LEG-S07/LEG-D04).
**Consequências.** A variável documenta a intenção; a checagem da configuração real de backup do provedor
entra quando a hospedagem for escolhida (Fase 7). `ACCESS_LOG_RETENTION_DAYS` depende de OPEN_ISSUES OI-06.

## ADR-0009 — Cadeia de suprimentos (Fase 0, LEG-S09)
**Decisão.**
- pnpm com scripts de instalação negados por padrão (`allowBuilds`); liberados só `prisma` e
  `@prisma/engines`. Respeitar a idade mínima de release do pnpm (sem exceções).
- `overrides` para `deepmerge-ts` (≥ 8.0.2) e `mysql2` (≥ 3.24.5), transitivas do CLI do Prisma com
  vulnerabilidade alta corrigida. Prisma validado após o override.
- Exceção de auditoria **GHSA-vfj7-8cjw-p6xm** (`braces`, via `eslint-config-next`): sem versão corrigida,
  usado só no lint sobre globs do repositório. Revisar mensalmente e remover assim que houver correção.
- Actions do GitHub fixadas por SHA; Dependabot com `cooldown` de 7 dias.
**Consequências.** Toda nova exceção de auditoria precisa de justificativa aqui.

## ADR-0010 — CI e SAST (Fase 0, LEG-S09)
**Decisão.** `.github/workflows/ci.yml`: format, lint, typecheck, Vitest, build, Playwright + axe,
verificação de papéis do banco, `pnpm audit`, Semgrep (regras públicas, `--metrics=off`) e gitleaks no
histórico completo. `codeql.yml`: CodeQL `security-extended` em push, PR e semanalmente.
Telemetria do Next desligada (`NEXT_TELEMETRY_DISABLED=1`) na CI e no `.env.example`.
**Consequências.** GitHub processa código-fonte e CI fora do Brasil, sem dados pessoais de usuários
(registrado em SUBPROCESSORS).

## ADR-0011 — Shell e estados de tela (Fase 0, §7–§10, §34)
**Decisão.**
- Sidebar fixa ≥ 1024px, recolhível 768–1023px (começa recolhida), oculta < 768px, onde entra a navegação
  inferior (Início, Registrar, Twin, Timeline, Mais).
- **"Mais" abre a página `/mais`** (lista das demais seções), em vez de uma folha sobreposta: mesmo
  resultado, sem armadilha de foco, e funciona sem JavaScript.
- Registro rápido em `<dialog>` modal nativo, com ciclo de foco explícito (o Chrome deixa o Tab sair para a
  interface do navegador).
- Menus do header no padrão *disclosure* (botão + `aria-expanded`), não `role="menu"`.
- `StateView` cobre loading/empty/error/no-data/partial. Fora de produção, `?state=` força um estado para
  revisão visual e testes e2e.
**Consequências.** As fases seguintes substituem o estado vazio pelo conteúdo real, mantendo os 5 estados.
