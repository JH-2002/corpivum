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
forma, em três variantes (feminino, masculino e neutro), em estilo de holograma azul semitransparente. Ela foi
interrompida pela reorientação (ADR-0027) e refeita só com o corpo; o cérebro e o BodyParts3D saíram. Isso
diverge do PRODUCT_SPEC §5 ("nunca imagens anatômicas realistas") e §15 ("neutro, sem traços realistas") e da
regra antiga do modelo humano em `docs/ASSETS.md`; a divergência fica no SPEC_ADDENDUM e em OI-24.
**Decisão.**
- **Realismo restrito à forma (LEG-M06):** sem pele, textura nem cor de pele. Superfície lisa, sem mamilos e
  sem detalhe genital, rosto estilizado (suavizado). Nenhum modelo identifica pessoa real. Não há teste
  automático para isso: cada troca de modelo traz capturas das três variantes (frente, perfil, costas) no PR.
- **Fonte:** MakeHuman/MPFB2, assets CC0 (o código do add-on é GPL; o modelo exportado é CC0 e não leva
  código). Download feito pelo responsável, fora do repositório; pipeline versionado em `scripts/assets/`
  (Blender headless + `gltfpack`). Cada arquivo tem linha em `docs/ASSETS.md` (fonte, autor, licença,
  SHA-256).
- **Pipeline:** por variante (macro de gênero 0, 0,5 e 1; demais macros no padrão), remove olhos, dentes e
  geometria auxiliar, suaviza peito, região genital e rosto, cria os morphs `<região>_min`/`<região>_max` a
  partir dos targets de circunferência do MakeHuman, decima uma cópia sem shape keys e transfere os morphs
  por Surface Deform. Cada região (peito, braço, cintura, quadril, coxa e o resto) é uma primitiva com
  material próprio: no three vira uma malha, o que reaproveita o clique e o destaque por região da Fase 3.
  A calibração (circunferência em cm em min, base e max e a altura da base) é medida na própria malha e
  gravada em `src/modules/twin/bodyAssets.ts` (arquivo gerado).
- **Servidos pelo próprio app:** `public/models/body-<variante>.<sha8>.glb`, nome por hash e
  `Cache-Control: immutable`. Nada é buscado fora do domínio (LEG-S10). Teste de fronteira: o único loader
  fica em `src/components/twin/scene/assets.ts`, com caminho relativo `/models/`; nenhuma URL absoluta nas
  cenas.
- **Compressão meshopt** (`EXT_meshopt_compression` + `KHR_mesh_quantization`), não Draco: o decodificador
  vem com o `three` (`three/addons/libs/meshopt_decoder.module.js`), entra no chunk 3D e não exige arquivos em
  `public/`. Ele compila WASM, então a CSP ganha `'wasm-unsafe-eval'` (permite só compilar WebAssembly; `eval`
  de JS continua bloqueado). `gltfpack` entra como devDependency de versão fixa, sem dependências
  transitivas (ADR-0009).
- **Orçamento testado no CI:** ≤ 300 KiB por variante (arquivo comprimido). O teste de conteúdo também
  confere hash × manifesto × `ASSETS.md`, a ausência de imagens, texturas e URIs externas, e os nomes das
  regiões e dos morph targets.
- **Forma só pelas medidas informadas:** `bodyMorphWeights` recebe só a `BodyShape` (circunferências e
  altura já limitadas por `bodyShape`), nunca o peso. Altura = escala uniforme. Medida ausente = forma base da
  variante, região esmaecida e "sem medida informada". Continua sem IMC, sem juízo e sem cor por dado.
- **Modelo do corpo é preferência de visualização:** `neutral` (padrão), `feminine` ou `masculine`, só no
  navegador (`localStorage`, `hm.twin.bodyModel`, ADR-0006), validada com Zod. Não vai ao servidor, não entra
  em cálculo e não é tratada nem inferida como dado de sexo ou gênero.
- **Material holográfico próprio** (`ShaderMaterial` com os chunks de morph do three): fresnel nas bordas,
  preenchimento translúcido e varredura sutil. Cores por tokens `--hm-holo-*` nos temas claro e escuro (no
  claro, mistura normal e azul mais escuro). A varredura só anda com a aba visível e o canvas na tela; com
  `prefers-reduced-motion`, fica parada e não há quadro extra.
- **Sob demanda e fallbacks em cascata:** o `.glb` só é pedido quando o 3D aparece, e só a variante escolhida.
  Enquanto carrega ou se falhar, a geometria gerada em código da Fase 3 com o mesmo material; sem WebGL, o
  SVG 2D (sem variante), e o `.glb` nem é buscado.
**Consequências.** Trocar um modelo exige rodar o pipeline, que regrava o manifesto e o nome por hash, e
atualizar `docs/ASSETS.md` (o teste falha se divergirem). Textos novos (`twin.bodyModel.*`) são RASCUNHO
(`LEGAL-REVIEW`, OI-24).