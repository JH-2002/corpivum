# Registro de decisões (ADR)

Formato curto: contexto, decisão, consequências. Decisões novas entram no fim, com número sequencial.
Requisitos citados por ID (`LEG-xx`, ver `docs/LEGAL_REQUIREMENTS.md`).

---

## ADR-0001 — Stack e versões (Fase 0, 2026-10-06)
**Contexto.** CLAUDE.md fixa a stack. Algumas versões "latest" do npm não servem hoje.
**Decisão.**
- Next.js 16 (App Router, Turbopack), React 19, Tailwind 4, Zod 4, next-intl 4, Vitest 5, Playwright.
- **TypeScript 6.0**, não 7: o `typescript-eslint` ainda declara suporte só até `<6.1`.
- **ESLint 9**, embora marcado como fora de suporte: os plugins do `eslint-config-next` (react, jsx-a11y,
  import) ainda não aceitam ESLint 10. Revisar quando houver suporte.
- **Prisma 7.10** (estável). A dist-tag `latest` do npm aponta para um RC da 8.0.
- `eslint-config-next` alinhado à versão do Next (16.3.8), respeitando a idade mínima de release do pnpm.
**Consequências.** Dívida técnica: subir TS 7 e ESLint 10 quando o ecossistema permitir (Dependabot avisa).

## ADR-0002 — Papéis do PostgreSQL e conexões (Fase 0)
**Contexto.** LEG-S03 exige runtime sem privilégio para contornar RLS.
**Decisão.**
- `docker/postgres/init/01-roles.sh` cria `app_migrator` (dono do banco, do schema `public` e das tabelas) e
  `app_user` (LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOINHERIT; só `USAGE` no schema e DML
  via privilégios padrão). `app_migrator` tem `CREATEDB` **só em dev**, para o shadow database do
  `prisma migrate dev`. Nenhum dos dois é superusuário nem tem BYPASSRLS.
- A CLI do Prisma (`prisma.config.ts`) usa `MIGRATION_DATABASE_URL` (app_migrator). O runtime usará
  `DATABASE_URL` (app_user) via `@prisma/adapter-pg` a partir da Fase 1a, junto com as políticas RLS e a
  extensão que executa `SET LOCAL app.user_id`.
- `pnpm db:verify-roles` (também na CI) prova as propriedades acima, inclusive que o runtime não cria tabelas.
- Porta do banco publicada só em `127.0.0.1`.
**Consequências.** Em produção, os papéis são criados pelo provisionamento do banco gerenciado (sem CREATEDB
para o migrator). Registrar no runbook de deploy quando a hospedagem for escolhida.

## ADR-0003 — i18n com next-intl, sem roteamento por idioma (Fase 0)
**Decisão.** Um catálogo (`messages/pt-BR.json`), carregado em `src/i18n/request.ts`, sem prefixo de idioma
nas URLs. Chaves tipadas (`src/i18n/global.d.ts`): chave inexistente quebra o typecheck. Rotas em pt-BR
(`/inicio`, `/sono`, ...).
**Consequências.** Adicionar outro idioma exigirá roteamento por locale; fora do escopo do MVP.

## ADR-0004 — Teste de alegações proibidas e namespace `disclaimer.*` (Fase 0, LEG-M03)
**Decisão.**
- Glossário em `tests/content/forbidden-terms.ts`, aplicado a texto normalizado (minúsculas, sem acentos).
  Cada termo tem exemplo positivo obrigatório no teste, e há exemplos negativos para evitar falso positivo
  (ex.: "tratamento de dados pessoais" é permitido; "tratamento da ansiedade" não).
- `disclaimer.*` é isento da varredura. Em troca: lista fechada de chaves aprovadas
  (`tests/content/approved-disclaimers.ts`) — chave nova quebra o teste —, CODEOWNERS e checklist de PR.
- O teste também exige os avisos obrigatórios (prescritor, CVV 188, SAMU 192).
**Consequências.** Strings de UI fora do catálogo não são varridas; a regra é não escrever texto literal em
componentes (revisão de PR). Avaliar `react/jsx-no-literals` quando houver mais telas.

## ADR-0005 — Design tokens (Fase 0, §6, LEG-X01)
**Decisão.** Valores em `src/styles/tokens.css` (CSS variables, temas claro e `.dark`), expostos ao Tailwind
por `@theme inline` em `globals.css`, que também reduz a escala de texto a 6 tamanhos e raios/sombras a
3 níveis. `tests/design/contrast.test.ts` calcula o contraste WCAG de todos os pares usados (texto ≥ 4,5:1;
bordas de campo e anel de foco ≥ 3:1) nos dois temas.
Fonte: pilha do sistema (usa Inter se instalada). **Sem Google Fonts nem outra fonte remota**: nenhuma
requisição a terceiros ao abrir o app.
**Consequências.** Cor nova só entra pelo arquivo de tokens e pelo teste de contraste.

## ADR-0006 — Tema sem "flash" e preferências de interface no navegador (Fase 0)
**Decisão.** Script inline estático (`THEME_INIT_SCRIPT`) aplica `.dark` antes da pintura. Tema fica em
`localStorage` e o período global em `sessionStorage` (§10: "persiste na sessão"), lidos com
`useSyncExternalStore`, validados (Zod) e com fallback em memória se o storage estiver bloqueado.
São só preferências de interface: **nenhum dado de saúde vai para o storage do navegador.**
**Consequências.** Na Fase 1a, a CSP precisa liberar esse script por hash ou nonce.

## ADR-0007 — Adaptadores trocáveis (Fase 0, §37)
**Decisão.** `src/adapters/<nome>/{types,impl,index}.ts` e `createAdapters(env)`. Implementações locais:
LLM fake (sem rede), KMS local (envelope AES-256-GCM com chave de dev), storage em disco (`.storage/`,
chave validada contra path traversal), e-mail no console (destinatário mascarado), fila em memória,
sinal de idade `unknown`, wearables desativado (`NotEnabledError`, LEG-X04).
- `parseEnv` recusa fake/local/console/memory quando `APP_ENV=production`.
- Payload de job só aceita primitivos: carrega IDs, nunca conteúdo.
- `src/lib/logger.ts` aceita só campos de metadados tipados (LEG-R04, LEG-I08); `console` é proibido pelo
  ESLint fora dele.
**Consequências.** Provedores reais exigem registro em `docs/privacy/SUBPROCESSORS.md` (LEG-S10).

## ADR-0008 — Retenção configurável e checagem de backup (Fase 0)
**Decisão.** `PURGE_DAYS=30`, `ACCESS_LOG_RETENTION_DAYS=180` e `BACKUP_RETENTION_DAYS=30` no `.env.example`.
`parseEnv` falha se `BACKUP_RETENTION_DAYS > PURGE_DAYS` (LEG-S07/LEG-D04).
**Consequências.** A variável documenta a intenção; a checagem da configuração real de backup do provedor
entra quando a hospedagem for escolhida (Fase 7). `ACCESS_LOG_RETENTION_DAYS` depende de OPEN_ISSUES OI-06.

## ADR-0009 — Cadeia de suprimentos (Fase 0, LEG-S09)
**Decisão.**
- pnpm com scripts de instalação negados por padrão (`allowBuilds`); liberados só `prisma` e
  `@prisma/engines`. Respeitar a idade mínima de release do pnpm (sem exceções).
- `overrides` para `deepmerge-ts` (≥ 8.0.2) e `mysql2` (≥ 3.24.5), transitivas do CLI do Prisma com
  vulnerabilidade alta corrigida. Prisma validado após o override.
- Exceção de auditoria **GHSA-vfj7-8cjw-p6xm** (`braces`, via `eslint-config-next`): sem versão corrigida,
  usado só no lint sobre globs do repositório. Revisar mensalmente e remover assim que houver correção.
- Actions do GitHub fixadas por SHA; Dependabot com `cooldown` de 7 dias.
**Consequências.** Toda nova exceção de auditoria precisa de justificativa aqui.

## ADR-0010 — CI e SAST (Fase 0, LEG-S09)
**Decisão.** `.github/workflows/ci.yml`: format, lint, typecheck, Vitest, build, Playwright + axe,
verificação de papéis do banco, `pnpm audit`, Semgrep (regras públicas, `--metrics=off`) e gitleaks no
histórico completo. `codeql.yml`: CodeQL `security-extended` em push, PR e semanalmente.
Telemetria do Next desligada (`NEXT_TELEMETRY_DISABLED=1`) na CI e no `.env.example`.
**Consequências.** GitHub processa código-fonte e CI fora do Brasil, sem dados pessoais de usuários
(registrado em SUBPROCESSORS).

## ADR-0011 — Shell e estados de tela (Fase 0, §7–§10, §34)
**Decisão.**
- Sidebar fixa ≥ 1024px, recolhível 768–1023px (começa recolhida), oculta < 768px, onde entra a navegação
  inferior (Início, Registrar, Twin, Timeline, Mais).
- **"Mais" abre a página `/mais`** (lista das demais seções), em vez de uma folha sobreposta: mesmo
  resultado, sem armadilha de foco, e funciona sem JavaScript.
- Registro rápido em `<dialog>` modal nativo, com ciclo de foco explícito (o Chrome deixa o Tab sair para a
  interface do navegador).
- Menus do header no padrão *disclosure* (botão + `aria-expanded`), não `role="menu"`.
- `StateView` cobre loading/empty/error/no-data/partial. Fora de produção, `?state=` força um estado para
  revisão visual e testes e2e.
**Consequências.** As fases seguintes substituem o estado vazio pelo conteúdo real, mantendo os 5 estados.

## ADR-0012 — Endurecimento após a revisão de privacidade da Fase 0
**Contexto.** O `privacy-reviewer` não apontou nada crítico, mas encontrou 1 problema alto, 4 médios e 9 baixos.
Todos foram tratados nesta fase ou registrados para as próximas.
**Decisão.**
- `APP_ENV` passa a ser **obrigatório, sem valor padrão**: esquecer de defini-lo não liga mais os
  adaptadores de desenvolvimento (que antes passavam pela trava de produção). A pré-visualização
  `?state=` só liga com `APP_ENV` igual a `development` ou `test`, falhando fechada.
- `parseEnv` agora também:
  - recusa `DATABASE_URL` com `app_migrator` ou `postgres`;
  - em produção, recusa `MIGRATION_DATABASE_URL` e exige `APP_REGION` numa lista de regiões no Brasil;
  - limita `ACCESS_LOG_RETENTION_DAYS` a 180;
  - recusa storage local dentro de `public/`.
- O logger filtra em tempo de execução: só as chaves de uma lista permitida passam, e o texto precisa ter
  formato de identificador (destinatário só no formato mascarado). Qualquer outro valor vira `[redacted]`.
- O `KmsProvider` recebe um **contexto de cifragem** (`{ userId, table, column }`), usado como AAD no
  AES-GCM. Decifrar com outro contexto falha. A Fase 1a deve usar o mesmo contexto na cifragem dos campos.
- `ConsoleMailProvider` só guarda as mensagens (que podem conter tokens) com `APP_ENV=test`, e no máximo 50.
- Os avisos `disclaimer.*` aprovados ficam com o **texto exato** no teste: qualquer alteração exige
  aprovação. O CODEOWNERS ainda usa placeholders (OPEN_ISSUES OI-13).
- O glossário ganhou "reduz/alivia/combate/melhora + condição", "cérebro está...", "você está
  deprimido(a)/ansioso(a)" e "laudo/avaliação clínica".
- A telemetria da CLI do Prisma foi desligada com `CHECKPOINT_DISABLE=1`, no `.env.example` e na CI.
- `db:verify-roles` também verifica que `app_user` não é membro de outro papel. `NOINHERIT` não impede
  `SET ROLE`.
**Notas para as próximas fases.**
- **Fase 1a:** os privilégios padrão revogam `EXECUTE` de `PUBLIC`. Toda função usada por política RLS
  (ex.: `app.current_user_id()`) precisa de `GRANT EXECUTE ... TO app_user` explícito na migração. Sem isso,
  a consulta falha com permission denied (falha fechada).
- **Fase 6:** o `StorageProvider` precisa ganhar a operação de link de download autenticado e expirável
  (teto de 24h, LEG-D03) antes de existir qualquer exportação. O contrato atual não tem URL pública.

## ADR-0013 — CodeQL sem Code Scanning no repositório privado (Fase 0)
**Contexto.** O repositório `JH-2002/healthmind360` é privado e de conta pessoal, sem GitHub Code Security.
Por isso o Code Scanning não aceita o envio do SARIF. A primeira execução da CI falhou nesse envio, embora
a análise tenha terminado.
**Decisão.** O CodeQL (`security-extended`) roda com `upload: never`. O SARIF é guardado como artefato por
30 dias, e o job **falha se houver qualquer achado**, com anotações no PR. A análise continua sendo um portão
de SAST (LEG-S09), junto com o Semgrep.
**Consequências.** Sem a aba Security nem o histórico de alertas no GitHub. Se o Code Security for
habilitado, voltar ao upload padrão.

## ADR-0014 — Autenticação própria em vez do Auth.js (Fase 1a, LEG-S04)
**Contexto.** LEG-S04 exige sessões em banco, listáveis e revogáveis, com revogação valendo na próxima
requisição. No Auth.js v5, o provider Credentials (e-mail/senha) só funciona com `session.strategy: 'jwt'`.
Sessão em banco só sairia sobrescrevendo `jwt.encode/decode`, um uso sem suporte que pode quebrar a cada
atualização. Além disso, o adapter genérico consulta usuários e sessões antes de existir `app.user_id`, o que
obrigaria a abrir exceções no RLS (LEG-S03).
**Alternativas descartadas.**
- Auth.js com contorno no JWT: uso sem suporte e frágil.
- Better Auth: tem sessões em banco e 2FA, mas o adapter Prisma genérico exigiria tabelas de auth fora do RLS
  ou com políticas permissivas, e seria mais uma dependência grande lidando com credenciais.
**Decisão.** Módulo próprio em `src/modules/auth`, sem biblioteca de auth:
- Senha com Argon2id via `crypto.argon2` nativo do Node 24 (parâmetros OWASP), em formato PHC.
- Sessão opaca: token de 32 bytes, só `sha256(token)` no banco. Cookie `__Host-hm_session`
  (HttpOnly, Secure, SameSite=Lax). O registro é validado no banco a cada requisição.
- TOTP RFC 6238 implementado com `node:crypto`, com bloqueio de reuso do passo. Códigos de recuperação de uso
  único, guardados só como HMAC. QR gerado localmente (sem serviço externo).
- Toda comparação de segredo passa por `constantTimeEqual`.
- Login, cadastro e recuperação respondem de forma idêntica exista ou não o e-mail.
- Limites de tentativa no Postgres, com chaves HMAC (IP nunca em claro).
**Consequências.** O código de auth é nosso para manter. Por isso o pentest precisa cobri-lo com prioridade
(CHECKLIST_GO_LIVE). OAuth ou passkeys no futuro exigem novo ADR.

## ADR-0015 — RLS e funções SECURITY DEFINER para o pré-login (Fase 1a, LEG-S03)
**Decisão.**
- `app.current_user_id()` lê `current_setting('app.user_id', true)`; vazio ou ausente vira NULL, e então
  nenhuma linha passa. Ela recebe `GRANT EXECUTE` explícito para `app_user` (ADR-0012).
- Tabelas de usuário com `ENABLE ROW LEVEL SECURITY` e políticas `USING/WITH CHECK` por `user_id`.
- O runtime abre transação e executa `set_config('app.user_id', $1, true)`, o equivalente parametrizado de
  `SET LOCAL` (`withUser`, `forUser` em `src/lib/db`).
- Operações sem usuário conhecido (login, resolver sessão, consumir token, rate limit) usam funções
  `SECURITY DEFINER` com dono `app_migrator`. Regras:
  - `search_path` fixo na definição e objetos qualificados com schema;
  - sem SQL dinâmico;
  - retorno com o mínimo de colunas;
  - `EXECUTE` só para `app_user`.

  Um teste lê `pg_proc` e falha se houver função SECURITY DEFINER sem `search_path` fixo.
- As tabelas de tokens e de rate limit não têm DML direto para `app_user`: o acesso é só pelas funções.
**Consequências.** As tabelas usam ENABLE sem FORCE. O dono (`app_migrator`) não é limitado pelo RLS, e é isso que
permite as funções SECURITY DEFINER. O runtime nunca usa esse papel (`parseEnv` e `db:verify-roles` garantem).

## ADR-0016 — Formato do envelope de criptografia de campo (Fase 1a, LEG-S02)
**Decisão.** `src/lib/crypto/field.ts` cifra cada valor com uma DEK nova (AES-256-GCM), obtida do `KmsProvider`
com o contexto `{ userId, table, column }`. O mesmo contexto canônico entra como AAD também na cifragem do
dado. Formato em `bytea`:
`0x01 | len(keyId) u8 | keyId | len(encDEK) u16 | encDEK | iv(12) | tag(16) | ciphertext`.
A DEK em claro é zerada após o uso.
**Consequências.** Uma chamada ao KMS por escrita e por leitura. Avaliar cache de DEK quando houver KMS real
(Fase 7). A rotação de chave usa o `keyId` do envelope (docs/runbooks/KEY_ROTATION.md).

## ADR-0017 — Endurecimento após a revisão de privacidade da Fase 1a
**Contexto.** O `privacy-reviewer` não apontou nada crítico. Encontrou 1 problema alto, 7 médios e 10 baixos.
**Decisão (corrigido nesta fase).**
- **Força bruta do 2º fator:** limite `mfaAccount` (10 por hora por conta) para TOTP e códigos de
  recuperação, somado entre sessões pendentes e também usado ao desativar o MFA. Ao bloquear (bloqueio
  temporário de 1 h), o titular recebe um e-mail `security-alert` (`mfa_locked`), uma vez por janela. O
  limite por sessão (5) continua.
- **Enumeração por tempo:** o trabalho que depende de a conta existir (token e e-mail) roda depois da resposta,
  via `after()` do Next (`defer` injetado no serviço). Recuperação, reenvio e cadastro respondem no mesmo
  tempo com ou sem conta.
- **Reautenticação:** ativar o MFA exige a senha atual. Toda verificação de senha atual tem limite
  `reauthUser` (10 a cada 15 min). Ligar ou desligar o MFA e trocar a senha enviam um e-mail
  `security-alert`, só com o tipo do evento.
- **Login bloqueado** responde sem calcular Argon2: evita esgotar CPU e memória. O bloqueio não revela se a
  conta existe, porque e-mails inexistentes também são contados.
- **Guarda de sessão em toda página e server action de `(app)`**, além do layout: na navegação pelo
  cliente, o layout não é renderizado de novo. Um teste varre páginas e actions e falha se alguma não chamar
  `requireVerifiedSession()`; um e2e revoga a sessão e navega pelo cliente.
- **IP para limites:** `CLIENT_IP_HEADER` é obrigatório em produção (cabeçalho escrito pela hospedagem). Em
  dev, vale o último salto de X-Forwarded-For; o primeiro, que o cliente controla, nunca é usado.
- **Expurgo:** `app.auth_purge_expired()` apaga sessões revogadas ou expiradas e tokens usados ou vencidos há
  mais de 1 dia, e as janelas de limite encerradas. Job `auth.purge_expired` registrado em
  `src/instrumentation.ts`, a cada 6 h, reagendado ao terminar; em dev/test a fila em memória é consumida
  no próprio servidor. Fila real: Fase 7 (OPEN_ISSUES OI-14).
- **Banco:** as políticas usam `(SELECT app.current_user_id())`, avaliado uma vez por consulta. Em `users`, o
  runtime só faz UPDATE nas colunas que precisa alterar: `id`, `email`, `adult_attested_at` e
  `age_gate_version` ficam imutáveis.
- **Outros:**
  - cookies `__Host-` apagados com os mesmos atributos (o `delete()` do Next não envia `Secure`);
  - a ação do age gate também respeita `hm_age_block`;
  - Prisma com `errorFormat: 'minimal'`;
  - o `uri` otpauth não vai ao cliente;
  - a confirmação do TOTP é condicional e atômica;
  - `test:db` e e2e recusam banco que não seja local fora da CI.

**Aceito por ora (registrado em OPEN_ISSUES; os 10 achados baixos estão listados lá com status).**
- **OI-15:** bloqueio por conta permite travar o login de alguém só sabendo o e-mail (5 tentativas por 15 min).
  Mitigações possíveis: atraso progressivo e exceção para aparelho conhecido. Ficou para depois, para não
  enfraquecer a proteção contra força bruta.
- **Pepper dos códigos de recuperação = `SESSION_SECRET`** (com separação de domínio). Girar esse segredo
  invalida os códigos. Documentado em docs/runbooks/KEY_ROTATION.md; um segredo próprio pode entrar na Fase 7.
- **Erros não tratados do Next** ainda saem pelo `console.error` da plataforma. Com o Prisma em
  `errorFormat: 'minimal'` e o serviço sem lançar conteúdo, o risco é baixo. `instrumentation.ts` fica para
  quando houver ferramenta de erros (Fase 7, LEG-R04).

## ADR-0018 — Segunda revisão de privacidade da Fase 1a
**Contexto.** A segunda revisão confirmou que o achado alto e os seis médios anteriores foram corrigidos e
testados. Não apontou nada crítico nem alto. Apontou 3 médios novos e 8 baixos.
**Decisão (corrigido, cada um com teste em `tests/db/auth-flows.test.ts`).**
- **M1, retenção:** o expurgo (`app.auth_purge_expired`, job `auth.purge_expired`) também apaga contas com
  e-mail nunca verificado 7 dias após o cadastro, com sessões e tokens em cascata. Também apaga o segredo
  TOTP de ativações não concluídas 1 dia após o início (coluna `totp_setup_started_at`). ROPA T1 atualizado.
  Quem perder a janela pode se cadastrar de novo.
- **M2, ativação do TOTP:**
  - a confirmação usa o mesmo limite `mfaAccount` do 2º fator;
  - o segredo pendente vale 15 min;
  - uma sessão roubada não consegue testar códigos sem limite.
- **M3, assédio por e-mail:** os limites `registerAccount` e `resendAccount` (3 por hora por destinatário,
  com chave HMAC) são checados dentro do trabalho adiado, então a resposta e o tempo não mudam.
**Baixos:** registrados em docs/legal/OPEN_ISSUES.md (PR1a-R2-B1 a B8), por decisão do responsável.


## ADR-0019 — Consentimento, provas, AccessLog, fila Postgres e aparelho conhecido (Fase 1b)
**Contexto.** A Fase 1b cria a base legal do tratamento (LEG-C01–C06), a Central de Privacidade, o
AuditLog/AccessLog e o encerramento de conta de menor (LEG-F04). Junto entram quatro pendências: provas
fora da cascata do expurgo (PR1a-R3-B8), fila real (OI-14), bloqueio de conta por terceiros (OI-15) e
limite por caixa canônica (PR1a-R3-M1).

**Decisão — consentimento e documentos.**
- `ConsentRecord` por finalidade (enum com as 5 do LEG-C02), apontando para a `PolicyVersion` do texto
  exibido e com o `text_hash` dela. Conceder cria um registro novo; revogar só preenche `revoked_at`.
  Gatilhos no banco exigem a versão vigente e o hash certo e tornam a revogação definitiva.
- `PolicyVersion`: catálogo público (sem dado pessoal), só leitura para o runtime. O texto vive no i18n
  (`consent.purposes.*`, `legal.*`). `textHash` = SHA-256 do JSON do namespace. Nova versão = migração com
  INSERT e catálogo atualizado em `src/modules/consent/catalog.ts`. Um teste falha se o texto mudar sem
  nova versão; o serviço recusa gravar se a versão publicada divergir do catálogo.
- Aceite dos Termos e ciência da Política ficam em `policy_acceptances`, separados do consentimento
  (base legal diferente).
- `app.has_active_consent(purpose)` (SECURITY INVOKER): ativo = não revogado e na versão ≥ última versão
  com `requires_reconsent`. É a mesma regra do guard da aplicação (`withConsentOn`/`assertConsent`, na
  mesma transação) e das políticas RLS das tabelas de saúde a partir da Fase 2.
- Versão substancial nova (LEG-C06): o consentimento antigo deixa de valer até a pessoa escolher de novo.
  `requireAppSession` leva a `/boas-vindas/atualizacao`; a Central de Privacidade fica acessível durante a
  atualização (revogar nunca depende de aceitar algo).
- IA e transferência internacional existem no enum e no guard, mas só são oferecidas na Fase 5, quando
  houver provedor e região para o texto (LEG-C03).
- O passo "dados de demonstração × começar do zero" (§52.5) fica para a Fase 2, junto com o seed.

**Decisão — revogação dos dados de saúde (`LEGAL-REVIEW`, OI-16).**
- Bloqueio imediato: nada é exibido nem processado (guard + RLS).
- Antes do 2º clique, aviso com o que para, a data da eliminação e como cancelar, e oferta de exportar
  antes. A exportação é da Fase 6: até lá o aviso diz que ela estará disponível em breve
  (`exportAvailable=false` em `HealthRevokeDialog`).
- Eliminação agendada para `HEALTH_DATA_GRACE_DAYS` (padrão 30): `users.health_data_purge_at` + job
  `privacy.health_data_eliminate` com `singletonKey`. Reconsentir dentro do prazo zera a data e cancela o
  job. O job rechecha data e consentimento antes de apagar; a varredura diária
  (`privacy.health_data_sweep`) reencontra agendamentos perdidos.
- Cada módulo com dados de saúde registra seu eliminador (`registerHealthDataEraser`) e usa o padrão de
  política: SELECT/INSERT/UPDATE exigem `(SELECT app.has_active_consent('health_data'))`; DELETE só por dono.

**Decisão — provas e logs (PR1a-R3-B8, LEG-R02, LEG-R03, LEG-S06).**
- `consent_records`, `policy_acceptances`, `privacy_requests`, `audit_logs` e `access_logs` guardam
  `user_id` **sem FK para `users`**: apagar uma conta não leva as provas em cascata nem é bloqueado por
  elas. Um teste lista as FKs para `users` (lista fechada).
- `audit_logs`: só enums e UUIDs (sem texto livre nem JSON), escrito só por `app.audit_append` na mesma
  transação da mudança; o runtime não lê.
- `access_logs`: IP (`inet`) e data/hora, gravados no login completo e a cada renovação da sessão (5 min);
  escritos só por `app.access_log_append`; o runtime não lê. Expurgo diário por
  `ACCESS_LOG_RETENTION_DAYS`. Provas: `PROOF_RETENTION_DAYS` (padrão 1825, piso 365; `LEGAL-REVIEW`).
- Encerramento de conta de menor (LEG-F04): senha atual, `app.account_close_minor()` (só a própria conta)
  grava o pedido concluído e o AuditLog, revoga os consentimentos e apaga a conta na hora.

**Decisão — fila (OI-14, PR1a-R2-B6).** Fila própria no Postgres (`job_queue` + `app.jobs_*`), sem
dependência nova nem subprocessador novo: `FOR UPDATE SKIP LOCKED`, reserva com prazo, retomada de job
travado, nova tentativa com atraso exponencial e `singletonKey` (no máximo um job na fila por chave). A fila
em memória ganhou `singletonKey` e não executa dois `drain` ao mesmo tempo. `JOB_QUEUE=postgres` e
`JOB_WORKER=inline|off`. Falta só o processo de worker dedicado na hospedagem (Fase 7).

**Decisão — auth (OI-15, PR1a-B2, PR1a-R3-M1).**
- Cookie `__Host-hm_device` (180 dias): `v1.<nonce>.<HMAC(SESSION_SECRET, e-mail normalizado + nonce)>`,
  emitido no fim do login completo. Com cookie válido para o e-mail digitado, a tentativa conta em
  `loginDevice`/`resetDevice` (por nonce), não em `loginAccount`/`resetAccount`. Esgotado o limite do
  aparelho, volta a contar no da conta. A checagem é só HMAC (sem banco), então não reabre a enumeração.
- `canonicalMailbox` (sem `+tag`; no Gmail, sem pontos) só na chave dos limites por destinatário.
  O e-mail gravado e a busca da conta não mudam.

**Exceção de ESLint.** `src/modules/consent`, `src/modules/privacy` e `src/adapters/jobs` podem importar o
client cru, como o módulo auth, para injetar o banco nos testes e chamar funções SECURITY DEFINER. Todo
acesso a dado de usuário continua em `withUserOn`.

**Consequências / notas para as próximas fases.**
- **Fase 2:** toda tabela de saúde com o padrão de política acima, eliminador registrado e testado, e o
  passo §52.5 no onboarding.
- **Fase 5:** publicar os textos de IA e de transferência (nova `PolicyVersion`) e ligar `available`.
- **Fase 6:** ligar `exportAvailable` no aviso de revogação; criar os demais tipos de `PrivacyRequest`.
- **Fase 7:** processo de worker dedicado (`JOB_WORKER=off` nas instâncias web).

## ADR-0020 — Revisão de privacidade da Fase 1b
**Contexto.** O `privacy-reviewer` não apontou nada crítico nem alto na Fase 1b. Apontou 4 médios e 9 baixos.
Por decisão do responsável pelo projeto, os médios e cinco baixos foram corrigidos; os demais estão no
OPEN_ISSUES.

**Decisão (corrigido, com teste).**
- **M1, encerramento de conta:** `app.account_close_minor(p_proof_hash)` exige uma prova de reautenticação
  de uso único (2 min). A prova é registrada por `app.reauth_issue` só depois de a aplicação conferir a senha
  (`issueReauthProof`) e fica na tabela `reauth_proofs`, sem acesso direto do runtime. Há também um teto
  global de 50 encerramentos por hora. Um erro de contexto (`app.user_id` de outra pessoa) não basta mais
  para apagar uma conta. Limite residual: quem executa SQL arbitrário como `app_user` consegue chamar as
  duas funções. Isso fica registrado (papel de worker separado, Fase 7).
- **M2, transparência:** os textos do encerramento e da Política dizem o que fica (prova e registros de
  acesso, sem e-mail) e por quanto tempo, com os prazos da configuração (`LEGAL-REVIEW`).
- **M3, prazo no texto versionado:** o texto do consentimento de saúde traz "30 dias" escrito (coberto
  pelo hash), sem parâmetro. `HEALTH_DATA_GRACE_DAYS` precisa ser igual a `HEALTH_DATA_GRACE_DAYS_IN_TEXT`,
  e o serviço recusa iniciar se não for.
- **M4, cancelamento de jobs:** não há mais cancelamento genérico (`app.jobs_cancel` e `JobQueue.cancel`
  foram removidos). `app.health_elimination_cancel()` cancela só a eliminação da própria pessoa, na mesma
  transação do novo consentimento.
- **B1:** os gatilhos usam o relógio do banco em `granted_at`, `accepted_at` e `revoked_at`. Na revogação, só
  `revoked_at` muda.
- **B4:** o cookie de aparelho conhecido cobre também o hash da senha atual. Trocar ou redefinir a senha, ou
  apagar a conta, invalida todos os cookies. O navegador atual apaga o cookie na troca e na redefinição de
  senha e no encerramento.
- **B5:** os logs não ligam mais o `userId` a "é menor" nem a uma finalidade de consentimento.
- **B6/B7:** os textos de métricas (sem promessa de anonimização), de marketing (provedor ainda não escolhido
  e transferência informada antes do envio) e de monitoramento de erros ("com remoção de dados pessoais")
  ficaram de acordo com o que o sistema faz. Os hashes da v1 foram recalculados: a v1 ainda não tinha sido
  publicada fora desta branch.

**Aceito por ora:** B2, B3, B8 e B9, registrados em docs/legal/OPEN_ISSUES.md.

**Revisão focada das correções.** Nada crítico ou alto. O teto global de encerramentos passou a ser
tratado (mensagem com o caminho do encarregado, nada apagado). O desenho do teto e quatro baixos ficam em
OPEN_ISSUES (PR1b-R2-*).

## ADR-0021 — Dados de saúde, dashboard, Índice de Bem-Estar e demo (Fase 2)
**Contexto.** A Fase 2 cria os primeiros dados de saúde (sono, humor/energia, hábitos, diário, peso e
medidas), o Dashboard "Seu estado atual", o Índice de Bem-Estar explicável (LEG-D08) e o demo público
(LEG-X02). Junto entram três pendências da 1b: passo 5 do onboarding (§52.5), consentimento checado no
banco nas tabelas de saúde (PR1b-N1) e eliminação agendada cobrindo todas elas (PR1b-B9).

**Decisão — banco (migração `fase_2_saude`).**
- Seis tabelas (`sleep_entries`, `mood_entries`, `habits`, `habit_checks`, `journal_entries`,
  `body_measurements`), todas com `user_id` em FK `ON DELETE CASCADE` e RLS no modelo da ADR-0019:
  SELECT/INSERT/UPDATE exigem dono **e** `app.has_active_consent('health_data')`; DELETE só por dono. Sem
  TRUNCATE para o runtime. `habit_checks` usa FK composta `(habit_id, user_id)`: o check nunca aponta para
  hábito de outra pessoa. Faixas validadas também por CHECK.
- Texto livre cifrado em nível de campo (ADR-0016), contexto `{ userId, tabela, coluna }`: nota do sono e
  do humor, conteúdo do diário e **nome do hábito** (pode revelar saúde). Sem busca textual (LEG-S02).
  Etiquetas do diário e emoções do humor são listas fechadas (enum), filtráveis.
- **Eliminadores com `DELETE` sem `WHERE`.** No Postgres, um DELETE cujo WHERE/RETURNING lê colunas também
  aplica a política de SELECT, que exige consentimento: depois da revogação nada seria apagado. A política
  de DELETE já restringe ao dono. Registro único em `src/modules/health/erasers.ts`, ligado ao iniciar os
  jobs. `tests/db/health.test.ts` descobre pelo catálogo toda tabela com `user_id` e falha se uma tabela
  de saúde não seguir o modelo de políticas ou não for zerada pelo eliminador (resolve PR1b-N1 e a parte
  de banco de PR1b-B9).
- `users.data_mode` (`demo`/`own`, NULL = passo 5 pendente) e `users.streaks_enabled` (LEG-F05), com
  `GRANT UPDATE` só nessas colunas.
- Pedido de revisão do Índice: `app.privacy_request_score_review()` (SECURITY DEFINER) abre um
  `privacy_requests` `automated_review` com a versão do Índice e o período (colunas novas, só nesse tipo),
  **nunca valores de saúde**, prazo de 15 dias e AuditLog. Idempotente com pedido aberto.

**Decisão — aplicação.**
- Todo acesso a dado de saúde por `withConsent('health_data')` (guard) + RLS (banco): dupla barreira.
  Uma tela lê tudo numa só transação com consentimento (`HealthDataSource.session`).
- **Fonte de dados única** (`src/modules/health/source.ts`): as telas não sabem se os dados são da pessoa
  ou da demonstração. Mesmos componentes para dados próprios, demo dentro da conta e demo público.
- **Índice de Bem-Estar v1** (`src/modules/wellbeing/score.ts`, `docs/WELLBEING_SCORE.md`): regularidade
  do sono, humor/energia, hábitos, atividade (fora na v1: módulo da Fase 4) e constância de registro.
  Componentes sem amostra mínima saem e os pesos são renormalizados. Calculado na leitura, sem tabela
  `WellbeingScore` (menos dado sensível guardado). Selo ESTIMADO. Mudança de fórmula = nova versão.
- **Resumo do dashboard** por regras (sem IA), descritivo, sem causa.
- **Período global em cookie** de sessão `__Host-hm_period` (HttpOnly, sem identificador), validado no
  servidor; substitui o `sessionStorage` da ADR-0006 para os dados serem agregados no servidor (§41).
  Intervalo personalizado limitado a 366 dias.
- **Gráficos com Recharts 3.10.1** (versão fixa): tooltip com data, valor, unidade e selo; legenda
  alternável; padrão de traço além da cor; tabela alternativa; sem animação com `prefers-reduced-motion`.
  O desenho é `aria-hidden` (a tabela traz os valores). Sem nenhum valor, mostra "sem dados" — nunca um
  gráfico vazio.

**Decisão — demonstração (LEG-X02, §40, §52.5).**
- Gerador determinístico de 90 dias 100% fictícios (`src/modules/demo/generator.ts`), em memória.
- **Demo público** em `/demo` (rota pública no proxy): sem sessão, sem banco, sem formulários, selo DEMO em
  todo dado; o único cookie é o do período. `robots: noindex`.
- **Demo dentro da conta** (escolha do passo 5): grava só `data_mode='demo'`; nada fictício entra nas
  tabelas de saúde, então exportação, Índice, eliminação e IA nunca misturam fictício com real. Faixa
  "Começar com meus dados" com confirmação. Não depende do consentimento de saúde (não há dado da pessoa).
- `pnpm db:seed` (só `APP_ENV=development` e banco local) grava o mesmo conjunto numa pessoa fictícia,
  pelo caminho do app (consentimento + RLS + cifra), para testar a área logada com dados. O setup do e2e
  usa a mesma função. Carregador próprio (`scripts/ts-loader.mjs`) em vez de dependência nova (ADR-0009).

**Aceito por ora / fora desta fase.**
- Edição sem histórico de versões (LEG-D02 "com histórico"): Fase 6, junto com a exportação.
- Sinais de risco no texto do diário (§48, LEG-I07): o diário é cifrado e não há leitura automática; a
  orientação CVV 188 / SAMU 192 fica sempre visível no humor e no diário, e aparece em destaque ao
  registrar humor no ponto mais baixo. Detecção no texto: Fase 5 (modo de risco), com revisão clínica.
- "Próximos lembretes" no dashboard: Fase 4 (módulo de lembretes). A seção não aparece até lá.
- Avisos `disclaimer.wellbeingScore` e `disclaimer.demoData` aprovados no teste; `LEGAL-REVIEW` (OI-09).

**Consequências.** Tabela de saúde nova exige: política no modelo, FK CASCADE, eliminador em
`erasers.ts` e classificação no teste de catálogo (senão a CI falha). Atendimento do pedido de revisão do
Índice é manual até a Fase 6 (`LEGAL-REVIEW`, OPEN_ISSUES).

## ADR-0022 — Revisão de privacidade da Fase 2
**Contexto.** O `privacy-reviewer` não apontou nada crítico nem alto na Fase 2. Apontou 2 médios, 5 baixos e
6 notas.

**Decisão (corrigido, com teste).**
- **M1:** o eliminador recebe a lista de eliminadores por injeção (`HEALTH_DATA_ERASERS`, em
  `@/modules/privacy/server`), sem registro global; lista vazia é erro antes de limpar o agendamento.
- **M2:** toda alteração sem formulário passa por `healthMutate`: sem consentimento não lança (nada de
  página de erro nem de log ligando a requisição à revogação) e a tela recarregada mostra o aviso.
- **B1:** `app.privacy_request_score_review` serializa por pessoa (`pg_advisory_xact_lock`), migração
  `fase_2_revisao`. **B2/B3:** textos de cifragem, IA, demo e Índice ajustados ao que o sistema faz
  (`LEGAL-REVIEW`, OI-09). **B4:** seed confere as duas URLs. **B5:** referências corrigidas.
- **N2:** cifra dentro da transação, depois do guard. **N4:** textos fictícios na varredura de termos
  proibidos. **N5:** data e hora reais nos formulários.

**Aceito por ora:** N1, N3 e N6, em docs/legal/OPEN_ISSUES.md (PR2-N1, N3, N6).

## ADR-0023 — E-mail de desenvolvimento via Mailpit
**Contexto.** Em desenvolvimento não havia como ler o e-mail de verificação: o `ConsoleMailProvider` só
registra metadados, de propósito, para nenhum token ir ao log (LEG-R04).
**Decisão.**
- Mailpit (`axllent/mailpit:v1.31.2`, versão fixa) no `docker-compose.yml`, só local: SMTP em
  `127.0.0.1:1025`, interface em `127.0.0.1:8025`, mensagens só em memória (sem volume).
- Com `APP_ENV=development`, o provedor `console` entrega por SMTP ao Mailpit (`DevSmtpMailProvider`).
  `APP_ENV=test` continua com a caixa em memória; em produção o `console` segue recusado por `parseEnv`.
- Cliente SMTP mínimo com `node:net` (sem autenticação nem TLS, só para o Mailpit), sem dependência nova
  (ADR-0009). `DEV_SMTP_HOST` aceita só host local (`localhost`, `127.0.0.1`, `::1`, `mailpit`): nada sai da
  máquina. Destinatário com quebra de linha ou `<>` é recusado (injeção de cabeçalho/comando).
- Token só no corpo entregue ao Mailpit; o log continua com `mail.sent`, o modelo e o destinatário mascarado.
  Mailpit fora do ar não lança erro: registra `mail.dev_smtp_unavailable`, sem detalhes.
**Consequências.** Mailpit é ferramenta local de desenvolvimento, não subprocessador (não trata dado de
titular real). O provedor de e-mail de produção continua pendente (OI-11, Fase 7).

## ADR-0024 — Banco separado para os testes
**Contexto.** `pnpm test:db` e o e2e apagavam as tabelas do banco do `.env`, o mesmo do desenvolvimento.
Rodar os testes apagava as contas de quem estava usando o app localmente.
**Decisão.**
- Segundo banco `healthmind_test` no mesmo container, com os mesmos papéis e privilégios
  (`docker/postgres/init/02-test-db.sh`, idempotente; `pnpm db:test:init` para volumes existentes).
- Os testes leem `TEST_DATABASE_URL` e `TEST_MIGRATION_DATABASE_URL`. `pointToTestDatabase()`
  (`tests/db/safety.ts`) copia essas URLs para `DATABASE_URL`/`MIGRATION_DATABASE_URL` no setup do
  `test:db`, em cada worker do Vitest e na configuração do Playwright (workers e servidor do e2e), antes de
  qualquer conexão. Migrações são aplicadas no banco de testes nos dois casos.
- Trava: só banco local (ou CI), nome terminado em `_test` e diferente de `APP_DB_NAME`; senão os testes
  recusam rodar. O seed de desenvolvimento usa uma trava própria (só banco local).
**Consequências.** A CI cria o banco de testes no volume novo e gera as URLs a partir do `.env.example`.
Uma rodada completa de `test:db` + e2e não altera nenhuma tabela do banco de desenvolvimento (conferido).

## ADR-0025 — Camada explicativa por regras: resumos, destaques, guia dos gráficos e tour
**Contexto.** O dashboard tinha um resumo de uma frase; os módulos não tinham texto que explicasse o
período, e os gráficos não diziam como lê-los. Pedido: resumo em texto, "Como ler este gráfico",
destaques automáticos e um tour opcional, sem IA, comparando a pessoa só com ela mesma.
**Decisão.**
- Módulo puro `src/modules/insights`: uma função por tela (`sleepInsights`, `moodInsights`,
  `habitsInsights`, `journalInsights`, `bodyInsights`, `dashboardInsights`) devolve estado
  (`empty`/`partial`/`ok`), 2 a 4 frases e destaques como **chaves do i18n + argumentos tipados**
  (inteiro, decimal, duração, dias, etiqueta e campo fixos). Nenhum argumento carrega conteúdo livre; o
  diário usa só dia e etiquetas, sem decifrar o texto. Substitui o `buildSummary` da ADR-0021.
- Comparações só com o período anterior de mesmo tamanho e com a frequência prevista de cada hábito
  (não há modelo de metas antes da Fase 4). Limiares em `INSIGHT_RULES`. Dias extremos pelo dia da semana
  em períodos de até 7 dias; senão, pela data. Rótulos neutros ("mais longa", "mais alto"), sem
  "melhor/pior".
- Humor: média ≤ 2, queda ≥ 0,5 ponto ou registro no ponto mais baixo → `supportSignal`. O resumo usa
  texto acolhedor, sem dramatizar e sem causa, e o `SupportNotice` existente (CVV 188 / SAMU 192) aparece
  logo abaixo do resumo (sem `role="status"`); sem o sinal, continua no rodapé da tela de humor. Vale
  também no dashboard. Nenhuma frase de humor cita outro domínio.
- Interface: `PeriodInsights` no topo de cada tela (selo ESTIMADO ou DEMO); os gráficos apontam para o
  texto do resumo com `aria-describedby` (alternativa em texto). `ChartGuide` (`<details>`) descreve
  eixos e cada série a partir das mesmas definições do desenho (tipo, traço, eixo, unidade), o selo e o
  que fazer com a informação.
- LEG-M03: novos termos `population-norm` e `causal-claim`. O texto gerado é montado com o catálogo
  real nos testes e passa pelo glossário (completo, parcial, vazio e demo), fechando a lacuna da ADR-0004
  para esta camada.
- Tour: componente próprio (sem biblioteca, ADR-0009), `<dialog>` modal encaixado embaixo da tela,
  passos ancorados em `data-tour` (passo sem alvo é pulado), Esc/"Pular" fecham, foco devolvido,
  contorno no alvo e sem animação com `prefers-reduced-motion`. Conta: `users.tour_seen`, booleano sem data (minimização; GRANT só da
  coluna); demo público: `localStorage` com try/catch, nada vai ao servidor. Reaberto pelo menu de ajuda
  (`?tour=1`), que também explica os selos.
**Consequências.** Mudar limiar ou redação muda o texto exibido: os testes de `src/modules/insights` e
`src/components/insights` precisam acompanhar. Os textos são RASCUNHO (`LEGAL-REVIEW`, OI-21). As contas
criadas pelo e2e nascem com o tour visto; o demo do e2e marca o `localStorage`.

## ADR-0026 — Health Digital Twin: corpo 3D, Antes × Agora e cérebro 3D educativo (Fase 3)
**Contexto.** A Fase 3 implementa o §15–§18: corpo 3D paramétrico com controle de datas, regiões, vistas e
comparação Antes × Agora, e o cérebro 3D educativo com painel. Exigências: corpo só com medidas próprias sob
consentimento de saúde ativo (demo só fictício); cérebro sempre educacional com os avisos `disclaimer.*`
(LEG-M05); mesmo padrão da camada explicativa (ADR-0025), sem IMC e sem juízo sobre o corpo; nenhum modelo
externo sem licença em `docs/ASSETS.md`; o dashboard não pode regredir (§41).
**Decisão.**
- **Dependências:** `three` 0.186.1 e `@react-three/fiber` 9.8.1, versões fixas (ADR-0009). **Sem
  `@react-three/drei`**, que estava na stack: traria ~20 dependências transitivas (algumas buscam dados em
  CDN, como `detect-gpu`) só para controles de câmera. A rotação é própria (estado + arrasto + botões).
- **Sem asset externo:** corpo e cérebro são geometria gerada em código (perfis de revolução, cápsulas,
  esferas divididas em regiões). `docs/ASSETS.md` tem a regra de licença e o inventário (vazio). Teste de
  fronteira: nas cenas não há loader nem URL.
- **Forma só pelas medidas informadas:** altura e circunferências (peito, braço, cintura, quadril, coxa). O
  **peso não muda a forma** (não se infere corpo a partir dele) e aparece só como número. Medida ausente =
  forma neutra padrão, semitransparente, e o painel diz "sem medida informada". Valores fora da faixa do
  desenho são limitados só no desenho; o número exibido é o informado. As dimensões neutras nunca aparecem
  na interface e não são referência.
- **Sem IMC e sem juízo:** o twin não usa `bmi()` (teste estático). Cor neutra; o destaque marca só a região
  escolhida. Antes × Agora mostra número, seta e palavra (subiu/desceu/igual), nunca só a forma.
- **Cérebro nunca colorido por dado:** modelo igual para todas as pessoas (dois tons neutros só separam
  regiões vizinhas). Painel: nome, função geral (texto educativo), "seus registros" dos temas que o conteúdo
  associa à região (sono, humor e energia, hábitos), dados usados (dias com registro) e nível de confiança
  pela **suficiência dos registros** (`TWIN_RULES`: tema menos coberto; menos de 3 dias = baixo; 7 dias ou
  mais e metade do período = alto), com selo INFERIDO e a frase "não indicam nada sobre esta região".
  `disclaimer.brainModel` e `disclaimer.neurochemistry` sempre visíveis, no 3D e no 2D. Humor baixo mostra
  o `SupportNotice` (CVV 188 / SAMU 192).
- **Nada persistido:** temas do cérebro calculados na leitura, sem tabela `BrainIndicator` nem migração.
  Minimização no navegador: o corpo recebe só dia e medidas (`toTwinRows`); o cérebro, só números já
  resumidos no servidor (`brainThemes`), sem nota nem nome de hábito.
- **Consentimento e demo:** `/twin` e `/twin/cerebro` usam `healthView`/`HealthFrame` como as telas de saúde:
  sem consentimento ativo, só o aviso e nenhuma leitura. Demo na conta e demo público (`/demo/twin`,
  `/demo/twin/cerebro`) usam o gerador fictício; o demo ganhou peito, braço e coxa sem mudar a sequência dos
  demais dados.
- **Camada explicativa:** `twinBodyInsights` e `brainInsights` (`insights.twin.*`, `insights.brain.*`) no
  topo das telas, como alternativa textual do modelo (`aria-describedby`); "Como ler este modelo"
  (`TwinGuide`, `twin.guide.*`). Novo aviso `disclaimer.bodyModel`.
- **Sob demanda:** `three` só em `src/components/twin/scene/**`, carregado por `next/dynamic` com
  `ssr: false` em `LazyScenes.tsx` (teste de fronteira). `scripts/route-js.mjs` mede o JS de entrada por
  rota e falha se o three.js estiver nele (CI). Build da Fase 3: `/inicio` 376,7 → 377,0 KiB gzip (+0,3 KiB
  do item novo na navegação do demo); chunk 3D ≈ 237 KiB gzip, baixado só no twin (o e2e confere).
- **Sem WebGL ou contexto perdido:** SVG 2D com a mesma forma (`bodyLayout`) e as mesmas regiões, com aviso
  em texto. `frameloop="demand"` (só renderiza quando algo muda), resolução e segmentos menores abaixo de
  640px, comparação com um modelo por vez no celular. `prefers-reduced-motion`: troca de vista sem
  transição; não há giro automático nem inércia em nenhum caso.
- **Acessibilidade:** o desenho é decorativo para leitor de tela; tudo é acionável por botões (vistas, girar,
  restaurar, lista de regiões com `aria-pressed`, controle de datas com `aria-valuetext`); painel com
  `aria-live="polite"`; tooltip de ponteiro fecha com Esc. Modo privacidade local (estado só em memória)
  oculta os números do twin; o global fica para a Fase 6.
- **Revisão de privacidade:** nenhum achado crítico ou alto. Corrigidos na fase: `disclaimer.brainModel`
  reescrito (PR3-M1), ressalva do painel do cérebro antes dos números e títulos explícitos (PR3-M2), texto
  do corpo vazio (PR3-B1) e queda de humor no sinal de apoio (PR3-B2). Aceito: PR3-B3 (OPEN_ISSUES).
**Consequências.** Asset externo exige linha em `docs/ASSETS.md` e revisão. Mudar limiares de confiança ou
redação muda o texto exibido (testes de `src/modules/twin`, `src/modules/insights` e
`src/components/twin`). Textos educativos do cérebro e do twin são RASCUNHO (`LEGAL-REVIEW`, OI-22).

## ADR-0027 — Reorientação do produto para o desenvolvimento corporal
**Contexto.** Decisão de produto (responsável pelo produto, 2026-10-08): o HealthMind 360 passa a focar no
desenvolvimento corporal. Saem humor e energia, diário, cérebro 3D, indicadores neuroquímicos e medicamentos.
Ficam corpo e medidas, sono, hábitos, alimentação, atividade física, metas, o twin do corpo, o assistente de IA
opcional, relatórios e a linha do tempo. A Fase 3b (twin holográfico) foi interrompida e será replanejada só
com os corpos.
**Decisão.**
- **Documentos:** PRODUCT_SPEC, SPEC_ADDENDUM, LEGAL_REQUIREMENTS (v4), INTENDED_USE, ROPA, RIPD e
  SUBPROCESSORS refletem o novo escopo. IDs de requisito não são reaproveitados: LEG-M02 (medicamentos) e
  LEG-M05 (cérebro e neuroquímica) ficam como revogados.
- **Imagem corporal e alimentação viram requisito central:** LEG-M04 (metas e recomendações) é reescrito e
  ganha LEG-M06 (imagem corporal), LEG-M07 (alimentação) e LEG-M08 (sem prescrição de dieta ou treino:
  atividades de profissões regulamentadas, Lei 8.234/1991 e Lei 9.696/1998). Os limiares numéricos são
  rascunho com revisão clínica (`LEGAL-REVIEW`, OI-23). As regras ficam num módulo puro
  (`src/modules/guardrails`) com testes, para as metas e recomendações usarem.
- **Remoção de código e dados:** módulos, rotas, textos (inclusive `disclaimer.brainModel`,
  `disclaimer.neurochemistry`, `disclaimer.medications` e `disclaimer.medicationsScope`), testes, dados do demo
  e itens de navegação de humor, diário, cérebro e medicamentos. Uma migração remove `mood_entries`,
  `journal_entries` e os tipos ligados a elas. Só existem dados locais de desenvolvimento (regra 6), então
  não há eliminação de dado real. Rotas removidas redirecionam para a tela inicial (links salvos não quebram).
  A varredura de alegações cerebrais e neuroquímicas continua no teste de termos proibidos (regra 8).
- **Índice de Bem-Estar v2:** sem o componente humor e energia; regularidade do sono, hábitos, atividade e
  constância dos registros, com pesos renormalizados (`docs/WELLBEING_SCORE.md`). Índices não são guardados,
  então não há o que migrar.
- **Consentimento:** o texto de `consent_health_data` muda as categorias e vira nova versão com
  reconsentimento (LEG-C06); o texto da v1 fica arquivado em `legal/archive/` (hash conferido por teste). A
  Política de Privacidade não muda: ela não lista categorias (registrado em OI-08).
- **Apoio de crise:** sai junto com humor e diário. Fica fixo na tela de corpo, num acesso permanente
  "Precisa de ajuda?" no menu de ajuda, quando um guardrail de segurança disparar e no modo de risco da IA
  (LEG-I07). Orientação profissional, SAMU 192 e CVV 188.
- **Entregue na reorientação:** guardrails (`checkWeightGoal`, `checkCalorieTarget`,
  `checkRecommendationTopic`; só metas de perda são limitadas: IMC mínimo 18,5 no alvo e no ponto de
  partida, perda de até 1% do peso por semana; ganho e manutenção sempre permitidos; piso de 1.500 kcal;
  rascunho clínico), `GuardrailNotice` com orientação profissional e apoio, "Precisa de ajuda?" no menu de
  ajuda e glossário ampliado (corpo ideal, juízo sobre o corpo, queima de gordura, rótulo de comida,
  restrição e jejum, culpa, prescrição de dieta ou treino). O resumo por regras deixou de ter sinal de apoio
  (vinha do humor).
**Consequências.** O ADR-0026 continua valendo para o corpo; as partes sobre o cérebro deixam de existir.
A opção de ocultar peso e medidas em todas as telas (LEG-M06) é o modo privacidade global da Fase 6; até lá,
só o twin tem "Ocultar valores". Metas (Fase 4) e IA (Fase 5) precisam usar `src/modules/guardrails`.
OI-19 e as partes de OI-21 e OI-22 sobre humor e cérebro são fechadas por escopo removido. As fases futuras
(`docs/prompts/`) perdem medicamentos (Fase 4) e o diário (Fase 5). Reintroduzir qualquer módulo removido exige
nova ADR, nova versão do consentimento e revisão do RIPD.

## ADR-0028 — Twin holográfico do corpo com modelos .glb (Fase 3b)
**Contexto.** A Fase 3b troca a geometria gerada em código do corpo (ADR-0026) por um corpo humano realista na
forma, em duas variantes (feminino e masculino), em estilo de holograma azul semitransparente. Ela foi
interrompida pela reorientação (ADR-0027) e refeita só com o corpo; o cérebro e o BodyParts3D saíram. Isso
diverge do PRODUCT_SPEC §5 ("nunca imagens anatômicas realistas") e §15 ("neutro, sem traços realistas") e da
regra antiga do modelo humano em `docs/ASSETS.md`; a divergência fica no SPEC_ADDENDUM e em OI-24.
**Decisão.**
- **Realismo restrito à forma (LEG-M06):** sem pele, textura nem cor de pele. Superfície lisa, sem mamilos e
  sem detalhe genital, rosto de manequim (sem olhos, nariz nem boca). Nenhum modelo identifica pessoa real. Não
  há teste automático para isso: cada troca de modelo traz capturas das duas variantes (frente e perfil, temas
  claro e escuro) para revisão antes do PR.
- **Fonte:** malha base e targets do MakeHuman que vêm dentro da extensão MPFB2 (CC0, `LICENSE.ASSETS.md`; o
  código do add-on é GPL e não entra no modelo). O asset pack "system assets" não é usado. Pipeline versionado em
  `scripts/assets/` (Blender headless + `gltfpack`); cada arquivo tem linha em `docs/ASSETS.md` (fonte, versões,
  autor, licença, SHA-256).
- **Dois modelos e valores de referência** (docs/specs/twin-ajustes-corporais.md, que substitui os pedidos
  anteriores de cintura, busto e medidas do masculino): feminino e masculino; a variante neutra saiu (decisão do
  responsável pelo produto, 2026-10-09). A base de cada modelo reproduz as circunferências de referência da seção 4
  da especificação (feminino 86/25/68/96/54, masculino 96/31/80/98/57 cm em peito/braço/cintura/quadril/coxa)
  dentro de máx(0,5 cm; 1%), medidas na malha final. São valores de calibração, não padrão de saúde nem de beleza;
  nenhum texto os apresenta como ideal, normal ou meta, e a relação cintura/quadril é só interna (calibração e
  testes), nunca exibida, como o IMC (LEG-M06).
- **Forma fixa por modelo, sem controles livres:** o corpo é moldado só pelas medidas registradas (peito, braço,
  cintura, quadril, coxa e altura). Largura de ombro, profundidade do tórax, projeção do busto, glúteos e abdômen
  ficam fixos por modelo (`VARIANTS` em `build_body.py`: macros e targets do MakeHuman) e servem só para a forma e a
  calibração. Feminino: ombros mais estreitos que o quadril, quadril e glúteos mais cheios, peito liso. Masculino:
  ombros mais largos que o quadril (conferido no pipeline e no CI), mas com caimento suave do pescoço e sem a
  linha reta e larga de antes; peito pela profundidade do tórax, não pela largura; volume da pelve reduzido. A
  interface não ganha sliders.
- **Pose natural (revisão de 2026-10-13, pedido do responsável pelo produto):** braços próximos ao corpo, com o
  úmero a 12,5° (masculino) e 14,5° (feminino) da vertical em vez da pose A (~40°), cotovelo quase estendido e
  mãos ao lado das coxas, sem encostar. A pose sai do rig `default` do MPFB2 (pesos do MakeHuman), usado só para
  posar e removido antes da exportação; o masculino também baixa a clavícula (trapézio inclinado). Braço e tronco
  não podem se atravessar abaixo da dobra da axila (15 cm sob a junta do ombro), na base e com os morphs que
  engrossam o corpo no limite de extrapolação do app (o tamanho sozinho e cada morph regional sozinho e somado ao
  tamanho): nesses morphs o braço abre junto o mínimo necessário, como num corpo maior de verdade (no maior corpo
  testado, ~30°). Remesh, cortes e regiões continuam na pose A, onde braço e tronco estão separados (com o braço
  caído, o voxel de 8 mm os fundiria); a pose entra como forma, com cada vértice da malha final preso ao
  triângulo mais próximo da malha completa (o Surface Deform deixava vértices sem ligação com o braço girando
  ~30°). A região do braço passa a ser o que se move com o braço nos pesos do rig.
- **Protocolo de medição** (README do pipeline): perímetro do fecho convexo do corte, como uma fita, que passa por
  baixo dos braços (tronco e coxa sem a primitiva do braço; braço só nela; no peito e na cintura, o corte
  inteiro, porque com o braço caído a axila pode partir o corte do tronco). Peito na
  altura dos mamilos; cintura na menor circunferência entre 30% e 55% da altura entreperna→pescoço; quadril na
  maior entre 5% e 35%; coxa a 10% de entreperna→joelho; braço perpendicular ao úmero a 55% de ombro→cotovelo. O
  formulário de medidas ganha uma dica curta de como medir em cada circunferência, alinhada a isso (RASCUNHO,
  `LEGAL-REVIEW`, OI-24).
- **Pipeline:** por modelo:
  1. só a pele do corpo (olhos, dentes, língua e geometria genital são auxiliares e saem antes de medir); mamilos
     achatados (targets `nipple-*-decr`) e suavizados, região genital suavizada;
  2. morphs regionais próprios e localizados: no tronco, faixas radiais com queda suave em altura, sem braços (o
     peito não sobe até ombros e pescoço; a cintura cresce em volta do tronco com metade do deslocamento para a
     frente; o quadril desce coxa abaixo, sem vinco na entreperna); no braço e na coxa, expansão em volta do eixo do
     osso que some antes de ombro, cotovelo, virilha e joelho. Morph global `size_min`/`size_max` da macro de massa
     do MakeHuman para corpos bem maiores ou menores sem caricatura. Nada disso usa o peso da pessoa;
  3. ajuste automático da base (`fit_base`) com os próprios morphs até a referência, conferido na malha final em até
     três passadas (o remesh e a decimação encolhem um pouco: o peito saía até 3 cm menor);
  4. malha final: remesh por voxels de 8 mm (fecha boca, narinas e olhos), rosto suavizado, decimação para ~8.500
     triângulos, remoção de dobras e corte nos planos entre regiões (borda reta), tudo na pose A; a pose e os
     morphs vêm da malha completa (cada vértice preso ao triângulo mais próximo);
  5. calibração na malha final: cada região na base, com cada morph em 1 e com o morph de cada OUTRA região em 1
     (`cross`); os planos de medida vão para o manifesto (`measure`).
- **Forma só pelas medidas informadas:** `bodyMorphWeights` recebe só a `BodyShape`, nunca o peso. Tamanho global
  por mínimos quadrados nas regiões medidas (um braço maior não infla o tronco), com busca do tamanho que minimiza o
  maior erro quando algum ajuste regional chega ao limite; ajuste regional resolvido junto com o efeito cruzado
  (Gauss-Seidel). Altura: escala vertical cheia e, na horizontal, só a raiz dela (uma pessoa mais alta não é
  proporcionalmente mais larga); a meta de cada região é a medida dividida pelo quanto a escala a multiplica (no
  braço, pela direção do úmero). Antes, a escala uniforme fazia uma pessoa de 1,80 m no modelo feminino ter todas as
  circunferências desenhadas ~12% maiores. Limites conferidos nos renders (`MORPH_LIMITS`); além deles, a forma fica
  no limite, o número exibido continua o informado e o painel da região diz "Fora da faixa do desenho: o modelo
  mostra o limite; o número é o informado." (texto, sem número do modelo; RASCUNHO, `LEGAL-REVIEW`). Região sem
  medida mira a circunferência base enquanto os limites permitem. Continua sem IMC, sem juízo e sem cor por dado.
- **Validação na geometria real (CI):** `tests/content/body-measures.test.ts` abre os `.glb` no Node (three +
  meshopt), aplica os pesos do app e mede a malha final pelo protocolo: base × referência em máx(0,5 cm; 1%);
  valores baixo, intermediário e alto de cada região em 150, 170 e 190 cm dentro de máx(1,0 cm; 2%); mudar uma
  medida em 10 cm muda as outras até 1,0 cm; fora da faixa, só nos extremos de estatura, com o aviso do painel e o
  desenho na direção pedida (no máximo dois casos por modelo, só a 150 ou 190 cm).
  `tests/content/body-pose.test.ts` confere a pose: úmero entre 10° e 15°, mãos abaixo da entreperna com folga
  de 1 cm das coxas, ombro masculino mais largo que o quadril e nenhum braço ou mão atravessando tronco ou coxa
  (base, cada morph no limite e um corpo grande resolvido pelo app).
- **Demo por modelo:** no demo (e só nele), a série fictícia é deslocada no navegador para terminar nos valores de
  referência do modelo escolhido, com as mesmas datas e variações. Com dados da pessoa, o modelo nunca muda medida
  nenhuma.
- **Os dois modelos, sempre (OI-24(e), decisão do responsável pelo produto, 2026-10-09):** depois da escolha, a
  tela do twin pede as duas variantes juntas, qualquer que seja ela, então os pedidos não revelam ao servidor qual corpo a
  pessoa vê. Os pedidos saem sem cookie (`credentials: 'omit'`). Trocar a variante não gera pedido novo.
- **Modelo do corpo é preferência de visualização, sem padrão assumido:** `feminine` ou `masculine`, só no
  navegador (`localStorage`, `hm.twin.bodyModel`, ADR-0006), validada com Zod. Não vai ao servidor, não entra em
  cálculo e não é tratada nem inferida como dado de sexo ou gênero. Na primeira vez (sem escolha guardada, ou com o antigo `neutral`), o twin pergunta "Qual
  modelo você prefere ver?" ("Só muda a aparência; fica salvo neste navegador.") e, até a escolha, mostra só o
  estado de espera em holograma (revisão de carregamento, abaixo). A troca fica no seletor abaixo dos controles.
- **Orçamento testado no CI:** ≤ 150 KiB por variante e ≤ 300 KiB somando as duas (são baixadas juntas). Hoje:
  126,9 + 125,4 = 252,3 KiB. O teste de conteúdo também exige as duas variantes e confere hash ×
  manifesto × nome × `ASSETS.md`, a ausência de imagens, texturas e URIs externas, os nomes das regiões e dos
  morph targets e a coerência da calibração.
- **Servidos pelo próprio app:** `public/models/body-<variante>.<sha8>.glb`, nome por hash e
  `Cache-Control: immutable`. Nada é buscado fora do domínio (LEG-S10). Só o padrão exato
  `/models/<nome>.<hash>.glb` fica fora do matcher do proxy (como `_next/static`): são arquivos CC0 sem dado
  pessoal, o demo público os carrega sem sessão e o `no-store` do proxy anularia o cache. O resto de `/models/`
  (um 404, outro tipo de arquivo) passa pelo proxy e recebe CSP, e o teste barra qualquer outro arquivo na pasta
  (PR3b-B2). Teste de fronteira: o único loader fica em `src/components/twin/scene/assets.ts`, com caminho
  relativo `/models/`; nenhuma URL absoluta nas cenas.
- **Compressão meshopt** (`EXT_meshopt_compression` + `KHR_mesh_quantization`), não Draco: o decodificador vem
  com o `three` (`three/addons/libs/meshopt_decoder.module.js`), importado só junto do primeiro modelo, sem
  arquivos em `public/`. Ele compila WASM, então a CSP ganha `'wasm-unsafe-eval'` (permite só compilar
  WebAssembly; `eval` de JS continua bloqueado), só quando o manifesto tem modelo. Limitar ao twin não funciona:
  na navegação client-side vale a CSP do documento inicial (PR3b-B1). `gltfpack` entra como devDependency de
  versão fixa, sem dependências transitivas (ADR-0009).
- **Material holográfico próprio** (`ShaderMaterial` com os chunks de morph do three): fresnel nas bordas,
  preenchimento translúcido e varredura sutil. Cores por tokens `--hm-holo-*` nos temas claro e escuro (no claro,
  mistura normal e azul mais escuro). A varredura só anda com a aba visível e o canvas na tela; com
  `prefers-reduced-motion`, fica parada e não há quadro extra.
- **Sob demanda e fallbacks em cascata:** os `.glb` só são pedidos quando o 3D aparece. Enquanto carregam ou se
  falharem, a geometria gerada em código da Fase 3 com o mesmo material; sem WebGL, o SVG 2D (sem variante), e
  nenhum `.glb` é buscado. A escolha de variante fica abaixo dos controles de vista (`BodyModelPicker`) e vale
  para o corpo e para o Antes × Agora. Build: chunk 3D ≈ 237 → 257 KiB gzip (GLTFLoader + meshopt), ainda fora
  da entrada de todas as rotas (`scripts/route-js.mjs`).
- **Revisão de carregamento (2026-10-14, pedido do responsável pelo produto):** o corpo em código aparecia por
  um instante antes do `.glb`. Agora:
  - **Espera em holograma:** enquanto o chunk 3D ou o modelo carrega (e antes da escolha da variante), a área
    mostra `HoloLoading`: silhueta genérica com as cores `--hm-holo-*` e o texto "Carregando o modelo 3D…",
    pulsando devagar e parada com `prefers-reduced-motion`. Não é o corpo da pessoa nem o corpo em código.
  - **Corpo em código só como fallback real** (`BodyScene`): erro ao carregar o `.glb`; tempo limite de
    `MODEL_LOAD_TIMEOUT_MS` = 10 s sem o modelo (se ele chegar depois, assume no lugar); contexto WebGL perdido
    e restaurado; variante sem arquivo no manifesto. Contexto perdido e não restaurado em
    `CONTEXT_RESTORE_TIMEOUT_MS` = 3 s: versão 2D (antes, a perda ia direto para 2D). Sem WebGL, continua o SVG
    2D e nada do 3D é baixado.
  - **Pré-carregamento:** assim que a tela do twin abre num navegador com WebGL, `usePreloadBodyScene`
    (`LazyScenes.tsx`, por `import()` dinâmico, sem pôr o three.js na entrada da rota) começa a baixar o chunk
    3D, os **dois** `.glb` e o decodificador meshopt, inclusive antes da escolha da variante. Pelos pedidos,
    o servidor continua sem saber qual corpo a pessoa vê (OI-24(e)). Mesmo cache por arquivo, pedidos sem
    cookie e `Cache-Control: immutable`.
  - **Teste:** e2e registra todo valor de `data-twin-model` dos canvas e garante que, numa carga normal (mesmo
    com rede lenta), o corpo em código nunca é desenhado; cobre erro, tempo limite (e o modelo assumindo
    depois) e contexto perdido com e sem restauração.
**Consequências.** Trocar um modelo exige rodar o pipeline, que regrava o manifesto e o nome por hash, e
atualizar `docs/ASSETS.md` (o teste falha se divergirem). Textos novos (`twin.bodyModel.*`) são RASCUNHO
(`LEGAL-REVIEW`, OI-24).

## ADR-0029 — Alimentação, atividade, metas, lembretes e timeline (Fase 4)
**Contexto.** A Fase 4 implementa alimentação (§25), atividade (§26), metas (§30), lembretes (§33) e timeline
(§31) no escopo da reorientação (ADR-0027: sem medicamentos, humor ou diário). Imagem corporal e alimentação são
requisito central (LEG-M04, M06, M07, M08): o app registra e descreve, não prescreve dieta nem treino.
**Decisão.**
- **Tabelas de saúde** `meal_entries`, `water_entries`, `activity_entries`, `strength_sets`, `goals` e `reminders`, no
  modelo do ADR-0021: RLS com dono + `app.has_active_consent('health_data')` (DELETE só dono), FK em cascata,
  `REVOKE TRUNCATE`, CHECKs de faixa, eliminadores em `HEALTH_DATA_ERASERS` e classificação em
  `tests/db/health.test.ts`. O consentimento v2 já cobre alimentação e atividade: sem nova versão (LEG-C06).
- **Campos cifrados (LEG-S02):** descrição e nota da refeição, nota da atividade e **nome do exercício** (como o nome
  do hábito, ADR-0021: pode revelar saúde, ex.: reabilitação). A progressão agrupa por nome depois de decifrar, em
  memória. Metas não têm texto livre.
- **Hábito referenciado por meta ou lembrete:** par opcional `(habit_id, habit_user_id)` com FK composta para
  `habits(id, user_id)` e CHECK `habit_user_id = user_id` (o Prisma não aceita relação opcional sobre `user_id`
  obrigatório). Nenhuma pessoa aponta meta ou lembrete para hábito alheio (teste).
- **Guardrails conectados (LEG-M04, M07):** `checkGoal` é a porta única das metas. Peso → `checkWeightGoal` (só
  perda é limitada; ganho e manutenção sempre permitidos; perda exige prazo e altura); calorias →
  `checkCalorieTarget`. O serviço lê peso, altura e preferência **do banco** na mesma transação, nunca do
  formulário; bloqueada = nada gravado e a tela mostra `GuardrailNotice` (orientação profissional + CVV 188 /
  SAMU 192), sem número e sem alvo alternativo. Depois da ação o formulário volta ao estado inicial (nenhum alvo
  inseguro fica na tela). O piso calórico também é CHECK no banco (`goals_kcal_floor`). Limiares continuam rascunho
  (OI-23).
- **Estimativa calórica (LEG-M07, decisão do responsável pelo produto, 2026-10-13):** opcional, desligada por padrão
  (`users.calorie_estimate_enabled`). Desligada: o campo não aparece, o servidor recusa caloria
  (`checkCalorieEstimate`) e os valores guardados ficam ocultos, sem serem apagados. A meta de calorias
  ("referência diária") só existe com a estimativa ligada, nunca abaixo do piso, e fica em pausa se ela for
  desligada. A tela mostra só o total do dia, sem "restante" nem "excedeu". Resumos nunca falam de calorias.
- **Atividade sem prescrição (LEG-M08):** registro de tipo, duração, intensidade percebida, distância e séries.
  Progressão por exercício só em relação às sessões anteriores da própria pessoa (número, seta e palavra). Sem
  calorias gastas (evita compensar comida com exercício, `NUTRITION_RULES.showExerciseCalories = false`).
- **Metas (§30, LEG-M06, F05):** métricas fechadas (sono médio, minutos e sessões de atividade, cumprimento de um
  hábito, peso, dias com registro, referência de calorias). Barra com valor em texto. Peso: só número, seta e
  palavra, sem barra, sem sequência e sem comemoração. "Alcançado" e "prazo encerrado" são derivados na leitura
  (nada guardado); prazo encerrado aparece em tom neutro, com ajustar ou arquivar. Dias só com pesagem não contam
  como dia de registro (mesma regra do Índice, LEG-M06). `allowsStreak`: sequência só em hábitos.
- **Marcos na timeline (decisão do responsável pelo produto, 2026-10-13):** hábito novo e meta semanal atingida;
  **nunca** meta de peso (`allowsMilestone`) nem de calorias. Medidas do corpo aparecem como registro, com a
  mudança de peso em número, seta e palavra, não como marco.
- **Lembretes (§33, LEG-F05):** só por e-mail; push fica para depois (exigiria adaptador e subprocessador novos,
  LEG-S10, OI-27). Processados no servidor pela JobQueue (não dependem do navegador): `reminder.dispatch` com
  payload só de IDs e do instante previsto, `singletonKey` por ocorrência; cada execução agenda a próxima antes de
  enviar. Cadeia antiga (lembrete apagado, pausado ou com horário mudado) para sozinha (cancelamento de domínio,
  ADR-0020); consentimento revogado para sem reagendar (LEG-C04). No máximo um envio por lembrete por dia
  (`claimSend`, UPDATE condicional), nada no horário silencioso, com o tipo desligado ou com mais de 2 h de atraso;
  até 10 lembretes por conta. O e-mail leva só um link: nem o nome do hábito (ROPA T7). Preferências (por tipo e
  horário silencioso) em `users`, com GRANT por coluna. Limitação conhecida: depois de reconsentir, os lembretes
  só voltam quando a pessoa salva ou retoma cada um.
- **Resumos por regras** (`insights.nutrition|activity|goals|timeline`) no padrão do ADR-0025, comparando só com
  o próprio período anterior e a própria meta. Timeline pura, filtrável por domínio (`?dominio=`) e período.
- **Demo:** as quatro telas no demo público; gerador com PRNG próprio (as sequências anteriores não mudam), sem
  calorias e sem meta de peso ou de calorias. A barra inferior da demo rola dentro dela (a página não).
- **Glossário ampliado:** `food-label`, `training-prescription` e `calorie-accounting`.
- **Revisão de privacidade (PR4, OPEN_ISSUES):** a meta de peso é reavaliada na leitura (`weightGoalSuspension`: suspensa mostra só o aviso); a meta de calorias aparece só em texto (total do dia e referência), sem barra nem "alcançado"; "Próximos lembretes" e o job usam a mesma regra (`willSend`); hábito arquivado pausa o lembrete sem quebrar a cadeia; limite de lembretes com trava por pessoa; conta excluída não recebe e-mail.
**Consequências.** O Índice de Bem-Estar segue sem atividade (V3 em OI-28). ROPA T2/T7 e RIPD R15 atualizados.
Textos novos (`nutrition.*`, `activity.*`, `goals.*`, `reminders.*`, `timeline.*`, `insights.*`) são RASCUNHO
(`LEGAL-REVIEW`, OI-21, OI-23).

## ADR-0030 — Remoção do assistente de IA e das recomendações automáticas
**Contexto.** Decisão de produto (responsável pelo produto, 2026-10-14): o HealthMind 360 não terá assistente de IA
(HealthMind AI) nem módulo de recomendações automáticas. Nada disso tinha sido implementado: havia o item de
navegação e a página `/ia` (placeholder), os stubs `src/modules/ai` e `src/modules/recommendations`, o adaptador
`LlmProvider` só com a implementação fake, a variável `LLM_PROVIDER`, o motivo de guardrail `topic_not_allowed`
(`checkRecommendationTopic`), o selo RECOMENDADO (nenhuma tela o exibia) e as finalidades `ai_sharing` e
`international_transfer`, já no enum do banco mas nunca oferecidas (ADR-0019). Nenhum dado sai do Brasil para IA.
**Decisão.**
- **Código:** saem o item "HealthMind AI", a rota `/ia` (redireciona para `/inicio`, como as rotas do ADR-0027), os
  textos `nav.ai`, `pages.ai.*` e `disclaimer.aiGenerated`, os dois stubs, o `LlmProvider`, `LLM_PROVIDER`, os
  metadados de IA do logger (`model`, `inputTokens`, `outputTokens`), `ALLOWED_RECOMMENDATION_TOPICS` e
  `checkRecommendationTopic`, e o subprocessador `llm`.
- **Selo RECOMENDADO:** sai do `ConfidenceBadge`, do i18n e da regra 7 do CLAUDE.md. Os selos passam a ser MEDIDO,
  INFORMADO, ESTIMADO, INFERIDO e DEMO.
- **Consentimento:** `ai_sharing` e `international_transfer` saem do catálogo (`CONSENT_PURPOSES`,
  `POLICY_DOCUMENTS`). O Postgres não remove valor de enum sem recriar o tipo, e recriar `consent_purpose`
  exigiria recriar `app.has_active_consent` e todas as políticas RLS das Fases 2 e 4 que a chamam. Por isso os
  valores ficam **dormentes** no enum (comentados no `schema.prisma`) e a migração `revoga_ia_transferencia` acrescenta
  CHECKs em `consent_records` e `policy_versions` que proíbem usá-los. O serviço só lê versões dos documentos
  vigentes. Nunca houve linha com esses valores, então não há o que migrar e o texto do consentimento de saúde
  não muda (LEG-C06).
- **Requisitos:** LEG-I01 a LEG-I08 revogados (IDs não reaproveitados); itens (2) e (3) de LEG-C02 revogados sem
  renumerar; LEG-C04, C05, D08, S02, S10, G04, M04 e M08 ajustados (LEGAL_REQUIREMENTS v5). PRODUCT_SPEC (§27 e §28
  removidos), SPEC_ADDENDUM v5, INTENDED_USE v0.3, ROPA v0.6 (T3 removido), RIPD v0.5 (R3 encerrado, R4 só e-mail e
  erros), SUBPROCESSORS v0.3 e CLAUDE.md (regra 3 revogada, regras 5 e 7) refletem o novo escopo.
- **Ficam:** os resumos por regras (ADR-0021, ADR-0025, ADR-0029), que descrevem o período sem propor ações; o
  INFERIDO das correlações; o apoio de crise contextual (fixo na tela de corpo, `GuardrailNotice` quando um
  guardrail de segurança dispara nas metas de peso e de calorias, e "Precisa de ajuda?" no menu de ajuda), agora
  apoiado em LEG-M04 e na regra 9. Sem chat, não há detecção de risco em texto livre. A alimentação não ganha aviso
  fixo próprio (decisão do produto, 2026-10-14).
- **Fases:** a Fase 5 (`docs/prompts/fase-5-ia-recomendacoes.md`) fica cancelada. As Fases 6 e 7 **não são
  renumeradas**: são citadas em ADRs, OPEN_ISSUES, RIPD e runbooks, e renumerar quebraria essas referências, como
  aconteceria com IDs reaproveitados.
**Consequências.** O ADR-0007 continua valendo para os demais adaptadores; a parte do `LlmProvider` deixa de existir.
As partes de IA dos ADRs 0019 (finalidades da Fase 5), 0021 (detecção no texto na Fase 5) e 0027 (modo de risco da IA,
metas e IA usando guardrails) deixam de existir; os ADRs antigos não são editados. OI-03 continua aberta só para
e-mail e monitoramento de erros, cuja transferência não pode se apoiar em consentimento do titular; os Termos v1
ainda citam "Sugestões do app" e serão versionados (OI-29); as partes de IA
de OI-07, OI-08, OI-09, OI-21 e OI-23 foram fechadas por escopo removido. Reintroduzir IA ou recomendações exige nova
ADR, nova finalidade e texto de consentimento, revisão do RIPD, do ROPA e de SUBPROCESSORS e requisitos com IDs
novos.

## ADR-0031 — Termos de Uso v2 não substancial, com aviso único e registro de ciência
**Contexto.** Os Termos v1 tinham a seção "Sugestões do app", que deixou de existir com o ADR-0030 (OI-29). Decisão do
responsável pelo produto (2026-10-14): como a mudança só remove funcionalidade e não amplia o tratamento de dados,
não exigir novo aceite; mostrar um aviso informativo único e registrar a ciência.
**Decisão.**
- **Texto:** Termos v2 sem a seção (as seções seguintes passam a 5 e 6), hash novo no catálogo, `requiresReconsent:
  false` e linha nova em `policy_versions` (migração `termos_v2_ciencia`, INSERT, nunca UPDATE). O texto da v1 fica
  em `legal/archive/terms.v1.json`, com o hash conferido pelo teste do arquivo. Cada documento obrigatório passa a
  ter a própria data de publicação (`PUBLISHED_AT`).
- **Aceite × ciência:** `policy_acceptances` ganha `kind` (`accepted` | `acknowledged`). O aceite continua sendo o da
  última versão aceita; a ciência não conta como aceite. O gatilho `app.policy_acceptances_guard` só aceita ciência de
  versão vigente **não substancial** e de quem tem **aceite em dia** (aceite de uma versão anterior que não esteja
  abaixo da última substancial); o serviço aplica a mesma regra, e o aceite ignora ciências da mesma versão. Assim
  uma ciência nunca substitui um aceite exigido. Índice único: uma ciência por pessoa e versão. Nova ação de
  auditoria `policy_acknowledged`. A Central de Privacidade mostra a ciência ao lado do aceite.
- **Aviso:** `ConsentState.documentNotices` lista os documentos com versão nova não substancial ainda sem registro da
  pessoa. O shell do app mostra `PolicyUpdateNotice` (o que mudou, link para o texto e "Entendi") em todas as telas,
  sem bloquear nada, até a pessoa registrar a ciência (`acknowledgeDocuments`, idempotente). Conta nova aceita a
  versão vigente no onboarding e não vê aviso. O mecanismo vale também para uma futura versão não substancial da
  Política. O texto do aviso é por versão (`policyNotice.changes.<documento>.v<n>`, cobrado por teste); sem ele, um
  texto genérico que não afirma nada sobre a mudança.
**Consequências.** Versão nova de documento passa a exigir escolher entre substancial (reconsentimento, LEG-C06) e não
substancial (aviso e ciência) e escrever o texto de `policyNotice.changes.<documento>.v<n>`. A decisão é `LEGAL-REVIEW`
(OI-30). OI-29 fechada.

## ADR-0032 — Exportação completa, relatórios em arquivo e valores só internos (Fase 6a)
**Contexto.** A Fase 6 foi dividida em três entregas (6a exportação e relatórios, 6b direitos do titular e exclusão de
conta, 6c retenção, modo privacidade e modo apresentação), no escopo do ADR-0027 e do ADR-0030: só os domínios do
desenvolvimento corporal, sem humor, diário, cérebro, medicamentos nem IA. Esta entrega cobre LEG-D03 (portabilidade)
e o §29 (relatórios), e parte de LEG-D01 (seção "Seus dados").
**Decisão.**
- **`data_export_jobs`** (migração `fase_6a_exportacao`): pedido de exportação completa (JSON ou CSV) ou de relatório
  (PDF, CSV ou JSON) de semana, mês ou ano civil. Tabela de saúde no modelo do ADR-0021 (RLS dono + consentimento, DELETE
  só pelo dono, FK em cascata, sem TRUNCATE, eliminador em `HEALTH_DATA_ERASERS`). CHECKs: PDF só em relatório; pronto
  exige prazo e tamanho; **prazo do link no máximo 24 h depois da última atualização** (LEG-D03), conferido no banco.
- **Arquivo nunca público:** gerado em segundo plano (`reports.generate`, payload só com IDs), **cifrado** com envelope
  (ADR-0016, contexto `{ userId, data_export_jobs, file }`) e guardado no `StorageProvider` em
  `exports/<userId>/<jobId>.bin` (sem coluna de chave; o prefixo por pessoa permite apagar tudo de uma vez). O "link" é a
  rota `GET /privacidade/exportacoes/[id]`: sessão validada no banco, dono (RLS), consentimento ativo, `status = ready` e
  `expires_at > now()` pelo relógio do banco; `Content-Disposition: attachment`, `Cache-Control: private, no-store`.
  `EXPORT_LINK_HOURS` (padrão 24, máximo 24) no `parseEnv`. Um teste de segurança exige a guarda em todo `route.ts` de
  `(app)`.
- **Limites:** trava consultiva por pessoa, um pedido em andamento por vez e no máximo 5 em 24 h. Só com
  `data_mode = own` (no demo, o relatório aparece só na tela: nada de arquivo com dado fictício, ADR-0021).
- **Expiração e revogação:** job `reports.expire` de hora em hora (`app.exports_expire_due`, SECURITY DEFINER, devolve só
  IDs) marca vencidos e apaga os arquivos. Revogar o consentimento de saúde vence todos os links **na mesma transação,
  antes da revogação** (`expireExportsIn`); a geração em curso confere o estado e descarta o arquivo. A eliminação
  agendada apaga as linhas (eliminador) e depois os arquivos (`eraseObjects`, injetado como os eliminadores; fecha a
  parte de storage de PR1b-B9 para a revogação; a exclusão de conta vem na 6b).
- **Conteúdo da exportação (portabilidade):** JSON versionado (`schemaVersion`) com conta (e-mail, datas, preferências,
  consentimentos, aceites e pedidos, sem hash, token ou segredo), e uma tabela por domínio com selo e unidades. CSV: ZIP
  sem compressão escrito no projeto (`zip.ts`, sem dependência nova, ADR-0009), um CSV por tabela, UTF-8 com BOM,
  separador `;`, e neutralização de injeção de fórmula (`= + - @`). Colunas em **lista fechada** por tabela, copiadas
  campo a campo.
- **Relatório (§29):** modelo único (`buildReport`) para a tela e o arquivo: resumo por domínio pela camada explicativa
  (ADR-0025), destaques, gráficos (por dia; acima de 62 dias, média ou total por semana), metas e Índice v2 com
  `disclaimer.wellbeingScore`. Só descreve o período (ADR-0030). Metas de peso e de calorias entram só na contagem, sem
  número (LEG-M06, LEG-M07). Opção "ocultar peso, medidas e calorias" (`hide_body_values`): o corpo vira só a quantidade
  de medições (`bodyInsightsHidden`) e o gráfico de peso sai. Rodapé fixo `disclaimer.reportFooter` na tela, no JSON, no
  CSV e **em toda página do PDF**, com "Página X de Y".
- **PDF com `pdf-lib` 1.17.1** (versão fixa; 4 dependências transitivas, `pnpm audit` sem achado novo), gerado no
  servidor, sem rede nem fonte externa (Helvetica padrão, WinAnsi; caracteres fora dela são trocados ou descartados).
  Gráficos em vetor sempre seguidos da tabela de valores. O PDF não é marcado para leitor de tela: a versão acessível é a
  página `/relatorios`. O `pdf-lib` não entra em nenhum JS do navegador (conferido no build).
- **Valores só internos (LEG-M06, decisão do responsável pelo produto, 2026-10-14):** IMC, relação cintura/quadril e
  dimensões de calibração do twin nunca são exibidos nem exportados. O bloco de IMC saiu da tela de corpo (OI-23(h)); o
  IMC fica só nos guardrails. `INTERNAL_ONLY_VALUES` é a rede de segurança dos testes (JSON, CSV, PDF, texto do relatório
  e e2e das telas).
- **Fila em memória (dev/test):** uma só por processo (`globalThis`): no build, a instrumentação e as server actions
  ficavam com filas diferentes e o job pedido numa action nunca rodava. `JobQueue.processNow?()` consome na hora depois
  de um pedido (só a fila em memória implementa; a Postgres segue com o worker). Um `drain` chamado durante outro pede
  mais uma passada, sem executar o mesmo job duas vezes.
- **Central de Privacidade:** seção "Seus dados" (LEG-D01, fecha PR2-N6) com a quantidade de registros por categoria,
  onde corrigir cada uma, o que fica da conta e dos registros técnicos, a exportação completa e os arquivos das últimas
  24 h. O aviso de revogação passa a oferecer a exportação (fecha PR1b-N2).
**Fora desta entrega.** Pedidos do titular, exclusão de conta e o papel `app_operator` (6b); modo privacidade global,
modo apresentação e `pnpm check:retention` (6c). LEG-D02 sem histórico de versões e LEG-D05 sem anonimização ficam
registrados em OPEN_ISSUES (OI-20, OI-31).
**Revisão de privacidade (nada crítico; 2 altos, 3 médios, 5 baixos, 3 notas).** Corrigido, com teste
(`tests/db/reports.test.ts`), nas migrações `fase_6a_revisao` e `fase_6a_prazo`:
- **A1:** a eliminação apaga os arquivos (`eraseObjects`) DENTRO da transação, antes das tabelas: falha no storage
  desfaz tudo e o job tenta de novo (antes, o arquivo ficava órfão para sempre).
- **A2/B5:** limpeza em duas fases (`app.exports_cleanup_due` lista sem mudar nada; o job apaga o arquivo e só então
  `app.exports_mark_file_deleted` marca `expired` + `file_deleted_at`), com falha isolada por item; a linha sai 2 dias
  depois do arquivo (`app.exports_purge_rows`).
- **M1/B3:** apagar um arquivo vence o link na hora e mantém a linha (o limite diário continua contando); o arquivo sai
  em seguida ou na próxima execução do job.
- **M3:** a exportação completa leva a estimativa de calorias guardada mesmo com a estimativa desligada
  (`meals(..., { allStored: true })`): é dado da pessoa.
- **B1:** gatilho `app.data_export_jobs_guard`: prazo nunca acima de `now() + 24 h` (1 s de tolerância pelo
  arredondamento em milissegundos), nunca estendido, arquivo apagado não volta.
- **B2 (parte):** pedido parado há mais de 1 h (antes, 1 dia) tem o arquivo apagado. Depois da revogação, o arquivo sai
  na próxima execução do job, em até 1 h (ROPA T10 ajustado).
- **B4:** a lista mostra como expirado o arquivo vencido ainda não limpo. **N1:** relatório com atualização pendente
  leva à atualização; só a exportação completa passa. **N2:** logs da exportação só com `jobId`.
- **Fila em memória:** o job pedido numa action nunca rodava no build (cópias diferentes da fila e da classe por
  bundle); fila única por processo e `processNow?()`.
**Não alterado.** **M2** (portabilidade bloqueada sem consentimento de saúde, inclusive os dados da conta, e durante a
carência após a revogação): decisão de produto e jurídica, registrada em OI-32. **N3** (selo `INFORMADO` na estimativa
de calorias): é a estimativa da própria pessoa, como no cartão de metas (PR4-B4).
**Consequências.** Tabela nova com dado de saúde fora do banco precisa de eliminador de objetos. Textos novos
(`reports.*`, `privacyCenter.data.*`, `consent.healthRevoke.exportFirst`) são RASCUNHO (`LEGAL-REVIEW`, OI-21).

## ADR-0033 — Portabilidade na carência após revogar (OI-32) e e2e estável na CI
**Contexto.** Revisão de privacidade da 6a (M2, OI-32): a exportação exigia o consentimento de saúde ativo. Quem revogava
não exportava nada, nem os dados da conta, até a eliminação. Decisão do responsável pelo produto (2026-10-15):
**opção (b)**. Quem revogou pode exportar tudo o que ainda guardamos (conta + saúde) até a eliminação; base: atendimento
ao direito do titular (LGPD art. 18), não o consentimento. A exportação é o único uso nesse período. `LEGAL-REVIEW`
mantido no OI-32.
**Decisão.**
- **Carência** = eliminação agendada e ainda não vencida (`users.health_data_purge_at > now()`) sem consentimento ativo
  (`app.health_grace_active()`). Quem nunca revogou e só está com o reconsentimento pendente (OI-16) não tem data de
  eliminação e não entra.
- **Tabelas de saúde (telas, gráficos, resumos, twin): nenhuma política muda.** Só as políticas de
  `data_export_jobs` (metadados do pedido) passam a aceitar, além do consentimento, a carência, e só para
  `kind = 'full_export'`. Relatório continua exigindo consentimento.
- **Caminho restrito de leitura:** `app.export_job_health_data(job)` (SECURITY DEFINER, `search_path` fixo, sem SQL
  dinâmico) devolve as linhas de saúde da própria pessoa em JSON **só** com um pedido dela de exportação completa em
  geração (`processing`) e consentimento ativo ou carência, e grava `data_export_health_read` no AuditLog. A exportação
  completa passa a usar sempre esse caminho (com ou sem consentimento). Os textos continuam cifrados até a aplicação
  (`export-rows.ts`), com o mesmo contexto da cifra das telas; um teste compara a exportação por esse caminho com a dos
  serviços das telas (mesmas tabelas, mesmos valores).
- **Interface:** na carência, a seção "Seus dados" da Central explica que nada é exibido nem processado e oferece a
  cópia completa até a data da eliminação; o aviso de revogação diz que a cópia continua disponível até lá.
- **Testes:** carência exporta tudo com AuditLog; relatório bloqueado; com um pedido em geração, as tabelas de saúde
  continuam vazias pelo RLS e os serviços das telas recusam; a função recusa pedido na fila, de outra pessoa, de
  relatório, sem contexto e depois da data de eliminação; e2e revoga, confere telas sem dado (sono, corpo, relatórios,
  twin, timeline) e baixa a cópia.
- **e2e na CI:** o teste de troca de variante do twin espera o **sinal** de modelo carregado (`data-twin-model`), com
  teto acima do prazo do próprio app para cair no corpo em código (`MODEL_LOAD_TIMEOUT_MS`), em vez do teto padrão de
  5 s; o job de e2e roda em 2 shards (chegou a 9m54s inteiro).
**Revisão de privacidade (nada crítico nem alto; 2 médios, 4 baixos, 5 notas).** Corrigido, com teste:
- **M1:** a eliminação trava a linha da pessoa (`FOR UPDATE`) e o passo final da geração espera por ela (`FOR SHARE`):
  um arquivo gravado no meio da eliminação não fica órfão, mesmo com relógios diferentes entre aplicação e banco.
- **M2:** textos da revogação e da Central dizem que os dados não são usados para nada além de gerar a cópia pedida e
  que arquivos gerados antes de revogar deixam de valer (RASCUNHO, `LEGAL-REVIEW`).
- **B1:** o gatilho de `data_export_jobs` exige que o pedido nasça na fila e só ande para a frente (fila → geração →
  pronto/falho/expirado); nada volta a `queued`/`processing`. **B2:** a função devolve colunas em lista fechada.
  **B3:** leitura única por pedido (`health_read_at`). **B4:** a Central só trata como carência até a data da
  eliminação e mostra a validade do link limitada a ela. **N1:** teste com a mensagem exata da recusa.
**Notas mantidas.** N2: a função monta a exportação num só JSON (limite conhecido para históricos muito grandes). N3:
o prazo de eliminação não é estendido por pedido em curso (OI-32 b). N4: o job de e2e mudou de nome com os shards; o
repositório não tem checagens obrigatórias configuradas.
**Consequências.** Toda nova tabela de saúde entra também em `app.export_job_health_data` e em `export-rows.ts` (o
teste de equivalência quebra se faltar). O ADR-0032 continua valendo no restante.

## ADR-0034 — Direitos do titular, exclusão de conta com purga imediata e papel `app_operator` (Fase 6b)
**Contexto.** Segunda entrega da Fase 6 (ADR-0032). Até aqui o runtime só lia `privacy_requests`, `users.deleted_at`
existia sem ninguém preenchê-la e o encerramento de menor não apagava os arquivos de exportação (PR1b-B9). Decisões do
responsável pelo produto (2026-10-14): exclusão com **purga imediata, sem prazo de arrependimento**; pedidos manuais por
runbook + script de linha de comando, sem painel admin; LEG-D05 sem anonimização (OI-31).
**Decisão.**
- **Pedidos (LEG-D07):** `app.privacy_request_open(kind)` (SECURITY DEFINER, `search_path` fixo, retorno mínimo) para
  `confirmation_access`, `correction`, `portability`, `sharing_info` e `anonymization`: trava consultiva por pessoa,
  idempotente com pedido aberto do mesmo tipo, prazo de 15 dias, no máximo 10 pedidos novos em 24 h, AuditLog
  (`privacy_request_created`; `privacy_request_closed` nos fechamentos, sem ator humano). Confirmação e
  compartilhamento já nascem concluídos (atendidos na tela: "Seus dados" e subprocessadores). Portabilidade nasce em
  andamento, pede a exportação completa em JSON (fluxo da 6a) e é concluída por
  `app.privacy_requests_close_portability()` quando há cópia completa pronta, na mesma transação que marca o arquivo
  pronto. Sem autorização nem carência, no demo ou no limite diário, fica aberta para o encarregado. Comprovante na
  tela (protocolo, tipo, situação, abertura e prazo) e recibo por e-mail `privacy-request-received` com os mesmos
  dados, sem conteúdo de saúde. Job diário `privacy.request_deadlines` loga só contagens (vencendo em 3 dias, vencidos).
  O plano previa `privacy_request_close_own(id, status)`; ficou uma função sem parâmetros e só para portabilidade
  (os outros fechamentos automáticos acontecem na abertura), que não permite fechar pedido arbitrário.
- **Atendimento manual:** papel `app_operator` (LOGIN, sem BYPASSRLS, NOINHERIT, sem USAGE em `public`, sem nenhuma
  tabela), criado fora das migrações (`docker/postgres/init/03-operator-role.sh`, `pnpm db:operator:init`; a migração
  falha com mensagem clara se ele não existir). Só executa `app.operator_requests_due()` (sem e-mail nem pessoa),
  `app.operator_request_contact(id)` (e-mail da conta de pedido aberto, AuditLog `privacy_request_contact_read`) e
  `app.operator_request_close(id, status)` (não fecha `deletion` nem `minor_closure`). `pnpm privacy:requests` usa
  `OPERATOR_DATABASE_URL`; o `parseEnv` recusa essa URL no runtime de produção e `DATABASE_URL` com `app_operator`.
  `db:verify-roles` e `tests/db/rls.test.ts` conferem o papel. O runbook existente `DATA_SUBJECT_REQUEST.md` foi
  atualizado (em vez de um `PRIVACY_REQUESTS.md` novo, para não ter dois runbooks do mesmo processo).
- **Exclusão de conta (LEG-D04):** seção "Excluir conta" na Central: o que é apagado e o que fica; a exportação
  completa da 6a ali mesmo (gerar, ver o link e baixar) e, sem cópia pronta, a marcação obrigatória "Não quero baixar
  meus dados"; reautenticação com senha atual e, com MFA, TOTP ou código de recuperação (`issueReauthProof(...,
  'account_deletion', código)`, limites `reauthUser` e `mfaAccount`), prova de uso único de 2 min
  (`app.reauth_issue` aceita `account_deletion`); frase "excluir minha conta" conferida no servidor (Zod, espaços e
  maiúsculas normalizados). `app.account_delete(proof_hash)` consome a prova e, na mesma transação, preenche
  `deleted_at`, revoga sessões, tokens e consentimentos, vence os links de exportação e abre o pedido `deletion` em
  andamento (AuditLog `account_deletion_requested` pela pessoa e `account_deleted` pelo sistema). Depois, a action
  limpa os cookies e leva a `/conta-excluida` (pública).
- **Purga (`privacy.account_purge`, em minutos):** aviso `account-deleted` (data, prazos do que fica, canal do
  encarregado; sem dado de saúde nem link de login; falha no envio não segura a purga e loga só `mail.failed` com o
  modelo); depois, numa transação travada na linha da pessoa, arquivos no storage, eliminadores de
  `HEALTH_DATA_ERASERS` e `app.account_purge()`, que conclui o pedido `deletion` e os demais abertos, grava
  `account_purged` e apaga a conta (cascata). Falha no storage desfaz tudo e o job tenta de novo. O e-mail fica livre
  para novo cadastro. `account_deletion_notice_sent` só quando o aviso saiu. Varredura diária
  `privacy.account_purge_sweep` (`app.account_purge_due`) reenfileira contas excluídas que ainda existem. AuditLog só
  com enums e UUIDs; logs sem userId, e-mail ou contagem de registros.
- **Encerramento de menor (LEG-F04):** igual, e agora apaga também os arquivos no storage, na mesma transação.
  Fecha PR1b-B9.
- **Testes:** `tests/db/rights.test.ts` (pedidos: atendimento na hora, recibo, idempotência, concorrência, teto,
  recusas do banco, portabilidade com e sem autorização, prazos; exclusão: senha errada, corte do acesso, MFA, prova
  vencida/reutilizada/de outro propósito, só a própria conta; purga: todas as tabelas com `user_id` zeradas pelo
  catálogo exceto as provas, storage vazio, AuditLog exato, falhas de e-mail e de storage, varredura; operador sem
  tabela e só com as três funções). e2e `e2e/rights.spec.ts`: comprovante do pedido e o caminho
  exportar → excluir → login falha → `rowCounts` zerado → arquivo apagado → pedido `deletion` concluído.
**Revisão de privacidade (nada crítico nem alto; 2 médios, 5 baixos, 6 notas).** Corrigido, com teste, na migração
`fase_6b_revisao`:
- **M1:** com MFA ligado, **toda** ação destrutiva pede o 2º fator, inclusive o encerramento de menor (antes, só a
  exclusão: o encerramento era um atalho para apagar a conta só com a senha).
- **M2:** a exclusão encerra a carência (`health_data_purge_at = NULL`) e vence também os pedidos de exportação na
  fila ou em geração; `app.health_grace_active()` ignora conta excluída. Nada de saúde é lido depois da exclusão.
- **B1:** o aviso de exclusão sai uma vez só, logo depois da confirmação (antes, a cada nova tentativa da purga).
- **B2:** textos dizem "acesso encerrado agora, apagamento em poucos minutos" (a purga é assíncrona).
- **B3:** o texto da anonimização fala dos registros de bem-estar e cita métricas de uso e comunicações autorizadas.
- **B4:** a purga conclui só o pedido `deletion`; os outros abertos saem como `rejected` (perderam o objeto, OI-33).
- **N4:** segundo envio da exclusão responde como concluída, sem página de erro.
**Não alterado.** **B5** (leitura do contato sem identificar o operador e sem teto): papel único por enquanto, sem
produção; registrado em OI-34 para a Fase 7 (papel por pessoa num grupo NOLOGIN). **N5** (arquivo órfão se o storage
falhar depois da purga): registrado em OI-35. **N1–N3, N6:** aceitas como estão (revogação provada por `revoked_at` +
`account_deleted`; funções de varredura no mesmo padrão de `privacy_due_health_eliminations`; logs só com contagens
globais; e-mails sem conteúdo de saúde).
**Consequências.** Os prazos e textos novos (`privacyCenter.requests.*`, `privacyCenter.deletion.*`) são RASCUNHO
(`LEGAL-REVIEW`; OI-33 exclusão imediata, OI-34 atendimento manual, OI-31 anonimização). Em produção, a credencial do
`app_operator` e a criação do papel entram no runbook da Fase 7. Retenção, modo privacidade e modo apresentação ficam
para a 6c (ADR-0035).

## ADR-0035 — Retenção, modo privacidade e modo apresentação (Fase 6c)
**Contexto.** Terceira entrega da Fase 6 (ADR-0032, ADR-0034). A retenção já tinha jobs e a checagem de backup no
`parseEnv` (ADR-0008), mas sem conferência fora do ambiente, sem documento único de prazos e com provas de
reautenticação esquecidas na tabela (PR1b-R2-B1). Ocultar valores existia só no twin, como estado local (ADR-0026),
e o peso continuava visível na timeline e nas metas (PR4-B8). O adendo (§44/§45) pede um modo privacidade e um modo
apresentação que o liga por padrão. Decisões do responsável pelo produto (2026-10-14): o modo privacidade oculta
peso, medidas, altura e calorias; o modo apresentação usa dados de demonstração por padrão, com opção "meus dados".
**Decisão.**
- **Política de retenção única** (`src/lib/retention.ts`): `assertRetentionPolicy` recusa backup > `PURGE_DAYS`,
  link > 24 h e AccessLog > 180 dias. Roda no início dos jobs (`startJobs`): sem política válida, nenhum job sobe. Os
  tetos (`RETENTION_LIMITS`) são os mesmos do `parseEnv`. `pnpm check:retention` (CI) confere o `.env.example` e a
  política declarada em `infra/retention.json`: backup cifrado, no Brasil, retenção igual a `BACKUP_RETENTION_DAYS`
  e ≤ `PURGE_DAYS`, recuperação a um ponto no tempo dentro da retenção, e a regra de ciclo de vida do prefixo
  `exports/` (≥ link + 1 h, ≤ `PURGE_DAYS`). A conferência no provedor real fica para a Fase 7.
- **Provas de reautenticação:** job diário `privacy.reauth_proofs_purge` com `app.privacy_purge_reauth_proofs()`
  (SECURITY DEFINER, `search_path` fixo, só a contagem): apaga, de todas as contas, as usadas e as vencidas há mais de
  1 minuto (a folga evita disputa com quem está consumindo a prova). Fecha PR1b-R2-B1.
- **Expiração das exportações:** o job de hora em hora já existia como `reports.expire` (ADR-0032); o nome fica (o
  plano o chamava de `privacy.exports_expire`). A varredura de arquivos órfãos (OI-35) não entra: o `StorageProvider`
  não lista objetos; fica a regra de ciclo de vida declarada, aplicada no provedor na Fase 7.
- **`docs/privacy/RETENTION.md`:** prazos, jobs, o pior caso (revogar: carência 30 + backup ≤ 30 = até 60 dias em
  backup; excluir: minutos + backup ≤ 30) e a reaplicação das eliminações depois de restaurar um backup (runbook).
- **Modo privacidade global:** cookie de sessão `__Host-hm_privacy` (`on`/`off`, HttpOnly, Secure, SameSite=Lax, sem
  identificador; só `on` liga), gravado por server action pública (como o período, vale no demo). O **servidor**
  omite os valores: as páginas leem o cookie e passam os dados por `src/modules/health/mask.ts` antes de qualquer
  componente (corpo e twin sem medidas nem altura; card do corpo sem peso, variação nem minigráfico; metas de peso e
  de calorias sem alvo, peso de partida nem progresso; timeline sem peso; refeições sem calorias). As telas mostram
  "oculto" (`<Masked>`, `maskBodyValue`), trocam gráficos e a lista do corpo por um aviso e bloqueiam a edição onde
  salvar sem o valor apagaria o dado (refeição com estimativa ligada, metas de peso e calorias). Resumos sem número
  (`bodyInsightsHidden`, `twinBodyInsightsHidden`). Datas e quantidade de registros continuam (PR3-B3). Botão na
  segunda linha do header (`aria-pressed`, ícone e texto; na primeira linha não cabe a 320 px) e indicador "Modo
  privacidade ativo." com atalho para desligar. O botão local do twin sai.
- **Twin no modo privacidade:** com dados próprios as medidas não saem do servidor e o modelo fica na **forma de
  referência** (a forma é derivada das medidas; mandar a forma seria mandar as medidas). No demo, a forma fictícia
  continua e só os números ficam ocultos.
- **Relatórios:** a tela usa `hide_body_values` igual ao modo; o arquivo começa em "Ocultar" (escolha por botões de
  opção: é preferência de exibição, não consentimento, então pode vir marcada; LEG-C02 vale para consentimento).
- **Modo apresentação (§45):** `/apresentacao` (conta, grupo `(presentation)`, fora do shell) e `/demo/apresentacao`
  (o shell do demo passou para `demo/(shell)`). Entrada e saída por server action (sem GET com efeito colateral):
  entrar grava o estado anterior do modo privacidade em `__Host-hm_presenting` (sessão) e liga o modo; sair o
  restaura (sem registro, fica ligado). Quem abre o endereço direto vê a tela de entrada antes de qualquer dado.
  Quatro telas (painel, corpo 3D, timeline sem filtros, relatório do mês) com os mesmos componentes e selos; setas,
  PageUp/PageDown, Home/End e botões navegam (as setas não agem dentro de campos e do controle de datas), Esc sai (em
  tela cheia, o navegador usa o Esc para sair dela), foco no título a cada troca, Fullscreen API quando existe (senão
  a janela inteira), sem animação de troca. Dados de demonstração por padrão (selo DEMO); "meus dados" só com conta no
  modo de dados próprios e consentimento ativo (`healthView`). Entrada pelo menu de ajuda.
- **Testes:** unidade (`assertRetentionPolicy`, `check:retention`, mascaradores e telas com "oculto", twin com
  `hidden`, telas da apresentação); banco (purga das provas de reautenticação); e2e `e2e/privacy-mode.spec.ts`
  (nenhum valor kg/cm/kcal no texto e nenhum valor gravado da pessoa no HTML de início, corpo, twin, metas, timeline,
  alimentação e relatórios, com controle positivo; demo; cookie de sessão; axe) e `e2e/presentation.spec.ts`
  (teclado, foco, Esc, privacidade ligada na entrada e restaurada na saída, "meus dados", sem consentimento, axe, sem
  IMC, 320 e 1920 px). A CI mede o JS de entrada das rotas da apresentação (o three.js segue sob demanda) e migra o
  banco de testes antes de subir o servidor do e2e (os jobs da subida falhavam contra um banco vazio).
**Revisão de privacidade (nada crítico nem alto; 2 médios, 5 baixos, 8 notas).** Corrigido, com teste:
- **M1:** apresentação abandonada (voltar do navegador, link para fora) deixava `__Host-hm_presenting` e a próxima
  entrada pulava a tela de entrada ou restaurava uma escolha velha. Agora o cookie vale no máximo 4 h, mudar o modo
  privacidade fora do deck o apaga (`setPrivacyModeAction(on, 'shell')`) e o painel da apresentação não tem links que
  saem do deck (`Dashboard links={false}`).
- **B2:** a lista de arquivos diz "Peso, medidas e calorias ocultos" (chave própria). **B3:** o estado do botão e da
  faixa acompanha o cookie a cada recarga e volta atrás se a action falhar. **B4:** Esc com um painel aberto
  (`aria-expanded="true"`) não sai da apresentação. **B5:** metas de peso e calorias suspensas pelo guardrail mostram
  só "Alvo e progresso ocultos" no modo (o aviso revelaria a relação entre alvo, peso e altura; o apoio segue fixo na
  tela de corpo). **N2:** Zod na action do modo. **N4:** o piso de `PROOF_RETENTION_DAYS` (365) entra em
  `assertRetentionPolicy` e no `check:retention`. **N5:** avisos fixos (`disclaimer.wellbeingOnly` e, no demo,
  `disclaimer.demoData`) no rodapé da apresentação. **N6:** chave `twin.controls.hidden` removida.
**Não alterado.** **M2** (sair da apresentação restaura o modo desligado e mostra os valores em seguida, um Esc depois
de sair da tela cheia): é a decisão do plano ("ao sair, volta ao estado anterior"); o risco fica registrado em OI-36(d)
para decisão do produto. **B1** (no demo, as medidas fictícias vão ao twin com o modo ligado, para a forma fictícia
continuar): dado sintético, decisão registrada acima; o e2e confere só dados próprios no HTML.
**Consequências.** PR4-B8 e PR1b-R2-B1 fechados; OI-23(e) feito na parte técnica. Os cookies de preferência e os
textos `privacyMode.*`/`presentation.*` são RASCUNHO (`LEGAL-REVIEW`, OI-36). O modo privacidade some ao fechar o
navegador (como o período); persistir entre sessões fica para decisão (OI-36 c). Arquivo órfão de exportação segue
em OI-35 (Fase 7).
