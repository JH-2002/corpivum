# Textos superados (prova de consentimento, LEG-R03, LEG-C01)

Cada versão publicada em `policy_versions` guarda só o hash do texto. Quando um texto é substituído, a versão
antiga vem para cá, com o JSON exato do namespace i18n daquela versão
(`<documento>.v<versão>.json`). O teste `src/modules/consent/archive.test.ts` recalcula o hash de cada
arquivo e compara com o registrado nas migrações: as provas antigas continuam verificáveis.

- `consent_health_data.v1.json`: consentimento de saúde da Fase 1b, substituído na reorientação (ADR-0027).
