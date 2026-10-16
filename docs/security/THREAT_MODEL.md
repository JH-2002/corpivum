# Threat model — HealthMind 360

> **RASCUNHO.** Versão 0.1 (Fase 7a, ADR-0036). Requisitos: LEG-S01–S10, LEG-R04, LEG-D03, LEG-D04.
> Escopo atual: desenvolvimento corporal, sem IA nem recomendações automáticas (ADR-0027, ADR-0030).
> Revisar a cada fase que mude uma fronteira de confiança, um fornecedor ou um fluxo de dado sensível.
> Entrada do pentest: `docs/security/PENTEST_SCOPE.md`.

## 1. Método

STRIDE por fronteira de confiança. Para cada ameaça: o controle que existe hoje (com o ADR ou o teste que o prova),
o risco residual e, quando há trabalho, o ID do achado que o acompanha (`OPEN_ISSUES.md`) ou um ID novo `TM-xx`
(seção 7). Severidade do residual: **Alta** (exposição de dado de saúde ou tomada de conta sem pré-requisito forte),
**Média** (exige pré-requisito, como sessão roubada ou acesso ao servidor), **Baixa** (impacto limitado ou só
disponibilidade).

## 2. Ativos

| Ativo | Classificação | Onde fica |
|---|---|---|
| Dados de bem-estar: peso, altura, medidas, sono, hábitos, alimentação, atividade, metas, lembretes | Sensível (art. 11) | Tabelas de saúde com RLS + consentimento; textos livres cifrados em campo (ADR-0016, ADR-0021) |
| Arquivos de exportação e relatórios | Sensível | `StorageProvider`, `exports/<userId>/<jobId>.bin`, cifrados com envelope, link ≤ 24 h (ADR-0032) |
| Credenciais: hash Argon2id, segredo TOTP (cifrado), hashes de códigos de recuperação, tokens de sessão, verificação e reset (só hash) | Crítico | `users`, `sessions`, tabelas de tokens (ADR-0014) |
| Segredos de servidor: `SESSION_SECRET`, `RATE_LIMIT_SECRET`, chave mestra do KMS, URLs do banco | Crítico | Ambiente da hospedagem (`{{SEGREDOS}}`), nunca no repositório (gitleaks na CI) |
| Provas: consentimentos, aceites, pedidos do titular, AuditLog | Prova legal | Tabelas sem FK para `users`, sem leitura pelo runtime (ADR-0019) |
| AccessLog (IP + data/hora) | Pessoal | `access_logs`, escrito só por função, 180 dias (LEG-R02, OI-06) |
| E-mail da conta | Pessoal | `users`; enviado ao provedor de e-mail |
| Backups do banco | Tudo acima | Provedor do banco, ≤ `PURGE_DAYS`, cifrados (LEG-S07, `infra/retention.json`) |
| Metadado de uso: quais telas a pessoa abre, horários de lembrete | Pode indicar rotina de saúde | Logs da hospedagem, provedor de e-mail (ROPA T7, OI-03) |

## 3. Atores

| Ator | Capacidade presumida |
|---|---|
| A1 Visitante anônimo | Acessa as rotas públicas (`/entrar`, `/cadastro`, `/legal`, `/demo`…), automatiza requisições |
| A2 Pessoa com conta (atacante) | Sessão válida própria; tenta ler ou alterar dado de outra conta (IDOR, RLS) |
| A3 Quem obteve a sessão da vítima | Cookie roubado ou aparelho compartilhado desbloqueado |
| A4 Quem conhece o e-mail da vítima | Enumeração, bloqueio de conta, assédio por e-mail, força bruta |
| A5 Quem está perto da tela | Vê a tela num lugar público (motivação do modo privacidade e do modo apresentação, LEG-M06) |
| A6 Operador (encarregado) | Credencial `app_operator` para pedidos manuais (ADR-0034) |
| A7 Funcionário ou invasor de subprocessador | Acesso a logs da hospedagem, ao provedor de e-mail ou de erros, a backups |
| A8 Invasor do servidor de aplicação | Executa código como o runtime (`app_user`), lê o ambiente |
| A9 Dependência comprometida | Código malicioso no build ou no navegador (cadeia de suprimentos) |

## 4. Fronteiras e fluxos

```
 Navegador ──TLS──▶ Hospedagem (proxy/CDN, logs) ──▶ App Next.js (Node, região BR)
   │  cookies __Host-*                                 │  proxy.ts: CSP com nonce, redireciona sem cookie
   │  localStorage (tema, variante do twin, tour)      │  requireSession: sessão validada no banco a cada requisição
   │                                                   │
   │                                     ┌─────────────┼──────────────┬─────────────────┐
   │                                     ▼             ▼              ▼                 ▼
   │                         PostgreSQL (app_user,  KmsProvider   StorageProvider   MailProvider ──▶ e-mail (provável fora do BR)
   │                         RLS + SET LOCAL;       (DEK por      (exports/,         ErrorReporter ──▶ log filtrado (7c); fornecedor no CHECKLIST
   │                         SECURITY DEFINER       escrita)      cifrado)
   │                         no pré-login)
   │                                     ▲
   │                         Fila job_queue ◀── jobs (hoje no mesmo processo; worker dedicado na 7e, OI-14)
   │                                     ▲
   └── demo público (sem login, sem banco de usuário)   Operador: pnpm privacy:requests (app_operator, 3 funções)
```

F1 navegador ↔ hospedagem ↔ app · F2 app ↔ banco · F3 jobs ↔ banco e storage · F4 app ↔ KMS · F5 app ↔ e-mail ·
F6 app ↔ ferramenta de erros · F7 operador ↔ banco · F8 backups · F9 build e dependências · F10 tela e aparelho.

## 5. Ameaças por fronteira

### F1 Navegador ↔ hospedagem ↔ app

| STRIDE | Ameaça | Controle atual | Residual |
|---|---|---|---|
| S | Roubo ou fixação de sessão | Token opaco de 32 bytes, só `sha256` no banco; cookie `__Host-` HttpOnly, Secure, SameSite=Lax; token novo no login e após o MFA; revogação vale na próxima requisição; 30 dias absolutos, 7 ociosos (ADR-0014, LEG-S04) | Baixa. Pentest confirma a fixação (PENTEST_SCOPE) |
| S | Força bruta de senha e de TOTP | Limites por conta, IP e aparelho conhecido (`RATE_LIMITS`), Argon2id, bloqueio de reuso do passo TOTP | Média: limite por IP depende de `CLIENT_IP_HEADER` confiável (PR1a-R2-B3); `mfaAccount` conta acertos e pode travar o titular (PR1a-R2-B1, B2) |
| S | Enumeração de e-mail | Respostas idênticas no login, cadastro, reset e reenvio; trabalho pesado depois da resposta (`after()`) | Baixa: micro-diferenças de tempo (PR1a-R3-B6, PR1b-R2-B2) |
| S | Bloqueio da conta de terceiros (A4) | Cookie de aparelho conhecido com balde próprio (OI-15) | Baixa |
| S | Assédio por e-mail (A4) | Limite por caixa canônica, 3/h por balde | Baixa: sem teto diário compartilhado (PR1a-R3-B1); bloqueio invisível nos logs (PR1a-R3-B9) |
| T | CSRF | Server actions do Next conferem `Origin`; SameSite=Lax; `form-action 'self'`. A única rota GET autenticada (download) não altera dado, mas grava o AuditLog `data_export_downloaded`: um link de outro site consegue gerar esse registro, sem vazar o arquivo (P7-N5) | Baixa. Pentest confere as actions públicas (período, modo privacidade) |
| T | XSS | React com escape; CSP com nonce e `strict-dynamic`, sem origem externa; o único `dangerouslySetInnerHTML` é o script fixo de tema com nonce | Baixa: `style-src 'unsafe-inline'` (injeção de CSS, sem execução) e `'wasm-unsafe-eval'` em todas as páginas quando há modelo 3D (ADR-0028); aceitos |
| T | Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | — |
| I | Token de verificação ou reset no endereço (query string) fica nos logs da hospedagem e no histórico | Uso único, vida curta (24 h / 30 min), só o hash no banco, `Referrer-Policy: no-referrer` | Média: **TM-01** |
| I | Dado de conta em cache compartilhado | `Cache-Control: private, no-store` em toda resposta que passa pelo proxy, inclusive prefetch e redirecionamento sem sessão (7b, P7-N1: o matcher não tem mais exceção para prefetch); download com `no-store` | Resolvido na 7b: e2e TM-02 |
| I | Mensagens de erro com detalhes internos | `errorFormat: 'minimal'` no Prisma; páginas de erro genéricas; `onRequestError` → `ErrorReporter` por lista de campos permitidos e guarda do `console.error`/`warn` em produção (7c, ADR-0038) | Resolvido na 7c (PR1a-B5): teste de injeção com medidas, notas, e-mail, token e cookie |
| I | Leitura do HTML por quem está perto (A5) | Modo privacidade omite os valores no servidor (ADR-0035) | Baixa |
| D | Esgotamento por geração de PDF ou exportação | Um pedido por vez, 5 por 24 h, trava por pessoa, fila | Baixa |
| D | Abuso do demo público | Sem banco de usuário; dados gerados | Baixa: **TM-03** (sem limite por IP na hospedagem; definir com a hospedagem) |
| E | Rota autenticada sem guarda | Proxy redireciona sem cookie; guarda real no servidor; teste de segurança exige guarda nas actions e em todo `route.ts` de `(app)` | Média: o teste só vê `export async function` (PR1a-R2-B8) |

### F2 App ↔ banco

| STRIDE | Ameaça | Controle atual | Residual |
|---|---|---|---|
| E | IDOR entre contas (A2) | RLS por `user_id` com `SET LOCAL app.user_id` em transação; sem o setting, zero linhas; teste de isolamento entre duas contas (LEG-S03) | Baixa |
| E | Código executando como o runtime (A8, A9) declara qualquer `app.user_id` e passa nas políticas de qualquer conta; com o KMS do runtime, decifra os textos; com `auth_issue_token` (aceita usuário e hash do chamador) toma contas; com `reauth_issue` + `account_delete` exclui contas | O RLS protege contra erro de aplicação (A2), **não** contra quem já executa código no servidor; segredos fora do repositório; dependências fixas e varridas (F9) | **Média**: P7-M1. Avaliado na 7b (ADR-0037): amarrar o contexto à sessão não foi feito (custo alto, ganho parcial). Mitigado: varreduras, expurgos e purga só no `app_worker`, `deleted_at` fora do runtime e purga só com pedido de exclusão. Alerta de volume anômalo feito na 7c (ADR-0038): contadores do Postgres por hora × pessoas ativas, no `app_worker`; detecta leitura em massa, não leitura lenta de poucas contas. Residual no RIPD (7f) |
| E | Tratamento sem consentimento | `app.has_active_consent('health_data')` nas políticas das tabelas de saúde + guard na aplicação na mesma transação; teste pelo catálogo (ADR-0021) | Baixa |
| E | Abuso das funções SECURITY DEFINER | `search_path` fixo (teste em `pg_proc`), sem SQL dinâmico, retorno mínimo, `EXECUTE` só para `app_user` | Resolvido na 7b (ADR-0037): funções de job só no `app_worker`; AuditLog do sistema por função própria com lista fechada (PR1b-M1 residual, PR1b-B3, PR1b-B2) |
| T | Alteração de colunas sensíveis pelo runtime | UPDATE por coluna em `users` | Média: `sessions` aceita UPDATE em todas as colunas (PR1a-R2-B5) |
| T | SQL injection | Prisma parametrizado; `$queryRaw` com template; nenhum `Unsafe` fora do código gerado | Baixa |
| I | Runtime lê AuditLog e AccessLog | Sem SELECT para `app_user` | — |
| R | Ação sensível sem prova | AuditLog na mesma transação da mudança, só enums e UUIDs (LEG-S06) | Baixa: edição pela própria pessoa sem AuditLog (PR2-N1, `LEGAL-REVIEW`) |
| I | Credencial de migração ou de operador no runtime | `parseEnv` recusa `MIGRATION_DATABASE_URL` e `OPERATOR_DATABASE_URL` em produção e `DATABASE_URL` com papel privilegiado; `db:verify-roles` na CI | Baixa |

### F3 Jobs ↔ banco e storage

| STRIDE | Ameaça | Controle atual | Residual |
|---|---|---|---|
| T | Job duplicado apaga ou envia em dobro | `singletonKey`, `SKIP LOCKED`, reserva com prazo | Baixa: handler acima de 300 s pode rodar em dobro; `jobs_fail` sem conferir `locked_by` (PR1b-B8) |
| I | Arquivo de exportação órfão | Eliminação apaga o storage dentro da transação; limpeza em duas fases | Baixa: órfão raro depois da purga (OI-35, 7e) |
| D | Eliminação ou purga não acontece | Varreduras diárias (`health_data_sweep`, `account_purge_sweep`) | Baixa: lembrete para em silêncio (PR4-B1); diferença de relógio app × banco (PR1a-R2-B7) |
| E | Jobs com o mesmo papel do web | Papel `app_worker` (ADR-0037), `WORKER_DATABASE_URL` só onde a fila é consumida | Resolvido na 7b (D5) |

### F4 App ↔ KMS

| STRIDE | Ameaça | Controle atual | Residual |
|---|---|---|---|
| I | Vazamento da chave mestra | Envelope por valor com DEK nova e AAD com o contexto (ADR-0016); `KMS_PROVIDER=local` recusado em produção | **Bloqueante para produção**: não há KMS real (CHECKLIST, `{{KMS}}`) |
| D | Timeout de transação com KMS remoto | — | Média: PR2-N3 (decifrar fora da transação ou timeout explícito, junto com o KMS real) |
| S | Pepper dos códigos de recuperação era o `SESSION_SECRET` | `RECOVERY_CODE_PEPPER` próprio (ADR-0037); rotação em `KEY_ROTATION.md` | Resolvido na 7b (PR1a-B3) |

### F5 App ↔ e-mail

| STRIDE | Ameaça | Controle atual | Residual |
|---|---|---|---|
| I | Conteúdo de saúde no e-mail | Modelos sem conteúdo de saúde, só links e datas; logs com destinatário mascarado | Baixa: a existência e o horário do lembrete indicam rotina (ROPA T7, OI-03) |
| I | Transferência internacional | `SUBPROCESSORS.md` antes de ativar | Jurídico: OI-03, mecanismo do art. 33 (CHECKLIST) |
| S | Phishing com a marca | Links só para `APP_URL` | **TM-04**: SPF, DKIM e DMARC no domínio de envio (com o provedor, 7e) |

### F6 App ↔ ferramenta de erros (7c)

| STRIDE | Ameaça | Controle atual | Residual |
|---|---|---|---|
| I | Erro carrega argumentos, corpo, cookies ou medidas | Relatório montado por lista de campos permitidos antes do adaptador (nome, código, `digest`, causa, quadros sem pasta; método e rota como arquivo); nunca mensagem, `request.path`, cabeçalhos ou corpo; teste de injeção; logger com lista fechada (LEG-R04, ADR-0038) | Resolvido na 7c. Fornecedor externo, região e DPA no CHECKLIST (OI-03, OI-11) |
| I | Next ou dependência imprime o erro original no console da hospedagem | Guarda do `console.error`/`warn` em produção: só linhas do logger (filtradas de novo), erro reduzido, números | Baixa: `console.log`/`info` de dependências não passa pela guarda (nenhuma imprime dado de usuário hoje) |
| R | Alerta suprimido por quem já executa como o runtime | Amostra pelos contadores do Postgres, lida só pelo `app_worker`; o runtime não grava nem lê as amostras | Média: o alerta sai pelo log da instância do worker; canal de alerta fora da aplicação no CHECKLIST |

### F7 Operador ↔ banco

| STRIDE | Ameaça | Controle atual | Residual |
|---|---|---|---|
| E | Operador lê dado além do pedido | `app_operator` sem tabelas, só 3 funções; contato só de pedido aberto, com AuditLog | Resolvido na 7b: papel de login por pessoa, `operator_role` no AuditLog e teto de 30 leituras do contato por hora (OI-34 b). Aberto: guarda da credencial (OI-34 a, CHECKLIST) |

### F8 Backups

| STRIDE | Ameaça | Controle atual | Residual |
|---|---|---|---|
| I | Dado excluído sobrevive em backup | Retenção ≤ `PURGE_DAYS`, conferida no `parseEnv`, nos jobs e na CI (`check:retention`); reaplicação da purga depois de restaurar (`BACKUP_RESTORE.md`) | Média: conferência na configuração real do provedor e teste de restauração (7e + CHECKLIST) |
| I | Backup fora do Brasil ou sem cifra | Declarado em `infra/retention.json` | Média até o provedor existir (D1, 7e) |

### F9 Build e dependências

| STRIDE | Ameaça | Controle atual | Residual |
|---|---|---|---|
| T | Dependência maliciosa | Versões fixas, lockfile, `pnpm audit`, Dependabot, CodeQL, Semgrep, gitleaks (ADR-0009, ADR-0010, LEG-S09); CSP sem origem externa limita exfiltração no navegador | Baixa: sem aprovação obrigatória de Code Owners (OI-13 b) e sem checagens obrigatórias na `main` (ADR-0033 N4) → **TM-05** |
| I | Telemetria de ferramentas | `NEXT_TELEMETRY_DISABLED=1`, `CHECKPOINT_DISABLE=1`, Semgrep `--metrics=off` | — |

### F10 Tela e aparelho

| STRIDE | Ameaça | Controle atual | Residual |
|---|---|---|---|
| I | Aparelho compartilhado | Sessões listáveis e revogáveis; sair apaga os cookies; `no-store` | Baixa: a variante do twin e o tema ficam no `localStorage` (sem dado de saúde) |
| I | Valores vistos em público (A5) | Modo privacidade e modo apresentação (ADR-0035) | Baixa: datas e quantidade de registros continuam visíveis (PR3-B3, OI-36 b) |

## 6. Fora de escopo

- Ataques ao aparelho da pessoa (malware, extensões do navegador com acesso à página).
- Indisponibilidade da hospedagem e DDoS volumétrico (tratados pela hospedagem; TM-03 cobre só o demo).
- Coerção da pessoa para mostrar os próprios dados.
- Módulos removidos (humor, diário, medicamentos, cérebro, IA): não existem no código (ADR-0027, ADR-0030).

## 7. Itens novos deste threat model

| ID | Item | Sub-fase |
|---|---|---|
| TM-01 | Tokens de verificação e de reset no endereço ficam nos logs da hospedagem e no histórico. Avaliar trocar por POST (o link abre uma página que envia o token no corpo e limpa a URL com `history.replaceState`) e confirmar que os logs da hospedagem não guardam query string. **Feito na 7b (ADR-0037):** token no fragmento (`#token=`, não chega ao servidor), limpo com `history.replaceState`, enviado por POST; links antigos com `?token=` também são limpos (e2e). | 7b |
| TM-02 | Teste e2e dos headers de segurança e de `Cache-Control` em toda classe de resposta: página pública, autenticada, 404, erro, redirecionamento, download e resposta de server action. **Feito na 7b:** `e2e/security-headers.spec.ts` (pública, autenticada, 404, redirecionamentos, route handler, prefetch, server action). A página de erro 500 não tem rota que a provoque; passa pelo mesmo proxy e pelos mesmos cabeçalhos do `next.config`. | 7b |
| TM-03 | Limite por IP no demo público e nas actions públicas (período, modo privacidade), na aplicação ou na hospedagem. **Aplicação feita na 7b:** limite em memória no proxy (demo 300/min, action sem sessão 60/min, 429). | 7b (aplicação) / 7e (hospedagem) |
| TM-04 | SPF, DKIM e DMARC no domínio de envio; runbook de provisionamento. | 7e |
| TM-05 | Proteção da `main`: checagens obrigatórias da CI e revisão antes do merge (limitada pelo plano do GitHub, OI-13). | 7e |

Os achados da revisão de privacidade do repositório inteiro (P7-*) estão em `docs/legal/OPEN_ISSUES.md`, seção
"Revisão do repositório inteiro (Fase 7a)", com a sub-fase de cada um.
