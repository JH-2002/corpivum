# Fase 0 — Fundação e governança

> Rode em sessão limpa (`/clear`). Comece pelo modo plan.

```text
Leia CLAUDE.md, docs/LEGAL_REQUIREMENTS.md, docs/SPEC_ADDENDUM.md e as seções relevantes de docs/PRODUCT_SPEC.md. Proponha um plano e aguarde minha aprovação antes de escrever código.

Crie o projeto Next.js + TypeScript strict + Tailwind + Prisma + PostgreSQL (docker-compose para dev),
com pnpm, ESLint, Prettier, Vitest, Playwright e CI (lint, typecheck, test, audit de dependências, SAST).
No docker-compose, crie os papéis app_migrator (dono das tabelas) e app_user (runtime, sem BYPASSRLS).
Crie src/modules/*, as interfaces de adaptadores (LlmProvider, KmsProvider, StorageProvider, MailProvider,
JobQueue, AgeSignalProvider, WearableProvider) com implementações locais/fake, .env.example (incluindo
PURGE_DAYS=30 e ACCESS_LOG_RETENTION_DAYS=180), docs/DECISIONS.md, docs/INTENDED_USE.md, docs/legal/OPEN_ISSUES.md
e os esqueletos de docs/privacy/* (ROPA, RIPD, SUBPROCESSORS) e docs/runbooks/*.
Configure i18n com o namespace disclaimer.* e o teste de strings proibidas que ignora esse namespace (LEG-M03).
Implemente design tokens e o app shell: sidebar responsiva, header, bottom navigation mobile, seletor de período
global, páginas vazias com estados.
Critérios: build e CI verdes; sem segredos no repo; shell navegável de 320px a 1920px; teclado e foco visíveis;
teste de strings proibidas passa com os avisos obrigatórios presentes.
Requisitos: LEG-S09, LEG-S10, LEG-M03, LEG-X01.
```
