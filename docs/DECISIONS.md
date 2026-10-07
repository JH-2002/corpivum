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
