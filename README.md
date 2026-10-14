# HealthMind 360

Plataforma pessoal de acompanhamento do desenvolvimento corporal com foco em **bem-estar** (corpo e medidas,
sono, hábitos, alimentação, atividade física e metas informados pela própria pessoa), com twin 3D do corpo e
resumos por regras. Sem assistente de IA (ADR-0030).
Público: adultos (18+) no Brasil, em pt-BR.

> **Não é dispositivo médico.** Não diagnostica, não trata, não monitora doenças, não sugere doses e não
> substitui profissional de saúde. Ver [`docs/INTENDED_USE.md`](docs/INTENDED_USE.md).

## Estado atual
**Fase 0 — fundação e governança:** tooling e CI, Postgres local com papéis separados, adaptadores com
implementações locais, i18n com teste de alegações proibidas, design tokens e app shell navegável com
estados de tela. Autenticação, RLS e consentimento chegam nas Fases 1a/1b (ver `docs/prompts/`).

## Começando
Veja [`docs/runbooks/LOCAL_DEV.md`](docs/runbooks/LOCAL_DEV.md). Resumo:

```sh
pnpm install
cp .env.example .env     # preencha senhas locais e a chave do KMS de dev
pnpm db:up && pnpm db:verify-roles
pnpm dev
```

| Script | O que faz |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | Qualidade estática |
| `pnpm test` | Vitest (unidades, strings proibidas, contraste dos tokens) |
| `pnpm test:e2e` | Playwright + axe (acessibilidade, responsividade 320–1920px, teclado) |
| `pnpm db:up` · `pnpm db:verify-roles` | Banco local e verificação dos papéis `app_migrator`/`app_user` |
| `pnpm audit` | Auditoria de dependências |

## Estrutura
```
src/app/              rotas (App Router); (app)/ = shell autenticado
src/components/       ui/ (base), shell/ (sidebar, header, navegação), theme/
src/modules/<dominio> módulos de domínio (ver src/modules/README.md)
src/adapters/         KmsProvider, StorageProvider, MailProvider, JobQueue,
                      AgeSignalProvider, WearableProvider (+ implementações locais)
src/lib/              env (Zod), logger (só metadados), erros tipados, período
src/styles/           design tokens (CSS variables) e Tailwind
messages/             strings de interface (pt-BR); disclaimer.* = avisos obrigatórios
tests/                testes de conteúdo (LEG-M03) e de design (contraste)
e2e/                  Playwright
docker/, prisma/      banco local e Prisma
docs/                 requisitos, spec, decisões, privacidade, runbooks
```

## Documentação
- Regras do projeto: [`CLAUDE.md`](CLAUDE.md)
- Requisitos legais rastreáveis (`LEG-xx`): [`docs/LEGAL_REQUIREMENTS.md`](docs/LEGAL_REQUIREMENTS.md)
- Spec e adendo: [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md), [`docs/SPEC_ADDENDUM.md`](docs/SPEC_ADDENDUM.md)
- Decisões: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Privacidade (rascunhos): [`docs/privacy/`](docs/privacy/) · Questões em aberto: [`docs/legal/OPEN_ISSUES.md`](docs/legal/OPEN_ISSUES.md)
- Runbooks: [`docs/runbooks/`](docs/runbooks/)

Textos jurídicos e de saúde são **rascunhos** sujeitos a revisão jurídica e clínica (`LEGAL-REVIEW`).
