# Adendo ao spec original (docs/PRODUCT_SPEC.md) — v4
Estas alterações SUBSTITUEM ou ACRESCENTAM ao spec. Em conflito, vale este adendo
(e, acima dele, docs/LEGAL_REQUIREMENTS.md).
v4 (ADR-0027): reorientação para o desenvolvimento corporal; humor e energia, diário, cérebro 3D, indicadores
neuroquímicos e medicamentos removidos.

## Substituições por seção do spec original
- §1 Visão: acrescentar o posicionamento de CLAUDE.md ("bem-estar, não dispositivo médico") e público 18+. Foco
  no desenvolvimento corporal, sem prescrição de dieta ou treino (ADR-0027, LEG-M08).
- §8 Header: atalho para a Central de Privacidade e indicador discreto "DEMO" quando em modo demonstração.
- §14 Índice de Bem-Estar: versão 2, sem humor e energia (ADR-0027, `docs/WELLBEING_SCORE.md`).
- §17, §18, §19, §21 e §24 (cérebro, neuroquímicos, diário, humor e energia, medicamentos): **removidos**
  (ADR-0027).
- §27 HealthMind AI: gate de consentimento (LEG-I01), painel "o que a IA verá" (LEG-I02), provedor com retenção
  zero/mínima (LEG-I03), camada de saída (LEG-I04), citação de dados (LEG-I05), modo de risco (LEG-I07).
- §28 Recomendações: respeitar LEG-M04, M06, M07 e M08. Nunca recomendar sobre medicamentos, condições
  clínicas, dietas restritivas, aparência ou perda de peso agressiva.
- §29 Relatórios: PDF/CSV/JSON seguem LEG-D03 (link expirando, autenticado). Rodapé fixo: "Gerado em {data}.
  Material de autoacompanhamento, não é laudo nem avaliação clínica." Nunca em storage público.
- §36 Segurança e LGPD: SUBSTITUÍDO integralmente por docs/LEGAL_REQUIREMENTS.md.
- §37 Arquitetura: manter a stack e acrescentar adaptadores, residência no Brasil inclusive da execução
  (LEG-S10), RLS com papéis `app_user`/`app_migrator` (LEG-S03) e sessões em banco (LEG-S04).
- §38 Banco de dados: manter as entidades e acrescentar `Session` (em banco), `ConsentRecord`, `PrivacyRequest`,
  `AuditLog`, `AccessLog`, `PolicyVersion`, `DataExportJob`. Todas com id, user_id (quando aplicável),
  created_at, updated_at. Campos sensíveis criptografados. Exclusão = marcação imediata + purga (LEG-D04).
  Sem `MoodEntry`, `JournalEntry`, `Medication*` nem `BrainIndicator` (ADR-0027).
- §39 Confiabilidade: MEDIDO/INFORMADO/ESTIMADO/INFERIDO/RECOMENDADO + DEMO.
- §40 Demonstração: (a) demo público sem login, dados 100% fictícios, sem coleta além dos registros técnicos
  mínimos (LEG-X02); (b) "Começar com meus próprios dados" leva ao onboarding da §52.
- §44 e §45 (comparação e modo apresentação): "Modo privacidade" que oculta valores numéricos sensíveis (peso,
  medidas, alimentação). Ativo por padrão no modo apresentação.
- §46 Personalização: Central de Privacidade (consentimentos por finalidade, o que a IA vê, retenção,
  exportação, exclusão, subprocessadores, sessões ativas, pedidos abertos).
- §51 Entrega: CI com lint/typecheck/testes/varredura de dependências/SAST, testes de isolamento RLS, teste de
  strings proibidas com allowlist `disclaimer.*`, checagem de retenção de backup ≤ `PURGE_DAYS`, docs de
  privacidade e runbooks.

## Novas seções
### §52 Onboarding, idade e consentimento
1. Boas-vindas curtas explicando o que o app faz e o que não faz (não é serviço médico).
2. Data de nascimento → bloqueio de menores sem persistir dado (LEG-F01).
3. Criação de conta, verificação de e-mail, oferta de MFA.
4. Consentimentos por finalidade, em telas claras, nunca pré-marcados (LEG-C01–C05). Mostrar o que é coletado,
   para quê, quem processa (subprocessadores e região) e como revogar.
5. Escolha entre "dados de demonstração" ou "começar do zero".
6. Primeira tela com estado vazio acolhedor, sem gráficos vazios.

### §53 Conteúdo jurídico e de ajuda
Páginas públicas: Política de Privacidade, Termos, Aviso de IA, Subprocessadores, Encarregado/Contato,
Declaração de finalidade. Todas com rótulo de rascunho enquanto não houver revisão (LEG-G04).

### §54 Bem-estar do usuário
Streaks e metas com tom neutro, opção de desativar, sem culpa (LEG-F05). Alertas de risco conforme §48 do spec
e LEG-I07. Metas de peso com limites de segurança (LEG-M04).

### §55 Imagem corporal e alimentação (requisito central, ADR-0027)
1. Guardrails em módulo puro (`src/modules/guardrails`), usados por metas, recomendações e IA (LEG-M04).
2. Nada julga o corpo: sem "corpo ideal", sem faixa de IMC na interface, sem comparação com outras pessoas, sem
   streak ligado a peso, peso e medidas ocultáveis (LEG-M06).
3. Alimentação sem juízo nem restrição (LEG-M07); sem prescrição de dieta ou treino (LEG-M08).
4. Apoio de crise onde faz sentido: quando um guardrail dispara, no modo de risco da IA e no acesso permanente
   "Precisa de ajuda?" do menu de ajuda (§48).
5. Glossário de termos proibidos ampliado para imagem corporal e alimentação (LEG-M03).
