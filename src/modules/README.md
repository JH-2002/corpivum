# Módulos de domínio

Um diretório por domínio (`src/modules/<dominio>`, CLAUDE.md). Cada módulo expõe sua API por `index.ts`
e acessa infraestrutura apenas pelos adaptadores em `src/adapters`.

| Módulo | Responsabilidade | Spec | Requisitos | Fase |
|---|---|---|---|---|
| `auth` | Conta, autenticação, MFA, sessões em banco e age gate 18+ | §52 | LEG-S04, LEG-F01, LEG-F03 | 1a |
| `consent` | ConsentRecord por finalidade, versões de política e reconsentimento | §52 | LEG-C01–C06, LEG-G04 | 1b |
| `privacy` | Central de Privacidade: direitos do titular, exportação, exclusão, AuditLog e AccessLog | §46 | LEG-D01–D08, LEG-S06, LEG-R01–R04 | 1b / 6 |
| `health` | Núcleo dos módulos de saúde: transação com consentimento, cifra, fonte única, dashboard, eliminadores | §11–§12 | LEG-C04, LEG-S02, LEG-S03, LEG-D04 | 2 |
| `demo` | Gerador de dados fictícios (demo público e modo demo) e seed de desenvolvimento | §40 | LEG-X02 | 2 |
| `sleep` | Registro e métricas de sono | §20 | LEG-C02 | 2 |
| `mood` | Humor, energia e estresse | §21 | LEG-C02, LEG-S02 (nota livre) | 2 |
| `habits` | Hábitos, checks e streaks desativáveis | §22 | LEG-F05 | 2 |
| `journal` | Diário com conteúdo criptografado; sem busca textual no MVP | §19 | LEG-S02, LEG-I02 | 2 |
| `body` | Peso, altura e medidas; IMC como ESTIMADO | §23 | LEG-M04 | 2 |
| `nutrition` | Refeições e água, sem metas restritivas | §25 | LEG-M04 | 4 |
| `activity` | Atividades, treinos de força e progressão | §26 | LEG-C02 | 4 |
| `medications` | Medicamentos informados pela pessoa e lembretes; sem doses ou interações | §24 | LEG-M02, LEG-S02 | 4 |
| `goals` | Metas com limites de segurança e tom neutro | §30 | LEG-M04, LEG-F05 | 4 |
| `timeline` | Linha do tempo pessoal e marcos | §31 | LEG-C02 | 4 |
| `twin` | Health Digital Twin: corpo 3D e cérebro 3D educacional | §15–§18 | LEG-M05 | 3 |
| `ai` | HealthMind AI: gate de consentimento, minimização, camada de saída, modo de risco | §27, §48 | LEG-I01–I08 | 5 |
| `recommendations` | Recomendações por regras, com motivo e pedido de revisão | §28 | LEG-D08, LEG-M04 | 5 |
| `reports` | Relatórios PDF/CSV/JSON com link expirando | §29 | LEG-D03 | 6 |
| `notifications` | Lembretes e notificações via JobQueue, sem insistência | §33 | LEG-F05 | 4 |
| `wellbeing` | Índice de Bem-Estar versionado (score_version) e explicável | §14 | LEG-D08 | 2 |
