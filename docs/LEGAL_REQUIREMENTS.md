# Requisitos legais rastreáveis — HealthMind 360 (v3)
Status: RASCUNHO técnico. Validação jurídica pendente (`LEGAL-REVIEW`).
Este documento traduz requisitos legais em requisitos técnicos. **Não é parecer jurídico.**

## A. Matriz de bases legais (LGPD)

| Tratamento | Base legal proposta | Observações |
|---|---|---|
| Conta e autenticação (nome, e-mail, credenciais) | Execução de contrato (art. 7º, V) | Dados não sensíveis |
| Dados de saúde e bem-estar (sono, peso, medidas, humor, diário, alimentação, atividade, medicamentos informados) | **Consentimento específico e destacado (art. 11, I)** | A "tutela da saúde" (art. 11, II, f) é restrita a procedimentos por profissionais/serviços de saúde ou autoridade sanitária; não presumir que se aplica |
| Envio de dados ao provedor de LLM | Consentimento próprio, separado, padrão desligado | Provedor fora do Brasil: art. 33 e regulamento da ANPD sobre transferência internacional |
| Registros de acesso (IP + data/hora) | Obrigação legal (Marco Civil, art. 15 — 6 meses) **se aplicável** | O art. 15 alcança provedor de aplicação constituído como pessoa jurídica com fins econômicos. Depende da definição do controlador (ver LEG-R02) |
| Segurança da conta e prevenção a abuso | Legítimo interesse (art. 7º, IX) | Somente dados não sensíveis |
| Métricas de produto | Anonimizado/agregado; opt-in se houver identificador | Sem trackers de terceiros |
| Lembretes e notificações do serviço | Parte do serviço consentido | Marketing = consentimento separado |
| Prova de consentimento e de pedidos do titular | Exercício regular de direitos / obrigação legal (arts. 7º VI, 16) | Retido mesmo após exclusão, com dados mínimos |

Vedação: não comunicar nem compartilhar dados de saúde com outros controladores para obter vantagem
econômica (art. 11, §4º). Sem venda, sem publicidade, sem data brokers.

## B. Requisitos (cite o ID em commits, PRs e testes)

### B1. Consentimento
- LEG-C01 Entidade `ConsentRecord` (user_id, purpose, policy_version, text_hash, granted_at, revoked_at).
- LEG-C02 Finalidades separadas: (1) dados de saúde para o funcionamento do app; (2) compartilhamento com IA;
  (3) transferência internacional (se aplicável); (4) comunicações de marketing; (5) métricas de produto com
  identificador. Cada uma com checkbox próprio, nunca pré-marcado.
- LEG-C03 Consentimento genérico é inválido: cada texto descreve finalidade, dados e consequências.
- LEG-C04 Revogar é tão fácil quanto conceder (Central de Privacidade, 1–2 cliques). A revogação interrompe
  imediatamente o tratamento futuro correspondente (inclusive a IA).
- LEG-C05 Recusar IA, marketing ou métricas não bloqueia o restante do app.
- LEG-C06 Nova versão substancial de política/consentimento → reconsentimento antes de continuar.

### B2. Direitos do titular (art. 18) — Central de Privacidade
- LEG-D01 Confirmação e acesso: tela que lista todos os dados tratados, por categoria.
- LEG-D02 Correção: todo dado editável, com histórico.
- LEG-D03 Portabilidade/exportação: JSON e CSV estruturados, geração assíncrona, link expira em 24h,
  download autenticado, nunca em storage público.
- LEG-D04 Eliminação: exclusão de conta com confirmação reforçada. Acesso cortado na hora; purga definitiva
  dos dados primários em até `PURGE_DAYS` (padrão 30). **Os backups precisam expirar dentro do mesmo prazo**
  (ver LEG-S07). Mantém apenas o mínimo exigido por lei (LEG-R03).
- LEG-D05 Anonimização: opção de anonimizar dados para uso estatístico (art. 12) em vez de excluir.
- LEG-D06 Informação sobre compartilhamento: página pública e na conta com subprocessadores e finalidades.
- LEG-D07 Registro de cada pedido (`PrivacyRequest`) com status e prazos: confirmação imediata em formato
  simplificado; declaração completa em até 15 dias (art. 19, II).
- LEG-D08 Revisão de decisões automatizadas (art. 20): Health Score e recomendações têm explicação de critérios
  e canal "pedir revisão".

### B3. Crianças e adolescentes
Contexto: o ECA Digital (Lei 15.211/2025), fiscalizado pela ANPD, alcança serviços digitais com acesso provável
por menores. A LGPD (art. 14) exige melhor interesse e consentimento parental para crianças.
`LEGAL-REVIEW`: confirmar vigência e obrigações aplicáveis na data do lançamento.
**Decisão de produto: HealthMind é exclusivo para 18+.**
- LEG-F01 Cadastro exige data de nascimento. Menor de 18 → bloquear criação de conta, não persistir nenhum dado
  do menor (nem a data informada) e exibir mensagem neutra e acolhedora. Para desencorajar nova tentativa
  imediata, usar apenas um cookie de sessão sem identificador, nunca registro em banco.
- LEG-F02 Linguagem, visual e marketing não direcionados a crianças/adolescentes. `LEGAL-REVIEW`: avaliar se isso
  e a autodeclaração bastam para o risco de "acesso provável".
- LEG-F03 `AgeSignalProvider` (interface) para consumir futuramente o sinal de idade de lojas/SO.
- LEG-F04 Conta de pessoa que se descobre menor → fluxo de encerramento e eliminação.
- LEG-F05 Engajamento sem manipulação: streaks desativáveis, sem mensagens punitivas, sem notificações
  insistentes, sem recompensa aleatória.

### B4. Segurança (arts. 46–49)
- LEG-S01 TLS em todo tráfego; criptografia em repouso; criptografia de campo nos campos sensíveis (LEG-S02).
- LEG-S02 Campos sensíveis criptografados (AES-256-GCM, envelope via `KmsProvider`): diário, notas, medicamentos,
  humor livre, mensagens da IA. Campos criptografados não são pesquisáveis no banco: no MVP não há busca textual
  no conteúdo desses campos.
- LEG-S03 RLS no PostgreSQL + autorização na aplicação. Runtime conecta como `app_user` (não é dono das tabelas,
  sem BYPASSRLS); migrações como `app_migrator`. Toda consulta a dados de usuário roda em transação com
  `SET LOCAL app.user_id`; sem esse valor, as políticas retornam zero linhas. Teste automatizado de isolamento
  entre dois usuários e teste de "consulta sem contexto retorna vazio".
- LEG-S04 Verificação de e-mail, recuperação segura de senha, MFA (TOTP) com códigos de recuperação, limite de
  tentativas, **sessões armazenadas em banco**, listáveis e revogáveis individualmente (revogação vale na próxima
  requisição), cookies HttpOnly/Secure/SameSite. JWT sem registro em banco não atende este requisito.
- LEG-S05 Rate limiting, CSRF, CSP e demais security headers, validação Zod em toda API.
- LEG-S06 `AuditLog` de acesso/exportação/exclusão de dados sensíveis (quem, quando, recurso). Sem conteúdo.
- LEG-S07 Backups criptografados, **com retenção menor ou igual a `PURGE_DAYS`** (LEG-D04), restauração testada.
  Segredos fora do repositório. Teste/checagem de configuração que falha se a retenção de backup exceder o prazo.
- LEG-S08 Plano de incidentes (docs/runbooks/INCIDENT.md): classificação, contenção, comunicação à ANPD e aos
  titulares quando houver risco ou dano relevante, no prazo regulamentado, e registro interno.
  `LEGAL-REVIEW`: confirmar o prazo vigente no regulamento da ANPD.
- LEG-S09 Varredura de dependências e SAST no CI.
- LEG-S10 Residência de dados: banco, storage, filas, jobs **e execução das funções/servidores** em região no
  Brasil. Todo serviço que processe dados fora do Brasil (inclusive logs da plataforma de hospedagem, e-mail,
  monitoramento de erros e LLM) consta em docs/privacy/SUBPROCESSORS.md com finalidade, região e dados envolvidos.

### B5. Governança documental (rascunhos para revisão jurídica)
- LEG-G01 docs/privacy/ROPA.md — registro das operações de tratamento (art. 37).
- LEG-G02 docs/privacy/RIPD.md — relatório de impacto (art. 38).
- LEG-G03 Encarregado (art. 41): página pública com canal de contato, nome como `{{ENCARREGADO}}`.
- LEG-G04 Rascunhos com placeholders `{{...}}`: Política de Privacidade, Termos de Uso, Aviso de Consentimento
  por finalidade, Política de Cookies, Aviso de IA, lista de subprocessadores. Cada um versionado
  (`PolicyVersion`) e marcado "RASCUNHO — revisão jurídica obrigatória".
- LEG-G05 docs/INTENDED_USE.md — declaração de finalidade pretendida (ver B7).

### B6. IA (HealthMind AI)
- LEG-I01 Sem consentimento de IA ativo, nenhum dado é enviado ao LLM e o chat explica como ativar.
- LEG-I02 Minimização: enviar agregados e resumos; texto bruto do diário só se o usuário selecionar explicitamente
  o trecho/período. Painel "o que a IA verá".
- LEG-I03 Provedor via `LlmProvider`, com contrato de tratamento (DPA), sem uso para treino, **retenção zero ou
  a menor disponível no provedor (inclusive logs de abuso), com prazo documentado**, e região documentada.
  Registrar em SUBPROCESSORS.md.
- LEG-I04 Camada de saída: bloquear/reescrever diagnósticos, afirmações de neuroquímica, recomendação de dose ou
  mudança de medicação. Linguagem de associação, nunca de causa/diagnóstico.
- LEG-I05 Toda resposta cita os dados usados e rotula "Gerado por IA" + selo INFERIDO/RECOMENDADO.
- LEG-I06 Defesa contra prompt injection (diário e notas são entrada não confiável); a IA não executa ações nem
  altera dados.
- LEG-I07 Detecção de sinais de risco → interromper o fluxo normal e mostrar orientação (CVV 188, SAMU 192).
- LEG-I08 Cota por usuário e rate limit. Logs só com metadados (tokens, latência, modelo), nunca conteúdo.

### B7. Posicionamento regulatório (ANVISA / dispositivo médico)
- LEG-M01 INTENDED_USE.md: bem-estar e autoacompanhamento; não diagnostica, não trata, não monitora doença, não
  recomenda ajuste terapêutico. `LEGAL-REVIEW`: avaliar enquadramento frente à RDC 657/2022.
- LEG-M02 Medicamentos = registro e lembrete informados pelo usuário. Sem base de interações, sem sugestão de dose,
  sem alteração automática. Aviso fixo: "Siga a orientação do seu prescritor."
- LEG-M03 Teste automatizado que falha se strings de interface contiverem alegações clínicas proibidas. O teste
  ignora o namespace i18n `disclaimer.*`, reservado aos avisos obrigatórios (que contêm negações como
  "não diagnostica doenças"). Qualquer chave nova em `disclaimer.*` exige revisão no PR.
- LEG-M04 Guardrails de bem-estar nas metas e recomendações: não sugerir meta que leve a IMC abaixo de 18,5,
  déficits calóricos agressivos ou jejuns prolongados; sinais de padrão alimentar preocupante → orientação
  profissional, sem números restritivos.
- LEG-M05 Cérebro 3D e "indicadores neuroquímicos": sempre educacionais, com os avisos obrigatórios, nunca como
  medição.

### B8. Retenção e logs
- LEG-R01 Dados de saúde: enquanto a conta existir; depois, LEG-D04.
- LEG-R02 Registros de acesso a aplicações: 6 meses, em tabela separada, com job de expurgo. Implementar como
  configurável (`ACCESS_LOG_RETENTION_DAYS`). Se o jurídico concluir que o art. 15 do Marco Civil não se aplica
  ao controlador, reduzir ao mínimo necessário para segurança.
- LEG-R03 Prova de consentimento e de pedidos do titular: mantida com dados mínimos pelo prazo definido pelo
  jurídico (`LEGAL-REVIEW`).
- LEG-R04 Logs de aplicação sem dados pessoais de saúde; remoção de PII em ferramentas de erro.

### B9. Outros
- LEG-X01 Acessibilidade WCAG 2.2 AA (Lei Brasileira de Inclusão, art. 63).
- LEG-X02 Demo: usuário fictício rotulado DEMO; dados 100% fictícios. Modo demo público sem login e sem coleta
  além dos registros técnicos mínimos da hospedagem (IP/requisição), que seguem LEG-R02/R04.
- LEG-X03 Se houver cobrança no futuro: cancelamento fácil e preços claros (CDC). Fora do MVP.
- LEG-X04 Integrações futuras (wearables, Apple Health, Health Connect) = nova finalidade, novo consentimento e
  nova revisão do RIPD antes de ativar.

## C. Pontos para validação jurídica
1. Base legal para dados de saúde em app de bem-estar (consentimento vs. outras hipóteses).
2. Suficiência do age gate de 18+ frente ao ECA Digital e à fiscalização da ANPD.
3. Transferência internacional para o provedor de LLM e demais subprocessadores fora do Brasil.
4. Prazos de retenção (prova de consentimento, backups, logs) e de comunicação de incidentes.
5. Enquadramento regulatório (SaMD) das funcionalidades de medicamentos, metas e recomendações.
6. Definição do controlador (pessoa física ou jurídica) e, a partir dela, aplicabilidade do art. 15 do Marco Civil.
7. Textos finais de política, termos e consentimentos.
