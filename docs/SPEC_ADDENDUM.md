# Adendo ao spec original (docs/PRODUCT_SPEC.md) — v3
Estas alterações SUBSTITUEM ou ACRESCENTAM ao spec. Em conflito, vale este adendo
(e, acima dele, docs/LEGAL_REQUIREMENTS.md).

## Substituições por seção do spec original
- §1 Visão: acrescentar o posicionamento de CLAUDE.md ("bem-estar, não dispositivo médico") e público 18+.
- §8 Header: atalho para a Central de Privacidade e indicador discreto "DEMO" quando em modo demonstração.
- §17 e §18 (estado neurocomportamental e neuroquímicos): visão educacional. Não persistir como "medição":
  armazenar só o cálculo derivado e a versão do modelo; sempre exibir os avisos obrigatórios (namespace
  i18n `disclaimer.*`).
- §19 Diário: conteúdo criptografado em nível de campo (LEG-S02). **Sem busca textual no conteúdo no MVP**;
  filtros por data, humor numérico e tags não sensíveis. A análise por IA só ocorre com consentimento de IA
  ativo (LEG-I01/I02). Remover qualquer comportamento em que a IA leia o diário por padrão.
- §24 Medicamentos: registro e lembrete informados pelo usuário. Sem sugestão de dose, sem interações, aviso fixo
  (LEG-M02). Lembretes por e-mail/push via JobQueue (não depender do navegador aberto).
- §27 HealthMind AI: gate de consentimento (LEG-I01), painel "o que a IA verá" (LEG-I02), provedor com retenção
  zero/mínima (LEG-I03), camada de saída (LEG-I04), citação de dados (LEG-I05), modo de risco (LEG-I07).
- §28 Recomendações: respeitar LEG-M04. Nunca recomendar sobre medicamentos, condições clínicas ou dietas
  restritivas.
- §29 Relatórios: PDF/CSV/JSON seguem LEG-D03 (link expirando, autenticado). Rodapé fixo: "Gerado em {data}.
  Material de autoacompanhamento, não é laudo nem avaliação clínica." Nunca em storage público.
- §36 Segurança e LGPD: SUBSTITUÍDO integralmente por docs/LEGAL_REQUIREMENTS.md.
- §37 Arquitetura: manter a stack e acrescentar adaptadores, residência no Brasil inclusive da execução
  (LEG-S10), RLS com papéis `app_user`/`app_migrator` (LEG-S03) e sessões em banco (LEG-S04).
- §38 Banco de dados: manter as entidades e acrescentar `Session` (em banco), `ConsentRecord`, `PrivacyRequest`,
  `AuditLog`, `AccessLog`, `PolicyVersion`, `DataExportJob`. Todas com id, user_id (quando aplicável),
  created_at, updated_at. Campos sensíveis criptografados. Exclusão = marcação imediata + purga (LEG-D04).
  `BrainIndicator`: guardar apenas derivados, sem duplicar entradas.
- §39 Confiabilidade: MEDIDO/INFORMADO/ESTIMADO/INFERIDO/RECOMENDADO + DEMO.
- §40 Demonstração: (a) demo público sem login, dados 100% fictícios, sem coleta além dos registros técnicos
  mínimos (LEG-X02); (b) "Começar com meus próprios dados" leva ao onboarding da §52.
- §44 e §45 (comparação e modo apresentação): "Modo privacidade" que oculta valores numéricos sensíveis (peso,
  medidas, humor). Ativo por padrão no modo apresentação.
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
