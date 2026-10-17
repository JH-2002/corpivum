# Requisitos legais rastreáveis — HealthMind 360 (v5)
Status: RASCUNHO técnico. Validação jurídica pendente (`LEGAL-REVIEW`).
Este documento traduz requisitos legais em requisitos técnicos. **Não é parecer jurídico.**
v4 (ADR-0027): reorientação para o desenvolvimento corporal. LEG-M02 e LEG-M05 revogados; LEG-M04 reescrito;
novos LEG-M06, LEG-M07 e LEG-M08. IDs revogados não são reaproveitados.
v5 (ADR-0030): sem assistente de IA e sem recomendações automáticas. LEG-I01 a LEG-I08 revogados; itens (2) e
(3) de LEG-C02 revogados; LEG-M04 e LEG-M08 reescritos sem recomendações.

## A. Matriz de bases legais (LGPD)

| Tratamento | Base legal proposta | Observações |
|---|---|---|
| Conta e autenticação (nome, e-mail, credenciais) | Execução de contrato (art. 7º, V) | Dados não sensíveis |
| Dados de saúde e bem-estar (peso, medidas, sono, hábitos, alimentação, atividade informados) | **Consentimento específico e destacado (art. 11, I)** | A "tutela da saúde" (art. 11, II, f) é restrita a procedimentos por profissionais/serviços de saúde ou autoridade sanitária; não presumir que se aplica |
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
- LEG-C02 Finalidades separadas: (1) dados de saúde para o funcionamento do app; (2) **revogado (ADR-0030)**:
  compartilhamento com IA; (3) **revogado (ADR-0030)**: transferência internacional por consentimento; (4)
  comunicações de marketing; (5) métricas de produto com identificador. Cada uma com checkbox próprio, nunca
  pré-marcado. A numeração não muda; reintroduzir uma finalidade exige nova ADR e nova versão do consentimento.
- LEG-C03 Consentimento genérico é inválido: cada texto descreve finalidade, dados e consequências.
- LEG-C04 Revogar é tão fácil quanto conceder (Central de Privacidade, 1–2 cliques). A revogação interrompe
  imediatamente o tratamento futuro correspondente.
- LEG-C05 Recusar marketing ou métricas não bloqueia o restante do app.
- LEG-C06 Nova versão substancial de política/consentimento → reconsentimento antes de continuar. Versão não
  substancial (só remove funcionalidade, sem ampliar o tratamento) → aviso informativo único e registro de ciência,
  sem bloquear (ADR-0031; `LEGAL-REVIEW`, OI-30).

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
- LEG-D08 Revisão de decisões automatizadas (art. 20): o Índice de Bem-Estar (Health Score) tem explicação de
  critérios e canal "pedir revisão". Não há recomendações automáticas (ADR-0030).

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
- LEG-S02 Campos sensíveis criptografados (AES-256-GCM, envelope via `KmsProvider`): notas livres dos registros.
  Campos criptografados não são pesquisáveis no banco: no MVP não há busca textual
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
  monitoramento de erros) consta em docs/privacy/SUBPROCESSORS.md com finalidade, região e dados envolvidos.

### B5. Governança documental (rascunhos para revisão jurídica)
- LEG-G01 docs/privacy/ROPA.md — registro das operações de tratamento (art. 37).
- LEG-G02 docs/privacy/RIPD.md — relatório de impacto (art. 38).
- LEG-G03 Encarregado (art. 41): página pública com canal de contato, nome como `{{ENCARREGADO}}`.
- LEG-G04 Rascunhos com placeholders `{{...}}`: Política de Privacidade, Termos de Uso, Aviso de Consentimento
  por finalidade, Política de Cookies, lista de subprocessadores. Cada um versionado
  (`PolicyVersion`) e marcado "RASCUNHO — revisão jurídica obrigatória". Catálogo dos placeholders:
  `docs/legal/PLACEHOLDERS.md`; a Política de Cookies é a seção "Cookies e armazenamento no navegador" da Política
  de Privacidade v2 (ADR-0041).
- LEG-G05 docs/INTENDED_USE.md — declaração de finalidade pretendida (ver B7).

### B6. IA (revogada)
O produto não tem assistente de IA nem envia dados a modelo de linguagem (ADR-0030). Os IDs ficam reservados.
Reintroduzir IA exige nova ADR, novo consentimento próprio, revisão do RIPD, ROPA e SUBPROCESSORS e requisitos
com IDs novos.
- LEG-I01 **Revogado (ADR-0030).** Consentimento de IA antes de enviar dados ao LLM.
- LEG-I02 **Revogado (ADR-0030).** Minimização do envio à IA e painel "o que a IA verá".
- LEG-I03 **Revogado (ADR-0030).** Provedor de LLM com DPA, sem treino e retenção mínima.
- LEG-I04 **Revogado (ADR-0030).** Camada de saída da IA. A proibição de diagnóstico, neuroquímica, dose e
  prescrição continua em LEG-M01, LEG-M03, LEG-M04 e LEG-M08 para todo texto do app.
- LEG-I05 **Revogado (ADR-0030).** Rótulo "Gerado por IA" e citação dos dados nas respostas.
- LEG-I06 **Revogado (ADR-0030).** Defesa contra prompt injection.
- LEG-I07 **Revogado (ADR-0030).** Detecção de sinais de risco no chat. A orientação de apoio (CVV 188, SAMU 192)
  continua contextual, por LEG-M04 e CLAUDE.md regra 9.
- LEG-I08 **Revogado (ADR-0030).** Cota e rate limit da IA; metadados de IA em log.

### B7. Posicionamento regulatório (ANVISA / dispositivo médico)
- LEG-M01 INTENDED_USE.md: bem-estar e autoacompanhamento; não diagnostica, não trata, não monitora doença, não
  recomenda ajuste terapêutico. `LEGAL-REVIEW`: avaliar enquadramento frente à RDC 657/2022.
- LEG-M02 **Revogado (ADR-0027).** Medicamentos saíram do produto. Reintroduzir exige nova ADR e novo requisito.
- LEG-M03 Teste automatizado que falha se strings de interface contiverem alegações clínicas proibidas. O teste
  ignora o namespace i18n `disclaimer.*`, reservado aos avisos obrigatórios (que contêm negações como
  "não diagnostica doenças"). Qualquer chave nova em `disclaimer.*` exige revisão no PR.
- LEG-M04 **Requisito central.** Guardrails de metas e de alimentação, em módulo puro testado
  (`src/modules/guardrails`) e usado por toda meta e todo registro com caloria. O app não faz recomendações
  automáticas (ADR-0030):
  - não aceitar meta de peso que leve a IMC abaixo de 18,5;
  - não aceitar ritmo de perda de peso acima do limite semanal definido no módulo;
  - não sugerir déficit calórico nem jejum, e não aceitar meta calórica abaixo do piso;
  - meta bloqueada ou sinal de padrão alimentar preocupante → mensagem acolhedora com orientação para buscar
    profissional de saúde (e CVV 188 / SAMU 192, §48), sem números restritivos e sem propor alternativa
    "mais leve" da mesma restrição.
  Limiares numéricos: rascunho com revisão clínica obrigatória (`LEGAL-REVIEW`, OI-23).
- LEG-M05 **Revogado (ADR-0027).** Cérebro 3D e indicadores neuroquímicos saíram do produto. Continua proibido
  afirmar estado cerebral ou nível de neurotransmissor (LEG-M03).
- LEG-M06 Imagem corporal: nenhum texto, cor ou visual julga o corpo. Sem "corpo ideal", sem classificação ou faixa
  de IMC na interface, sem comparação com outras pessoas ou com médias da população, sem antes/depois com juízo
  (diferenças só em número, seta e palavra), sem streak ou recompensa ligados a peso, opção de ocultar peso e
  medidas. O modelo 3D usa só as medidas informadas, nunca o peso. Termos proibidos no teste de LEG-M03.
- LEG-M07 Alimentação: registro sem juízo. Sem rótulo de comida "boa", "ruim", "proibida" ou "lixo", sem contagem
  de calorias ligada por padrão, sem meta calórica abaixo do piso definido no módulo de guardrails, sem
  recomendação de jejum, dieta restritiva ou compensação por exercício.
- LEG-M08 Profissões regulamentadas: o app não prescreve dieta, plano alimentar nem treino (atividades de
  nutricionista, Lei 8.234/1991, e de profissional de educação física, Lei 9.696/1998). Registra o que a pessoa
  informa e não sugere ações (sem recomendações automáticas, ADR-0030). Textos educativos gerais continuam
  `LEGAL-REVIEW` (OI-23).

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
3. Transferência internacional para subprocessadores fora do Brasil (e-mail transacional e monitoramento de
   erros, sem dado de saúde): base do art. 33 sem consentimento do titular (OI-03).
4. Prazos de retenção (prova de consentimento, backups, logs) e de comunicação de incidentes.
5. Enquadramento regulatório (SaMD) das funcionalidades de metas; limite entre texto educativo geral e
   prescrição de dieta ou treino (profissões regulamentadas, LEG-M08).
6. Definição do controlador (pessoa física ou jurídica) e, a partir dela, aplicabilidade do art. 15 do Marco Civil.
7. Textos finais de política, termos e consentimentos.
