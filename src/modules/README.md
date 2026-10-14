# Módulos de domínio

Um diretório por domínio (`src/modules/<dominio>`, CLAUDE.md). Humor, diário, medicamentos e cérebro 3D
saíram na reorientação (ADR-0027); o assistente de IA e as recomendações automáticas, na ADR-0030. Cada
módulo expõe sua API por `index.ts` e acessa infraestrutura apenas pelos adaptadores em `src/adapters`.

| Módulo | Responsabilidade | Spec | Requisitos | Fase |
|---|---|---|---|---|
| `auth` | Conta, autenticação, MFA, sessões em banco e age gate 18+ | §52 | LEG-S04, LEG-F01, LEG-F03 | 1a |
| `consent` | ConsentRecord por finalidade, versões de política e reconsentimento | §52 | LEG-C01–C06, LEG-G04 | 1b |
| `privacy` | Central de Privacidade: direitos do titular, exportação, exclusão, AuditLog e AccessLog | §46 | LEG-D01–D08, LEG-S06, LEG-R01–R04 | 1b / 6 |
| `health` | Núcleo dos módulos de saúde: transação com consentimento, cifra, fonte única, dashboard, eliminadores | §11–§12 | LEG-C04, LEG-S02, LEG-S03, LEG-D04 | 2 |
| `demo` | Gerador de dados fictícios (demo público e modo demo) e seed de desenvolvimento | §40 | LEG-X02 | 2 |
| `sleep` | Registro e métricas de sono | §20 | LEG-C02 | 2 |
| `habits` | Hábitos, checks e streaks desativáveis | §22 | LEG-F05 | 2 |
| `body` | Peso, altura e medidas; IMC como ESTIMADO | §23 | LEG-M04 | 2 |
| `nutrition` | Refeições e água, sem juízo nem metas restritivas | §25 | LEG-M04, LEG-M07 | 4 |
| `activity` | Atividades, treinos de força e progressão, sem prescrição | §26 | LEG-C02, LEG-M08 | 4 |
| `guardrails` | Regras puras de imagem corporal e alimentação (metas, alimentação, timeline) | §30, §55 | LEG-M04, LEG-M06–M08 | Reorientação |
| `goals` | Metas com limites de segurança (`guardrails`) e tom neutro | §30 | LEG-M04, LEG-F05 | 4 |
| `timeline` | Linha do tempo pessoal e marcos | §31 | LEG-C02 | 4 |
| `twin` | Health Digital Twin: corpo 3D moldado só pelas medidas informadas | §15–§16 | LEG-M04, LEG-M06 | 3 |
| `reports` | Relatórios PDF/CSV/JSON com link expirando | §29 | LEG-D03 | 6 |
| `notifications` | Lembretes e notificações via JobQueue, sem insistência | §33 | LEG-F05 | 4 |
| `wellbeing` | Índice de Bem-Estar versionado (score_version) e explicável | §14 | LEG-D08 | 2 |
