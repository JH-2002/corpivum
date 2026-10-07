# Módulo `consent`

ConsentRecord por finalidade, versões de documentos (PolicyVersion), reconsentimento e o guard de tratamento.

- Spec: §52 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-C01–C06, LEG-G04
- Decisões: ADR-0019 (docs/DECISIONS.md)

## Pontos de entrada
- `index.ts`: constantes e tipos (catálogo de finalidades e versões). Seguro para componentes cliente.
- `server.ts`: serviço, `requireAppSession` (guarda das páginas de `(app)`), guardas do onboarding e
  `withConsent` (somente servidor).
- `guard.ts`: `withConsentOn`/`assertConsent`/`hasActiveConsent`, para jobs e outros serviços.

## Regras
- Todo tratamento de dado que dependa de consentimento passa pelo guard, na mesma transação do acesso.
- Tabela de saúde nova: políticas RLS com `(SELECT app.has_active_consent('health_data'))` em
  SELECT/INSERT/UPDATE e DELETE só por dono; registrar o eliminador em `@/modules/privacy/health-data`.
- Mudou um texto de consentimento, Termos ou Política? Suba a versão em `catalog.ts` e publique a nova linha
  em `policy_versions` numa migração (INSERT). O teste `catalog.test.ts` acusa texto alterado sem versão.

Exponha a API pública do módulo apenas por `index.ts`. Outros módulos não importam arquivos internos.
