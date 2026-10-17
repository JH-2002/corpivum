# Textos superados (prova de consentimento, LEG-R03, LEG-C01)

Cada versão publicada em `policy_versions` guarda só o hash do texto. Quando um texto é substituído, a versão
antiga vem para cá, com o JSON exato do namespace i18n daquela versão
(`<documento>.v<versão>.json`). O teste `src/modules/consent/archive.test.ts` recalcula o hash de cada
arquivo e compara com o registrado nas migrações: as provas antigas continuam verificáveis.

- `consent_health_data.v1.json`: consentimento de saúde da Fase 1b, substituído na reorientação (ADR-0027).
- `terms.v1.json`: Termos de Uso da Fase 1b, com a seção "Sugestões do app"; substituídos pela v2 (ADR-0031).
- `privacy_policy.v1.json`: Política de Privacidade da Fase 1b, sem a lista das categorias de dados de bem-estar,
  o prazo das contas sem onboarding e os cookies; substituída pela v2 (ADR-0041).
- `consent_marketing.v1.json` e `consent_product_metrics.v1.json`: consentimentos opcionais da Fase 1b, retirados
  do produto sem nunca terem sido usados (ADR-0042, OI-37). As provas de escolha apontam para essas versões.
- `privacy_policy.v2.json`: Política de Privacidade da 7f, que citava os consentimentos opcionais; substituída pela
  v3 (ADR-0042).
