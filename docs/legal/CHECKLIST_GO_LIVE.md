# Checklist antes do go-live (em ordem de execução)

> Atualizado no fim da Fase 7 (ADR-0041). Tudo aqui depende de decisão humana, de contrato ou de um fornecedor que
> ainda não existe. Siga a ordem: cada etapa depende da anterior. Resumo em linguagem simples:
> `docs/ESTADO_DO_PROJETO.md`.
>
> **Quem faz:** **P** = responsável pelo produto · **J** = jurídico · **C** = revisão clínica (nutrição, educação
> física, psicologia) · **E** = encarregado (DPO) · **D** = desenvolvimento (pode ser feito com o Claude Code) ·
> **X** = empresa externa (pentest).

## Antes de publicar a demonstração (modo só demo, ADR-0043)

A demonstração pública vem antes do go-live do app completo e não depende das etapas abaixo. As demais pré-condições da
publicação estão na OI-38.

- [ ] **0.1 (P, D)** Criar um e-mail próprio do projeto e trocar por ele o e-mail pessoal do responsável em
  `src/config/demo.ts` (página `/demo/sobre`), no teste `e2e/demo-only/demo-only.spec.ts` e no ADR-0043 (D4, em
  `docs/DECISIONS.md`) (OI-38 h).

## Etapa 1 — Pessoas e decisões de base

- [ ] **1.1 (P, J)** Definir o controlador (pessoa física ou jurídica). Decide se o art. 15 do Marco Civil se aplica
  aos registros de acesso (LEG-R02, OI-06).
- [ ] **1.2 (P)** Nomear o encarregado (DPO) e criar o canal de contato público (LEG-G03, OI-12).
- [ ] **1.3 (P)** Contratar a revisão jurídica especializada (LGPD, ECA Digital, enquadramento ANVISA) e entregar
  `docs/legal/PACOTE_JURIDICO.md`, com ROPA, RIPD, RETENTION, SUBPROCESSORS e INTENDED_USE.
- [ ] **1.4 (P)** Contratar a revisão clínica dos textos de saúde, das fórmulas (Índice de Bem-Estar, estimativa de calorias), dos
  limites de segurança (guardrails), do modelo 3D e
  dos fluxos de apoio (PACOTE_JURIDICO, tema 10), em paralelo com o jurídico.
- [ ] **1.5 (J, C)** Responder o pacote. Cada resposta vai para OPEN_ISSUES ("Resolvidas") e, se mudar o produto, para
  um ADR. Os temas 🔴 bloqueiam a etapa 4.
- [ ] **1.6 (D)** Aplicar as respostas: textos novos (versões com aviso ou reconsentimento, ADR-0031/0041), prazos,
  limiares e recursos que mudarem. Testes e `privacy-reviewer` a cada mudança.

- [ ] **1.7 (P)** Incluir um revisor jurídico e um clínico no CODEOWNERS dos textos (`messages/`, `disclaimer.*`) e
  exigir aprovação de Code Owners na branch `main` (OI-13; em repositório privado, exige plano pago do GitHub).
- [ ] **1.8 (P, J)** Preencher controlador e encarregado **antes do beta**, para que nenhum titular real veja os
  placeholders (PACOTE_JURIDICO, tema 2).

## Etapa 2 — Fornecedores (todos com região no Brasil, salvo e-mail e erros)

- [ ] **2.1 (P)** Escolher hospedagem (web, worker e logs), banco gerenciado (com backups e PITR), storage de objetos,
  storage só de acréscimo para os livros de reaplicação, KMS, gerenciador de segredos, e-mail transacional e
  ferramenta de erros (ou ficar no log da hospedagem). Regiões exigidas em `infra/regions.json` (LEG-S10, OI-11).
- [ ] **2.2 (J)** Assinar os contratos de tratamento (DPA) com cada fornecedor e definir o mecanismo do art. 33 para os
  serviços fora do Brasil, sem depender de consentimento do titular (OI-03).
- [ ] **2.3 (D)** Preencher os placeholders de fornecedor (`docs/legal/PLACEHOLDERS.md`), SUBPROCESSORS e a página
  pública; atualizar a Política se ela mudar.
- [ ] **2.4 (D)** Implementar os adaptadores reais: `KmsProvider` (decifrando com vários `keyId`, com script de
  recifragem testado, `docs/runbooks/KEY_ROTATION.md`), `StorageProvider` (inclusive `list` por prefixo,
  OI-35), `MailProvider` e, se houver, o `ErrorReporter` do fornecedor. Hoje o `parseEnv` recusa em produção os
  adaptadores locais e a fila em memória (ADR-0036): **sem isso, produção não sobe.**
- [ ] **2.5 (D)** Lista fechada de nomes de erro junto com a ferramenta escolhida (7d-N4) e revisão do filtro do log
  da hospedagem para a escrita direta de dependências em `stdout` (7e-N1).

- [ ] **2.6 (D)** Conta sem onboarding cujo aviso por e-mail nunca sai (ex.: endereço que rejeita sempre) fica sem
  prazo (7f-R1): prazo-teto ou alerta, junto do provedor de e-mail.

## Etapa 3 — Infraestrutura

- [ ] **3.1 (D, P)** Provisionar seguindo `docs/runbooks/PROVISIONING.md`; conferir cada componente de
  `infra/regions.json` e `infra/retention.json` na configuração real; descobrir o `CLIENT_IP_HEADER` da plataforma;
  depois, Terraform (ADR-0036 D1).
- [ ] **3.2 (D)** Subir o worker dedicado dos jobs, sem entrada pública (OI-14 a, `docs/runbooks/WORKER_DEPLOY.md`): só
  ele com `WORKER_DATABASE_URL`; as instâncias web com `JOB_WORKER=off` e sem essa credencial. Sem isso, a separação
  de papéis do ADR-0037 não vale por inteiro (o `parseEnv` recusa a credencial na web com `JOB_WORKER=off`).
- [ ] **3.3 (D, P)** Backups: retenção ≤ prazo de purga e PITR conforme `infra/retention.json`; `BACKUP_ENCRYPTION_KEY`
  no gerenciador de segredos, fora do provedor dos backups; `pnpm backup:ledger` de hora em hora (papel `app_backup`)
  no storage só de acréscimo (P7-M3, 7e-R1).
- [ ] **3.4 (D)** Regra de ciclo de vida de 2 dias no prefixo `exports/` do storage (OI-35).
- [ ] **3.5 (D, P)** Primeiro ensaio de restauração no provedor, com a reaplicação (`docs/runbooks/BACKUP_RESTORE.md`,
  parte 3), registrado (LEG-S07).
- [ ] **3.6 (P, E)** Criar um papel `operador_<nome>` por pessoa que atende pedidos
  (`docs/runbooks/OPERATOR_CREDENTIALS.md`), nunca reutilizar um nome, definir de onde se conectam e decidir o duplo
  controle das exclusões pedidas fora do app (ADR-0037, OI-34, 7b-R3).
- [ ] **3.7 (D)** Ligar os alertas `alert.read_volume_anomaly`, `alert.operator_volume_anomaly`, `error.request` e
  `error.job` a um canal fora da aplicação, junto do log do servidor do banco (`RAISE LOG`; pgaudit se o provedor
  oferecer) (ADR-0038, `docs/runbooks/ALERTS.md`).
- [ ] **3.8 (P)** Definir a periodicidade de rotação de chaves e credenciais (`docs/runbooks/KEY_ROTATION.md`) e os
  contatos de incidente (`docs/runbooks/INCIDENT.md`); criar um papel só de leitura de `audit_logs` e `access_logs`
  para investigação (7f-R2).

## Etapa 4 — Validação

- [ ] **4.1 (X, D)** Pentest independente num ambiente igual ao de produção, só com dados sintéticos (escopo em
  `docs/security/PENTEST_SCOPE.md`, contexto em `docs/security/THREAT_MODEL.md`), com atenção especial ao **módulo de
  autenticação próprio** (ADR-0014): sessões (fixação e revogação), enumeração de e-mail e diferença de tempo de
  resposta, contorno dos limites de tentativa (IP, variações de maiúsculas no e-mail), TOTP (reuso e força bruta), códigos de recuperação, tokens de
  verificação e de redefinição, funções SECURITY DEFINER e RLS, CSRF e CSP, cookie de aparelho conhecido (falsificação, reuso entre contas) e guarda de
  consentimento (`app.has_active_consent`, ADR-0019). Tratar os achados.
- [ ] **4.2 (P, D)** Rodada manual de acessibilidade com NVDA e celular real (`docs/qa/ROTEIRO_MANUAL.md`, ADR-0036 D7) e
  correção do que ela achar (LEG-X01); medir de novo o dashboard no celular real e na região da hospedagem (§41,
  `perf-budget.json`).
- [ ] **4.3 (E)** Parecer do encarregado no RIPD (probabilidades e riscos residuais propostos) e aprovação
  (`docs/privacy/RIPD.md`, seções 5 e 6).
- [ ] **4.4 (J, D)** Com os textos aprovados, retirar o rótulo "RASCUNHO" das páginas públicas (`DraftBanner`) e as marcas
  `LEGAL-REVIEW` resolvidas.

## Etapa 5 — Lançamento

- [ ] **5.1 (P, E)** Canal de suporte e de atendimento a titulares com prazo compatível com 15 dias (LEG-D07).
- [ ] **5.2 (P)** Beta fechado com poucos adultos. Durante o beta, calibrar os tetos de `VOLUME_LIMITS` com o tráfego
  real (ADR-0038).
- [ ] **5.3 (P)** Abertura ao público.
