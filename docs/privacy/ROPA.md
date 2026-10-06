# Registro das Operações de Tratamento (ROPA) — LGPD art. 37

> **RASCUNHO — revisão jurídica obrigatória.** `LEGAL-REVIEW` · Versão 0.1 (Fase 0) · LEG-G01
> Controlador: `{{CONTROLADOR}}` · Encarregado: `{{ENCARREGADO}}` · Contato: `{{CONTATO_ENCARREGADO}}`

Bases legais propostas conforme a matriz de `docs/LEGAL_REQUIREMENTS.md` §A (sujeitas a OPEN_ISSUES OI-01).
Atualizar este registro sempre que surgir nova finalidade, categoria de dado ou subprocessador.

| # | Operação | Finalidade | Titulares | Categorias de dados | Sensível? | Base legal proposta | Compartilhamento | Retenção | Medidas de segurança |
|---|---|---|---|---|---|---|---|---|---|
| T1 | Conta e autenticação | Criar e manter a conta | Usuários 18+ | Nome, e-mail, hash de senha, MFA, sessões | Não | Execução de contrato (art. 7º, V) | Hospedagem, banco, e-mail | Enquanto a conta existir; depois LEG-D04 | Hash forte, MFA, sessões revogáveis (LEG-S04) |
| T2 | Registros de bem-estar | Funcionamento do app | Usuários 18+ | Sono, humor, hábitos, diário, peso/medidas, alimentação, atividade, medicamentos informados | **Sim** | Consentimento específico (art. 11, I) | Hospedagem, banco | Enquanto a conta existir; purga em `PURGE_DAYS` após exclusão | RLS, criptografia de campo (LEG-S02/S03) |
| T3 | Assistente de IA | Conversa sobre os próprios dados | Usuários que consentiram | Agregados e trechos escolhidos | **Sim** | Consentimento próprio, padrão desligado | Provedor de LLM `{{LLM}}` | `{{RETENCAO_IA}}` | Minimização, camada de saída, logs só com metadados (LEG-I01–I08) |
| T4 | Registros de acesso | Obrigação legal, se aplicável | Usuários | IP, data/hora | Não | Marco Civil art. 15, se aplicável (OI-06) | Hospedagem | `ACCESS_LOG_RETENTION_DAYS` (180) | Tabela separada, expurgo automático (LEG-R02) |
| T5 | Segurança da conta | Prevenção a abuso | Usuários | Tentativas de login, IP | Não | Legítimo interesse (art. 7º, IX) | — | `{{RETENCAO_SEGURANCA}}` | Rate limiting (LEG-S05) |
| T6 | Prova de consentimento e pedidos do titular | Exercício regular de direitos | Usuários e ex-usuários | Registro de consentimento, pedidos (dados mínimos) | Não | Arts. 7º VI e 16 | — | `{{RETENCAO_PROVA}}` (OI-04) | AuditLog sem conteúdo (LEG-S06) |
| T7 | Lembretes e notificações | Parte do serviço consentido | Usuários | E-mail, horários, tipo de lembrete | Pode indicar saúde (medicamento) | Consentimento T2 | E-mail `{{EMAIL}}` | Enquanto ativo | E-mail sem conteúdo de saúde |
| T8 | Comunicações de marketing | Divulgação | Usuários que consentiram | E-mail | Não | Consentimento separado | E-mail `{{EMAIL}}` | Até revogação | Opt-in, revogação em 1–2 cliques |
| T9 | Métricas de produto | Melhoria do produto | Usuários | Agregados anônimos; identificador só com opt-in | Não | Anonimização / consentimento | — | `{{RETENCAO_METRICAS}}` | Sem trackers de terceiros |
| T10 | Exportação de dados | Portabilidade (art. 18) | Usuários | Todos os dados do titular | **Sim** | Obrigação legal / direito do titular | Storage `{{STORAGE}}` | Link expira em 24h | Download autenticado, nunca público (LEG-D03) |
