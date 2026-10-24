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
**Limite (P7-B5, ADR-0037).** O id da linha não faz parte do contexto: o envelope prende o texto à pessoa, à
tabela e à coluna, não ao registro. Quem escreve no banco troca textos cifrados entre registros da mesma pessoa
e coluna sem detecção (integridade, não sigilo).
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
    `MODEL_LOAD_TIMEOUT_MS` = 10 s sem o modelo (se ele chegar depois, assume no lugar; desde 2026-10-23 o prazo
    mede só a espera pela rede: arquivo recebido, a decodificação segue sem prazo, porque com WebGL por software
    ou CPU ocupada ela passava dos 10 s e o corpo em código aparecia sem falha nenhuma); contexto WebGL perdido
    e restaurado; variante sem arquivo no manifesto. Contexto perdido e não restaurado em
    `CONTEXT_RESTORE_TIMEOUT_MS` = 3 s: versão 2D (antes, a perda ia direto para 2D). Sem WebGL, continua o SVG
    2D e nada do 3D é baixado.
  - **Carga lenta (2026-10-23):** `SLOW_LOAD_MS` = 20 s sem o modelo pronto e sem erro (carregando, ou corpo em
    código pelo tempo limite da rede): abaixo da área do modelo, fora do `role="img"` e numa região `role="status"`,
    aparece "Está demorando mais que o esperado. O modelo 3D continua carregando." com o botão "Ver versão 2D". A
    cena segue tentando até a pessoa escolher; escolhido o 2D, a cena 3D sai e o aviso passa a "Você está vendo a
    versão 2D, com as mesmas informações." (não o de navegador sem 3D). A escolha vale até recarregar a página.
    Rede de segurança para a decodificação sem prazo (ver o tempo limite acima). Teste: `slow-load.test.tsx`.
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
  entrar marca a apresentação em `__Host-hm_presenting` e liga o modo; sair o mantém ligado, com aviso e botão
  para desligar (OI-36 d; a versão inicial restaurava o estado anterior, ver revisão M2). Quem abre o endereço direto vê a tela de entrada antes de qualquer dado.
  Quatro telas (painel, corpo 3D, timeline sem filtros, relatório do mês) com os mesmos componentes e selos; setas,
  PageUp/PageDown, Home/End e botões navegam (as setas não agem dentro de campos e do controle de datas), Esc sai (em
  tela cheia, o navegador usa o Esc para sair dela), foco no título a cada troca, Fullscreen API quando existe (senão
  a janela inteira), sem animação de troca. Dados de demonstração por padrão (selo DEMO); "meus dados" só com conta no
  modo de dados próprios e consentimento ativo (`healthView`). Entrada pelo menu de ajuda.
- **Testes:** unidade (`assertRetentionPolicy`, `check:retention`, mascaradores e telas com "oculto", twin com
  `hidden`, telas da apresentação); banco (purga das provas de reautenticação); e2e `e2e/privacy-mode.spec.ts`
  (nenhum valor kg/cm/kcal no texto e nenhum valor gravado da pessoa no HTML de início, corpo, twin, metas, timeline,
  alimentação e relatórios, com controle positivo; demo; cookie de sessão; axe) e `e2e/presentation.spec.ts`
  (teclado, foco, Esc, privacidade ligada na entrada e mantida ligada na saída (OI-36 d), "meus dados", sem consentimento, axe, sem
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
**M2** (sair da apresentação restaurava o modo desligado e mostrava os valores em seguida, um Esc depois de sair da
tela cheia): **resolvido por decisão do produto (2026-10-15, OI-36 d), substituindo o "volta ao estado anterior" do
plano**: ao sair, o modo privacidade continua ligado; o destino (`/inicio` ou `/demo`, com `?apresentacao=encerrada`)
mostra no indicador "Você saiu da apresentação. O modo privacidade continua ligado..." e o botão para desligar.
`__Host-hm_presenting` passa a guardar só `on.<expiração>` (apresentação em curso, cookie de sessão com o prazo de 4 h
no valor), sem o estado anterior; o aviso aparece uma vez, leva o foco e o parâmetro sai da URL. Exceção aceita: quem
desliga o modo dentro do deck e sai pelo voltar do navegador chega com o modo desligado (escolheu mostrar os valores;
OI-36 d). e2e na conta e no demo.
**Não alterado.** **B1** (no demo, as medidas fictícias vão ao twin com o modo ligado, para a forma fictícia
continuar): dado sintético, decisão registrada acima; o e2e confere só dados próprios no HTML.
**Consequências.** PR4-B8 e PR1b-R2-B1 fechados; OI-23(e) feito na parte técnica. Os cookies de preferência e os
textos `privacyMode.*`/`presentation.*` são RASCUNHO (`LEGAL-REVIEW`, OI-36). O modo privacidade some ao fechar o
navegador (como o período); persistir entre sessões fica para decisão (OI-36 c). Arquivo órfão de exportação segue
em OI-35 (Fase 7).

## ADR-0036 — Plano da Fase 7 (endurecimento e pré-lançamento) no escopo atual
**Contexto.** O prompt da Fase 7 (`docs/prompts/fase-7-endurecimento.md`) é anterior ao ADR-0027 e ao ADR-0030: cita
um threat model com IA, "finalizar" documentos cujos placeholders dependem de decisões humanas e IaC com hospedagem
ainda não escolhida (OI-11). Decisões do responsável pelo produto (2026-10-15), ao aprovar o plano:
**Decisão.**
- **Divisão:** 7a threat model, revisão de privacidade do repositório inteiro e escopo do pentest (só documentos e
  triagem); 7b endurecimento de segurança; 7c observabilidade (LEG-R04); 7d e2e, acessibilidade e performance
  (LEG-X01, §41, §42); 7e operação (backup e restauração, infra declarada, storage, runbooks; LEG-S07, S10); 7f
  governança (ROPA, RIPD, SUBPROCESSORS, INTENDED_USE, documentos públicos e OPEN_ISSUES consolidado para o
  jurídico; LEG-G01–G05). Cada sub-fase fecha com testes, `privacy-reviewer`, PR, CI verde e merge commit.
- **D1 (infra):** sem Terraform enquanto não houver hospedagem. `infra/regions.json` declara banco, storage, fila,
  KMS, execução das funções e backups em região no Brasil, conferido na CI por `pnpm check:infra` (padrão do
  `check:retention`), com runbook de provisionamento. Terraform só depois da escolha (CHECKLIST_GO_LIVE).
- **D2 (erros):** adaptador `ErrorReporter` (implementação local agora) com remoção de PII testada, ligado ao
  `onRequestError`. O fornecedor fica para o checklist (OI-03, OI-11).
- **D3:** corrigir na 7b todos os achados baixos e médios abertos que não dependem do checklist, para o pentest
  partir de uma base limpa.
- **D4 (PR1b-R2-M1):** o teto global de encerramentos de menor vira pedido pendente processado por job, sem
  bloquear quem se declarou menor.
- **D5:** papel `app_worker` separado para os jobs (PR1b-M1 residual, PR1b-B3) e um papel de login por pessoa
  para o atendimento manual, num grupo NOLOGIN com os GRANTs (OI-34 b).
- **D6:** push (OI-27) e fuso por conta (PR4-B5) ficam fora da Fase 7.
- **D7:** a rodada manual com leitor de tela (NVDA) e celular real é feita pelo responsável pelo produto, com
  roteiro entregue na 7d. O resto da acessibilidade e da performance é automatizado.
**Fora do alcance do código (CHECKLIST_GO_LIVE).** Controlador, encarregado, hospedagem e região, DPAs e art. 33,
pentest, revisão clínica e jurídica, teste de restauração no provedor real, canal de suporte e beta fechado. Os
documentos ficam consolidados, com os placeholders `{{...}}` padronizados, mas não são "finais" sem essas decisões.
**Produção ainda não sobe.** O `parseEnv` recusa em produção os adaptadores locais (`KMS_PROVIDER`,
`STORAGE_PROVIDER`, `MAIL_PROVIDER` só têm implementação de desenvolvimento) e a fila em memória: os adaptadores
reais entram depois da escolha dos fornecedores.
**Entrega da 7a.** `docs/security/THREAT_MODEL.md` (STRIDE por fronteira, residuais ligados aos achados e itens
novos TM-01 a TM-05) e `docs/security/PENTEST_SCOPE.md` (ligado no CHECKLIST_GO_LIVE). Revisão do `privacy-reviewer`
no repositório inteiro: nada crítico nem alto, nenhuma regressão de item resolvido; 3 médios, 10 baixos e 6 notas
registrados em OPEN_ISSUES ("Revisão do repositório inteiro", P7-*) com a sub-fase de cada um. Corrigido na 7a só o
que é documento da própria entrega: o threat model passa a tratar o código que executa como o runtime (P7-M1), os
pedidos de prefetch fora do proxy (P7-N1) e o AuditLog do download (P7-N5); status do PR-IA-M1 (P7-N4).
**Pendente de decisão do produto antes da 7b:** P7-M2 (conta verificada sem onboarding não tem como ser excluída nem
encerrada e não tem prazo de retenção).

## ADR-0037 — Fase 7b: endurecimento de segurança (papéis, saída sem onboarding, achados D3)
**Contexto.** ADR-0036 D3, D4 e D5 e o P7-M2, decidido pelo responsável pelo produto antes da 7b: **opção (c)**,
os três caminhos juntos (autoatendimento no onboarding, prazo para contas sem onboarding e registro de pedido
recebido fora do app pelo encarregado).
**Decisão — papéis (D5).**
- `app_worker` (LOGIN, sem BYPASSRLS, membro do `app_user` com `INHERIT TRUE, SET FALSE`) é o **único** que
  executa varreduras, expurgos, fila e purga de conta (`fase_7b_papeis`): o runtime web deixa de alcançá-las
  (PR1b-M1 residual, PR1b-B3, P7-N6). `WORKER_DATABASE_URL` é obrigatória onde a fila é consumida; o `parseEnv`
  recusa `app_worker` e `operador_*` como papel do runtime. Criado fora das migrações (`04-worker-role.sh`,
  `pnpm db:worker:init`); a migração falha se o papel não existir.
- `app_operator` vira grupo NOLOGIN; cada pessoa que atende tem o próprio papel de login `operador_<nome>`
  (`operador_dev` em dev). Toda função `app.operator_*` grava o `session_user` em `audit_logs.operator_role` (só o
  nome técnico) e a leitura do contato tem teto de 30 por hora por pessoa (OI-34 b).
- `UPDATE (deleted_at)` revogado do runtime; `account_purge` exige pedido `deletion`/`minor_closure` em andamento e
  apaga também os jobs da pessoa (P7-B1, P7-N2). `UPDATE` em `sessions` só nas colunas que o runtime muda
  (PR1a-R2-B5). AuditLog "do sistema" só por `audit_append_system`, com lista fechada (PR1b-B2). Fila: `jobs_fail`
  só apaga o job do próprio worker e as varreduras pulam contas com job falho (PR1b-B8 b/c; a idempotência dos
  handlers, item a, fica documentada no adaptador).
**Decisão — P7-M2 (opção c).**
- Tela mínima `/boas-vindas/encerrar-conta`, com link no rodapé de todo o onboarding: excluir a conta ou encerrá-la
  por ser menor exige só o e-mail confirmado (`requireOnboardingExitSession`) e a mesma reautenticação da Central,
  nunca o aceite dos Termos nem as escolhas de consentimento.
- Conta verificada que não conclui o onboarding: aviso por e-mail no 23º dia (`onboarding-expiry-notice`) e
  exclusão 30 dias após o cadastro **e** 7 dias após o aviso (sem aviso enviado, nada sai), no job diário
  `privacy.onboarding_expiry` (`app_worker`). AuditLog sem pessoa nem recurso.
- `pnpm privacy:requests register <tipo> <data>` registra pedido recebido fora do app (prazo de 15 dias a partir do
  recebimento; e-mail lido do terminal) e `delete <id>` corta o acesso na exclusão ou encerramento pedidos assim; a
  purga é do job de hora em hora.
**Decisão — D4.** Acima do teto de 50 encerramentos por hora, o encerramento de menor corta o acesso na hora e fica
como pedido `minor_closure` em andamento; `privacy.account_purge_sweep` passa a rodar de hora em hora.
**Decisão — achados D3 (autenticação).**
- Pepper próprio dos códigos de recuperação, `RECOVERY_CODE_PEPPER` (PR1a-B3): girar o `SESSION_SECRET` não
  invalida os códigos. Sem migração de dados: produção não subiu; em dev, quem tem MFA gera códigos novos.
- Limite `mfaAccount` conta só falhas (`app.rate_limit_peek` + registro na falha), e a senha é conferida antes do
  código ao desligar o MFA, excluir a conta e encerrar como menor (PR1a-R2-B1/B2, P7-B2). Ativação do TOTP com
  erros distintos e sem aviso `mfa_locked` a quem ainda não tem MFA; segredo vencido sai na hora (PR1a-R3-B6/B7).
- `security-alert` também na redefinição de senha e nos códigos novos (PR1a-R2-B4). Teto diário de 10 e-mails por
  destinatário somando cadastro, reenvio e redefinição (a redefinição de aparelho conhecido não conta), com log
  `auth.mail_rate_limited` só com a operação (PR1a-R3-B1/B9).
- Link de verificação nunca vale além do expurgo de 7 dias e `verifyEmail` usa `updateMany` (PR1a-R3-B2); o prazo
  de 7 dias aparece nas telas de cadastro (PR1a-R3-B3); casos negativos do expurgo testados (PR1a-R3-B4).
- `CLIENT_IP_HEADER` recusa `x-forwarded-for`, e o cabeçalho ausente gera `auth.client_ip_missing` (sem dado),
  porque todos cairiam no mesmo balde de limite (PR1a-R2-B3).
- Cookie de aparelho conhecido `v2`, assinado sobre a impressão SHA-256 do hash de senha: o pedido de redefinição
  usa `app.auth_find_reset`, que nunca devolve o hash (PR1b-R2-B3), e o HMAC é calculado também sem conta
  (PR1b-R2-B2). Cookies `v1` deixam de valer (efeito só de disponibilidade).
- Tokens de verificação e de redefinição no fragmento (`#token=`): não chegam ao servidor nem aos logs da
  hospedagem; a página lê o token, limpa o endereço com `history.replaceState` e envia por POST. Links antigos com
  `?token=` continuam valendo e também são limpos (TM-01).
**Decisão — headers, CSP e borda.**
- Prefetch passa pelo proxy (sem `missing` no matcher): CSP e `no-store` em toda resposta, inclusive
  redirecionamento sem sessão (P7-N1). E2E dos cabeçalhos por classe de resposta: pública, autenticada, 404,
  redirecionamentos do proxy (sem sessão e rotas removidas, que saem do `next.config` para levar CSP), route handler, prefetch e server action (TM-02).
- Limite por IP em memória no proxy para o demo (300/min) e para server actions sem cookie de sessão (60/min),
  com 429, CSP e `no-store`; fora de produção a própria máquina não é limitada (TM-03, parte da aplicação; a
  hospedagem fica para a 7e). O IP fica só na memória da instância, durante a janela.
**Decisão — outros achados.** Segurança da conta sem exigir aceite de versão nova (P7-B3); teste de guarda varre
todo `'use server'` dos grupos autenticados, inclusive `(presentation)`, e recusa exports fora de
`export async function` (P7-B4, PR1a-R2-B8). Reconciliação diária dos lembretes (`reminder.reconcile`, lista
`app.reminders_active` só no `app_worker`): cadeias paradas voltam (PR4-B1).
**Não corrigido em código.**
- **P7-B5:** o id do registro fica fora da AAD; documentado em `field.ts` e no ADR-0016. Quem troca textos
  cifrados entre registros já escreve no banco (ator do P7-M1); incluir o id exigiria envelope novo e recifrar tudo.
- **P7-M1 (avaliado):** amarrar `app.current_user_id()` ao token conferido em `sessions` exigiria mover para funções
  SECURITY DEFINER todos os fluxos antes da sessão (cadastro, verificação, login, MFA, redefinição), um caminho
  próprio para os jobs e uma busca por linha em todas as políticas RLS, e o ganho é parcial: código como o runtime
  ainda vê os tokens das requisições em curso e usa o KMS. Fica como residual, mitigado na 7b (jobs e purga fora do
  runtime, operador por pessoa, `deleted_at` e purga amarrados ao pedido), com alerta de volume anômalo na 7c e
  registro no RIPD na 7f.
- **Política v2:** o prazo das contas sem onboarding entra no texto da Política na 7f (mudança de texto versionado,
  com aviso), junto do `RETENTION.md` (P7-N2). Até lá, a tela de saída e o e-mail de aviso informam o prazo.
**Revisão do `privacy-reviewer` (7b).** Nada crítico nem alto. Corrigido: **M1** a separação do D5 só vale por
inteiro com o worker dedicado (OI-14 a): o `parseEnv` recusa em produção `WORKER_DATABASE_URL` numa instância web
(`JOB_WORKER=off`) e o go-live exige o worker (CHECKLIST_GO_LIVE); **M2** só um cookie de sessão com o formato do
token tira a action do balde anônimo; **M3** o teto diário vale só para cadastro e reenvio (a redefinição fica fora,
senão um terceiro bloquearia a recuperação por 24 h); **B1** as actions da saída no onboarding usam
`requireOnboardingExitSession` (quem concluiu vai à Central, com a oferta de baixar os dados); **B3** pedido do
titular aberto segura a exclusão automática da conta sem onboarding; **B4** `privacy.closures_stalled` conta
exclusões e encerramentos com a purga parada há mais de 1 hora, com passo de runbook para reenfileirar; **B5**
`exports_mark_file_deleted` só marca exportação da pessoa do contexto; notas: data de recebimento do pedido ao
meio-dia de Brasília, prazo de 30 dias no rodapé de todo o onboarding e `db:verify-roles` confere que o `app_user`
não executa varreduras (migração `fase_7b_revisao`). Aceito e registrado (OPEN_ISSUES 7b-R*): **B2** rajada de
tentativas simultâneas do 2º fator pode passar um pouco do teto (consulta e registro separados; o limite por
sessão e o de login seguem); **B6** `audit_append_system` continua no `app_user` porque o aviso de exclusão é
gravado na web e o efeito se limita à própria conta.
**Consequências.** `.env` ganha `APP_WORKER_PASSWORD`, `WORKER_DATABASE_URL`, `TEST_WORKER_DATABASE_URL` e
`RECOVERY_CODE_PEPPER`; o `OPERATOR_DATABASE_URL` passa a usar `operador_dev`. Volumes antigos: `pnpm
db:operator:init && pnpm db:worker:init` antes de `pnpm db:deploy`. Migrações `fase_7b_papeis`, `fase_7b_direitos`,
`fase_7b_auth`, `fase_7b_lembretes`, `fase_7b_revisao`.

## ADR-0038 — Fase 7c: observabilidade sem dado pessoal (ErrorReporter, guarda do console, alerta de volume)
**Contexto.** ADR-0036 D2 e os itens marcados para a 7c: PR1a-B5 (erros fora do logger), P7-M1 (alerta de volume
anômalo de leitura) e 7b-R3 (consulta do encarregado sem rastro). LEG-R04: logs sem dado de saúde e remoção de PII
na ferramenta de erros. O fornecedor da ferramenta ainda não foi escolhido (OI-03, OI-11).
**Decisão — relatório de erro.**
- Adaptador `ErrorReporter` (`src/adapters/error-reporter`): `console` grava o relatório no log estruturado e vale
  também em produção (é o próprio log filtrado); `memory` só para testes, recusado em produção pelo `parseEnv`
  (`ERROR_REPORTER`). O fornecedor externo entra depois do CHECKLIST, em SUBPROCESSORS.
- O `onRequestError` monta o relatório por **lista de campos permitidos** antes de qualquer adaptador
  (`src/lib/observability/error-report.ts`): do erro, nome, código (`AppError`, Prisma, SQLSTATE, Node), `digest`
  numérico do Next, nome e código de um nível da causa e até 10 quadros `arquivo:linha:coluna` sem pasta (a pasta
  pode ter o nome de quem roda); da requisição, só o método e a rota como arquivo (`context.routePath`). Nunca a
  mensagem (nem as linhas dela que imitam quadros), propriedades extras, `request.path` (query e valores dos
  segmentos), cabeçalhos, cookies ou corpo. Cada campo tem formato fechado; getter que lança ou Proxy não derruba o
  relatório, e falha ao relatar vira só `error.report_failed`.
- **Guarda do console em produção** (`installConsoleGuard`, no `register()`): o `onRequestError` não impede o Next
  de imprimir o erro original. `console.error`/`warn` só deixam passar linha do logger (filtrada de novo), erro
  reduzido como no relatório, números e booleanos; o resto vira `[redacted]`. Em desenvolvimento a mensagem
  continua no terminal (dados sintéticos).
- Teste de injeção (`error-report.test.ts`): medidas, notas, alimentação, e-mail, telefone, token e cookie na
  mensagem, na causa, em propriedades extras, no `digest` de redirecionamento, no caminho, nos cabeçalhos e no corpo;
  nada sai no relatório, no log nem no console.
**Decisão — revisão do esquema do logger.** Saem os campos sem uso (`durationMs`, `status`, `region`); `requestId`
vira `privacyRequestId` (era o id do pedido do titular e se confundiria com o id de relatório); entram só `reportId`,
`errorName`, `digest`, `route` (formato de rota como arquivo), `routeType`, `method`, `frame` (formato de quadro) e
`threshold`. `userId` continua (UUID técnico, nunca e-mail). `sanitizeLogLine` refiltra uma linha já serializada
(usada pela guarda).
**Decisão — alerta de volume (P7-M1).** Job `observability.volume_check` de hora em hora, no `app_worker`: a função
`app.security_volume_sample()` lê os contadores do Postgres (`seq_tup_read` das tabelas e `idx_tup_read` dos índices,
que conta também a varredura só pelo índice) das tabelas de saúde, de `users` e de `consent_records`, guarda o total
em `app.read_volume_samples` (fora do `public`, sem acesso de `app_user`, `app_worker` nem operador; 8 dias) e
devolve a leitura num **período de relógio** (amostra atual contra a mais recente com pelo menos 55 minutos) e a
**linha de base**: mediana das taxas por hora dos 7 dias anteriores (só com 24 taxas ou mais). Alerta
`security.read_volume_anomaly` acima de `max(100.000, 5 × linha de base)` por hora (calibração inicial; ajuste no
CHECKLIST). Nada que o runtime grava entra no teto: o runtime não altera esses contadores, e o sinal não depende de o
código passar pelo app.
**Decisão — 7b-R3.** `operator_request_register` grava AuditLog `privacy_request_lookup` (só o papel; sem pessoa no
caso de e-mail sem conta) quando não abre pedido, e também `RAISE LOG` com a ação e o papel (nunca o e-mail), que
fica no log do servidor do banco mesmo se quem chamou desfizer a transação. A mesma amostra devolve o maior número
de ações de um papel de operador no período: acima de 20 por hora, `security.operator_volume_anomaly`.
**Revisão do `privacy-reviewer` (7c).** Nada crítico. Corrigido: **A1** o teto usava pessoas com sessão usada, e o
runtime grava `sessions.last_seen_at` de qualquer conta (P7-M1): virou linha de base pelo histórico das amostras;
**M1** com a credencial do worker na web (OI-14 a), uma chamada extra "gastava" o delta: período de relógio;
**M2** o AuditLog da consulta some com ROLLBACK: `RAISE LOG`; **B1** mensagem trocada depois da pilha: nenhum
quadro sai; **B2** `?host=` contornava a trava local do `resync-migration`; **B3** `users`, `consent_records` e
varredura só pelo índice entram na soma; **B4** `db:verify-roles` confere também o operador e `TRUNCATE`;
`privacy_request_lookup` fora do tipo `AuditAction` do runtime. Aceito e registrado (OPEN_ISSUES 7c-R*):
linha de base que sobe devagar, leitura lenta de poucas contas, enumeração abaixo de 20 por hora, saídas fora da
guarda (`console.log`, `process.stderr`, erros de job) e o `digest` do Next (hash de mensagem e pilha) confirmável
por dicionário quando a mensagem tem poucos valores possíveis (os erros da aplicação são tipados e sem dado).
**Consequências.** `.env` ganha `ERROR_REPORTER` (padrão `console`). Migração `fase_7c_observabilidade`. Runbook
`docs/runbooks/ALERTS.md`. `db:verify-roles` confere que só o `app_worker` executa a amostra (nem `app_user` nem
operador) e que nenhum deles lê ou altera as amostras. Preparação da sub-fase: `.gitattributes` força LF em `prisma/migrations/**` e `*.sql` (checksum das
migrações no Windows) e `pnpm db:resync-migration` reaplica funções de uma migração da branch já aplicada nos bancos
locais (`LOCAL_DEV.md`).

## ADR-0039 — Fase 7d: qualidade (fechamento do 7c-R3, e2e, acessibilidade e performance)
**Contexto.** ADR-0036 (7d: LEG-X01, §41, §42; D7: rodada manual com leitor de tela e celular feita pelo
responsável pelo produto) e o 7c-R3, fechado na mesma branch por pedido do responsável pelo produto.
**Decisão — 7c-R3 (LEG-R04).**
- Erros de job passam pelo mesmo `ErrorReporter` e pela mesma lista de campos do `onRequestError`:
  `buildJobErrorReport` (nome, código, quadros e causa reduzidos; do job só nome `dominio.acao`, id, tentativa e
  adaptador; o payload nunca é lido) e `createJobErrorSink`, ligado às duas filas por `createAdapters`. O
  `job.failed` e a coluna `last_error_code` levam só o nome reduzido (antes, `error.name` cru). Teste de injeção
  na fila em memória e na Postgres.
- `tests/security/no-console-output.test.ts` lê a árvore sintática de `src/` (comentário não conta;
  `eslint-disable`, alias, `globalThis.console`, desestruturação e import de `node:process` não escapam) e recusa
  `console` e `process.stdout`/`stderr` fora do logger e da guarda do console; o ESLint ganha
  `no-restricted-properties` para o editor. Saída de dependências continua fora (residual no 7c-R3, 7e).
**Decisão — e2e e acessibilidade (LEG-X01, §42).**
- Inventário de todas as páginas (`PAGES` em `e2e/routes.ts`), com o jeito de chegar em cada uma; o axe roda em
  todas nos temas claro e escuro (`a11y.spec.ts`), e um teste unitário falha se uma `page.tsx` ficar fora. Os
  laços de axe duplicados do demo e das telas de conta saíram.
- Lacunas dos fluxos críticos (`critical-flows.spec.ts`): consentimento dado na interface do onboarding seguido
  de registro, saída da conta no onboarding (P7-M2) e os guardrails de ritmo e de calorias. Mapa completo em
  `docs/qa/COBERTURA_E2E.md`.
- Fluxos críticos só com teclado (`keyboard.spec.ts`), com contorno de foco conferido a cada Tab. Achados e
  corrigidos: bloqueio de meta sem anúncio (7d-A1, agora `role="alert"` com foco), foco que voltava ao topo
  depois do registro rápido (7d-A2, agora vai ao primeiro campo de `#novo`) e e-mail apagado depois de erro de
  login (7d-A3, WCAG 3.3.7). O botão nativo do calendário dentro dos campos de data recebe o foco do navegador e
  fica para a conferência visual do roteiro.
- Roteiro manual em português simples para NVDA e celular (`docs/qa/ROTEIRO_MANUAL.md`), com tabela OK/Problema.
  No celular, o acesso ao app local é pelo redirecionamento de porta USB do Chrome no Android (os cookies
  `__Host-` exigem `https` ou `localhost`); iPhone fica para `https` local se for preciso (7d-N3).
**Decisão — performance (§41).**
- `perf-budget.json` é a fonte dos tetos; `pnpm check:perf-budget` (job de qualidade, depois do build) confere o
  JS de entrada por rota em gzip, o three.js fora da entrada (ADR-0026), o maior chunk do cliente e o tamanho de
  cada `.glb` e do total. `scripts/route-js.mjs` passa a exportar a medição.
- `e2e/perf.spec.ts` (projeto `perf`, job próprio na CI, só no build de produção): cache frio, rede 4G lenta
  (RTT 150 ms, 1,6 Mbit/s, 750 kbit/s; referência do Lighthouse para celular), CPU 4×, viewport de celular;
  "interativo" = o botão do modo privacidade responde (antes da hidratação o toque não faz nada); mediana de 5
  cargas ≤ 2.500 ms em `/inicio` (pessoa com 90 dias sintéticos) e `/demo`. O atraso de rede emulado pelo CDP não
  vale para a requisição da navegação, então o que faltou dos 150 ms é somado à medida.
- Medição inicial: 3,4 s (379 KiB gzip). Corrigido (7d-P1): o recharts sai da entrada (`TimeChartPlot` e
  `SparklinePlot` por `next/dynamic` sem SSR; o `ResponsiveContainer` não desenha nada no servidor, então o HTML
  inicial não muda, e título, selo, legenda e tabela alternativa continuam fora do chunk) e `src/lib/period.ts` fica
  sem Zod (o seletor de período do cabeçalho levava o núcleo do Zod 4 a toda tela; até o `zod/mini` custava ~24 KiB
  gzip): a validação com Zod do período vindo do navegador fica em `period-schema.ts`, só no servidor. Resultado:
  173 KiB; na CI, mediana de 5 cargas de 2,48 s em `/inicio` e 2,14 s em `/demo`. A folga do `/inicio` é muito
  pequena (cargas até 2,9 s): o próximo corte é escopar as traduções enviadas ao navegador (hoje o catálogo inteiro
  vai no HTML), registrado em 7d-P1.
- **CPU calibrada (decisão do responsável pelo produto, 2026-10-16).** Com o mesmo código, o runner da CI dava de
  2,4 a 3,2 s: o 4× vinha em cima de uma máquina compartilhada, mais lenta e variável (cargas com o JS pronto em
  2,0 s e interativas só em 3,2 s). Como o Lighthouse, "4×" passa a ser 4× mais lento que a **máquina de
  referência** (o computador do desenvolvimento, onde a meta foi medida): antes de cada carga, um teste fixo de
  JavaScript (`benchmarkMs`, ~270 ms na referência) mede a máquina, e o multiplicador é `4 × 270 / medido`, entre
  1× e 8× (`perf-budget.json`, `dashboard.cpu`). O log mostra o multiplicador e o teste de cada carga. Trocar de
  máquina de referência exige medir de novo e registrar aqui. Tentativa descartada: adiar o desenho dos gráficos
  até o navegador ficar ocioso não mudou as medianas na CI e foi revertida.
**Revisão do `privacy-reviewer` (7d).** Nada crítico, alto nem médio. Corrigido: **B1** buracos do teste
estático (import padrão e namespace, apelido e desestruturação de `process`, `node:console`, `require`,
`emitWarning`/`_rawDebug`, `writeSync(1|2)`, arquivos `.js`); **B2** o relatório de erro de job vem depois do
`jobs_fail`, protegido e com teto de 3 s (`notifyJobError`), para não segurar o lock nem pular o backoff; **B3**
roteiro com janela anônima, sem salvar senha, `pnpm dev -H localhost` e desligamento do redirecionamento e da
Depuração USB. Nota aberta em 7d-N4 (formato aberto dos nomes de erro).
**Consequências.** Scripts `test:perf` e `check:perf-budget`; o job de e2e roda só o projeto `chromium`;
`E2E_PROD=1` usa o build de produção também fora da CI. Os testes do twin com WebGL real não rodam de forma
estável no Windows local (7d-N2); a CI é a referência.

## ADR-0040 — Fase 7e: operação (backup e restauração, regiões declaradas, órfãos do storage, runbooks)
**Contexto.** ADR-0036 (7e: LEG-S07, LEG-S10; D1) e os itens marcados para a 7e: P7-M3 (reaplicação depois de
restaurar), OI-35 (arquivo de exportação órfão), o restante do 7c-R3 (saída de dependências), P7-B6 e P7-B7. A
hospedagem ainda não foi escolhida (OI-11): o que depende dela fica nos runbooks com `{{...}}` e no CHECKLIST.
**Decisão — backup e restauração (LEG-S07).**
- `pnpm backup:create`: `pg_dump` do banco de `MIGRATION_DATABASE_URL` pelo contêiner do docker compose, no
  **mesmo snapshot** das contagens por tabela (`pg_export_snapshot` + `--snapshot`), direto para um arquivo
  AES-256-GCM (`src/lib/backup/container.ts`: magic como dado autenticado, manifesto com ponto do backup, migrações
  e contagens dentro da cifra). O dump nunca toca o disco sem cifra. Chave própria `BACKUP_ENCRYPTION_KEY`, recusada
  se igual a outro segredo.
- `pnpm backup:restore`: confere a etiqueta no arquivo inteiro **antes** de qualquer byte chegar ao banco, restaura
  num banco isolado `<banco>_restore` (nunca o da aplicação nem o de testes) com os mesmos donos e acessos, confere
  as contagens contra o manifesto, aplica as migrações pendentes, roda `db:verify-roles` e reaplica. `backup:drop`
  destrói o banco isolado. `create`, `restore` e `drop` recusam `APP_ENV=production`: em produção o backup é do
  provedor e só a reaplicação (`backup:reapply`) roda contra a instância restaurada.
**Decisão — reaplicação (P7-M3).** Funções da migração `fase_7e_operacao`, executáveis só pelo dono
(`app_migrator`; `db:verify-roles` e `rls.test.ts` conferem), e `src/modules/privacy/restore.ts`:
- **Livro** (`app.restore_ledger`, um snapshot na origem): ids e estado das contas (sem e-mail) e as provas criadas
  ou alteradas depois do ponto (consentimentos, aceites, pedidos, AuditLog, registros de acesso). Nenhum dado de
  saúde. Vem da origem (`--source`) ou de um arquivo cifrado `pnpm backup:ledger` guardado fora do banco
  (`--ledger`), para quando a origem se perde.
- **No banco restaurado:** provas copiadas com as datas da origem (gatilhos de data desligados só dentro da
  transação); contas que não existem mais na origem ou lá estão excluídas: as não verificadas saem direto, as outras
  têm o acesso cortado e passam pela purga normal (`app.account_purge` + eliminadores), com o pedido de encerramento
  devolvido à situação da origem depois; dados de saúde eliminados na origem saem de novo mesmo com consentimento
  ativo (o backup é anterior à eliminação); agendamento de eliminação igual ao da origem; sempre, com ou sem livro:
  sessões revogadas, tokens e provas de reautenticação apagados, links de exportação vencidos, expurgo de
  autenticação e AuditLog `restore_reapplied` com o papel de quem rodou.
- O ensaio completo (backup, mudanças depois dele na origem, restauração, reaplicação) roda na CI
  (`tests/db/backup.test.ts`, job "Banco"). Residuais: 7e-R1 (sem origem nem livro, o intervalo se perde; PITR e
  livro de hora em hora no CHECKLIST) e 7e-R2 (senha e 2º fator trocados depois do ponto voltam).
**Decisão — D1 (LEG-S10).** `infra/regions.json` declara funções, worker, logs, banco, backups, fila, storage e KMS
com fornecedor `{{...}}` e região obrigatória no Brasil, e os serviços fora do Brasil (e-mail e erros, sem dado de
saúde). `pnpm check:infra` na CI confere as regiões, o `APP_REGION`, a região dos backups contra
`infra/retention.json` e a linha de cada serviço de fora em `SUBPROCESSORS.md`. Runbook `PROVISIONING.md`.
**Decisão — OI-35.** `StorageProvider.list(prefix, limit)` (local: leitura recursiva sem os metadados) e
`sweepOrphans` no job `reports.expire`: chaves `exports/<pessoa>/<pedido>.bin` que nenhum pedido com arquivo vivo
reconhece (`app.exports_orphans`, só `app_worker`) são apagadas; chave fora do formato só conta no log
(`reports.orphans_unknown`). O pedido nasce antes do arquivo, então uma geração em curso nunca é órfã.
**Decisão — 7c-R3 (LEG-R04).** A guarda do console em produção passa a cobrir `log`, `info`, `debug`, `trace`,
`dir` e `table`, além de `error` e `warn`: `console.*` do Next, do Prisma e do `pg` só sai como linha do logger.
Fica de fora a escrita direta em `process.stdout`/`stderr` por dependência (7e-N1).
**Decisão — outros.** P7-B6: CODEOWNERS nas áreas sensíveis. P7-B7: imagens fixadas por digest (o Dependabot
atualiza a do compose; as da CI à mão). Runbooks novos `WORKER_DEPLOY.md` (OI-14 a: mesmo build com
`JOB_WORKER=inline`, sem entrada pública; 7e-N2), `OPERATOR_CREDENTIALS.md` (criar, trocar a cada 90 dias e remover
o papel `operador_<nome>`), `PROVISIONING.md`; `BACKUP_RESTORE.md` reescrito com o ensaio local passo a passo e a
restauração no provedor; `INCIDENT.md` com sinais, contenção por credencial e recuperação de dados.
**Revisão do `privacy-reviewer` (7e).** Nada crítico. Corrigido (migração `fase_7e_revisao`): **A1** livro lido
antes do ponto do backup ou dos dados restaurados é recusado; **A2** identidade da instalação (`app.installation`,
que vai no backup) conferida contra o livro, plano com `--dry-run`, remoções acima de max(5, 1%) só com
`--confirm-closures <total>` e nenhum passo depois de o acesso ser liberado (sessão nova depois da reaplicação deste
restore, `app.restore_runs`); **M1** livro com 1 hora de margem antes do ponto; **M2** saída das ferramentas do
Postgres só em `BACKUP_DEBUG_LOG`; **M3** papel `app_backup` só com o livro; **B1** cópia das provas não reabre pedido
fechado; **B2** purga que falha faz o comando sair com erro; **B4** `create`/`restore`/`drop` só contra banco local;
**B5** varredura de órfãos continua de onde parou; **B6** storage do livro e gerenciador de segredos em
`regions.json`; **B7/B8** teste dentro do repositório e cobrindo livro, `reapply` e as recusas. Aceito: **M4** (dados
apagados ou corrigidos depois do ponto voltam; 7e-R2) e as provas duplicadas da purga refeita. Segunda rodada
(migração `fase_7e_revisao_2`): `app.restore_begin` fixa o ponto na primeira execução (recusa ponto anterior aos dados
restaurados e, depois, ponto diferente) e a trava de liberação passa a olhar contas e sessões criadas depois do início
do restore, qualquer que seja o `--since` (N1/N2); `BACKUP_DEBUG_LOG` só em `.backups/` (N3); backups anteriores à
identidade da instalação recusam livro (7e-N3, transitório).
**Consequências.** `.env` ganha `BACKUP_ENCRYPTION_KEY`, `APP_BACKUP_PASSWORD`, `BACKUP_DATABASE_URL` e
`TEST_BACKUP_DATABASE_URL` (volumes antigos: `pnpm db:backup:init`). Scripts `backup:create|ledger|restore|reapply|drop`,
`db:backup:init` e `check:infra`. Migrações `fase_7e_operacao`, `fase_7e_revisao` e `fase_7e_revisao_2` (`audit_action`
`restore_reapplied`). Arquivos locais em `.backups/` (ignorado pelo git).

## ADR-0041 — Fase 7f: governança (Política v2, documentos de privacidade, pacote para o jurídico)
**Contexto.** ADR-0036 (7f: LEG-G01–G05), última sub-fase da Fase 7. Pendências marcadas para a 7f: o prazo das
contas sem onboarding na Política (ADR-0037, P7-N2), residuais a registrar no RIPD (P7-M1, 7c-R1, 7d-N4, 7e-R2) e
os achados de documento P7-B8, P7-B9, P7-B10 e P7-N3. Os documentos continuam rascunhos: controlador, encarregado,
fornecedores e a revisão jurídica e clínica são do CHECKLIST.
**Decisão — Política de Privacidade v2 (decisão do responsável pelo produto: mesmo fluxo dos Termos v2).**
- Texto novo em `legal.privacyPolicy` (10 seções): categorias de dados de bem-estar (art. 9º, pendência do OI-08),
  prazo das contas sem onboarding (aviso no 23º dia, exclusão 30 dias após o cadastro e 7 após o aviso), conta
  excluída em minutos, cópias de segurança, onde excluir ou encerrar a conta durante o cadastro (P7-M2), e-mails
  sem conteúdo dos registros, cookies e armazenamento no navegador (OI-36 a) e a regra de mudanças (ampliar o
  tratamento pede confirmação; o resto tem aviso e registro de ciência).
- **Não substancial** (`requires_reconsent = false`): só descreve tratamento que já existia. Migração
  `politica_v2_ciencia` (INSERT), hash no catálogo, data de publicação 2026-10-16, texto da v1 em
  `legal/archive/privacy_policy.v1.json`, aviso `policyNotice.changes.privacy_policy.v2`. Quem aceitou a v1 vê o aviso
  único (junto dos Termos, se for o caso) e registra a ciência; conta nova aceita a v2. `LEGAL-REVIEW` em OI-30.
- Teste: os prazos escritos na Política são os de `ONBOARDING_EXPIRY_DAYS`/`ONBOARDING_EXPIRY_NOTICE_DAYS`.
**Decisão — documentos.**
- ROPA 0.8 (T12 cópias de segurança e livro, T13 segurança operacional, T14 contas sem onboarding; T6 operador por
  pessoa; T9 sem coleta hoje), RIPD 0.7 (probabilidade e risco residual **propostos** pela equipe técnica para o
  encarregado validar; riscos novos R16–R19 com os residuais da Fase 7), RETENTION (fila, linhas de exportação,
  contas sem onboarding), SUBPROCESSORS 0.4 (P7-B10; livro de reaplicação e gerenciador de segredos também na página
  pública), INTENDED_USE 0.4. Runbooks: KEY_ROTATION (P7-B8), INCIDENT (P7-B9), DATA_SUBJECT_REQUEST (P7-N3).
- **Placeholders padronizados:** catálogo único `docs/legal/PLACEHOLDERS.md` (o que é, quem decide e o valor
  implementado hoje); nomes ambíguos renomeados (CONTATO, DATA, RESPONSAVEL etc. ganharam sufixo) e as lacunas vazias do
  RIPD preenchidos. `tests/content/placeholders.test.ts` varre `docs/`, `messages/`, `legal/` e `infra/` e recusa
  placeholder fora do catálogo, vazio ou fora do formato, e linha do catálogo sem uso (`{{...}}` é a notação genérica).
- **Pacote para o jurídico:** `docs/legal/PACOTE_JURIDICO.md` agrupa as questões abertas em 10 temas, cada um com
  pergunta, opções, o que está implementado e o impacto de cada resposta, e prioridade (bloqueia o lançamento ou não).
  OPEN_ISSUES continua o registro completo. Questão nova OI-37 (consentimentos de novidades e de métricas oferecidos
  sem uso hoje).
- `CHECKLIST_GO_LIVE.md` reescrito em cinco etapas, na ordem de execução, com quem faz cada passo (inclui os
  adaptadores reais, sem os quais o `parseEnv` não deixa produção subir). `docs/ESTADO_DO_PROJETO.md`: resumo em
  linguagem simples do que o app faz, do que falta e de quem faz.
**Consequências.** Fim da Fase 7. Próximos passos dependem do CHECKLIST (etapa 1). Preencher um placeholder de texto
versionado é versão nova do documento.
**Revisão do `privacy-reviewer` (7f).** Nada crítico. Corrigido: **A1** livro de reaplicação com IP e papel do
operador nos textos públicos, SUBPROCESSORS, ROPA e RETENTION; **M1** a regra de mudanças da Política mantém a
promessa da v1 (mudança importante pede confirmação), o aviso cita o acréscimo e OI-30 ganha a pergunta (e); **M2**
KEY_ROTATION com rotação programada × comprometimento e o aviso de que o KMS com vários `keyId` e a recifragem ainda
não existem; **M3** data de nascimento pedida e não guardada; **M4** bases legais de backups, registros técnicos,
cookies e contas sem onboarding na Política; baixos e notas (OPEN_ISSUES "Governança (7f)"). Como o texto da
Política mudou antes do merge, o hash foi recalculado na própria migração da branch. Ficam 7f-R1 (conta sem
onboarding sem aviso enviado não expira) e 7f-R2 (investigação com o `app_migrator`), no CHECKLIST.

## ADR-0042 — Consentimentos opcionais de novidades e de métricas retirados (OI-37)
**Contexto.** OI-37 (7f): o onboarding e a Central de Privacidade ofereciam os consentimentos `marketing` (novidades por
e-mail) e `product_metrics` (métricas de uso ligadas à conta), mas o app nunca enviou novidades nem coletou métricas.
Decisão do responsável pelo produto (2026-10-17): retirar os dois, no modelo do ADR-0030.
**Decisão.**
- **Catálogo:** `CONSENT_PURPOSES` passa a ser só `health_data`; saem `consent_marketing` e `consent_product_metrics` de
  `POLICY_DOCUMENTS`, `CURRENT_VERSIONS` e do i18n. O serviço recusa conceder e revogar as duas (`unavailable`), e o
  onboarding e a Central mostram só a finalidade de dados de bem-estar. Textos v1 em `legal/archive/` (hash conferido).
- **Banco (migração `finalidades_opcionais_removidas`):** os valores ficam dormentes no enum (o Postgres não remove
  valor de enum sem recriar o tipo, `app.has_active_consent` e as políticas RLS). Diferente do ADR-0030, essas
  finalidades tiveram versões publicadas (Fase 1b) e provas de escolha: as autorizações ativas são **revogadas** na
  própria migração (o único UPDATE que a guarda aceita; nada é apagado, LEG-R03), cada uma com AuditLog
  `consent_revoked` sem ator (`actor_user_id` nulo: foi o controlador, não o titular). O id desse registro deriva do id
  da prova, para a reaplicação de um restore (ADR-0040) não o duplicar. A CHECK
  `consent_records_purpose_opcional_removida` barra só autorização **ativa** dessas finalidades
  (`purpose NOT IN (...) OR revoked_at IS NOT NULL`) e entra validada. Assim a prova revogada continua copiável pela
  reaplicação de um restore anterior à migração, cujo livro traz essas linhas porque o UPDATE mudou `updated_at`
  (revisão de privacidade). A CHECK `policy_versions_document_opcional_removido` entra **NOT VALID**: barra versão
  nova, e as versões antigas, referenciadas pelas provas, ficam. As provas saem pelo expurgo normal
  (`PROOF_RETENTION_DAYS`). Produção nunca subiu: lá a revogação não alcança ninguém.
- **Política de Privacidade v3:** sai a frase "Comunicações sobre novidades e métricas ligadas à conta:
  consentimentos separados e opcionais". Só remove funcionalidade: não substancial, aviso único e ciência (ADR-0031),
  com o texto `policyNotice.changes.privacy_policy.v3`, que resume também as mudanças da v2 para quem aceitou a v1.
  Texto da v2 arquivado. `LEGAL-REVIEW` em OI-30.
- **Documentos:** ROPA T8 e T9 removidas (IDs não reaproveitados), LEG-C02 itens (4) e (5) revogados, SUBPROCESSORS,
  PACOTE_JURIDICO (tema 3.5 decidido; fica só se a revogação sem ação do titular dispensa comunicação individual,
  pergunta (f) da OI-30), OI-37 em "Resolvidas"; sai o placeholder `RETENCAO_METRICAS`.
**Consequências.** Testes que usavam `marketing` como "outra finalidade" passam a usar dados de bem-estar (revogar e
autorizar de novo). Reintroduzir novidades ou métricas exige nova ADR, nova finalidade com texto e prazo, revisão do
ROPA, do RIPD e de SUBPROCESSORS, e remover a CHECK correspondente.

## ADR-0043 — Modo só demo: publicar apenas a demonstração pública (Fase 8a)
**Contexto.** O responsável pelo produto quer publicar só a demonstração pública (dados 100% fictícios, LEG-X02),
sem cadastro, login nem qualquer dado real, enquanto o app completo espera o checklist do go-live. Hoje o app
completo não sobe em produção (`parseEnv` recusa os adaptadores locais, os únicos que existem), e a demo já roda
sem banco (gerador em memória, ADR-0021). Toda server action exportada é alcançável por POST direto com o ID dela,
de qualquer caminho (doc do Next 16, `data-security.md`), e o Header da demo importa `logoutAction`.
**Decisões do responsável pelo produto (2026-10-20).**
- **D1** Uso **não comercial**: projeto pessoal de portfólio.
- **D2** Hospedagem: **Vercel Hobby**, funções em `gru1` (São Paulo). O plano permite uma única região; CDN e
  proxy rodam na rede global da Vercel, sem nenhum dado de bem-estar (só IP e dados da requisição).
- **D3** No modo só demo, páginas do app completo **redirecionam para `/demo`**; server actions e route handlers do
  app completo respondem **404**.
- **D4** Responsável pela demonstração: **João Henrique Arruda do Carmo**, contato **joao2002carmo@gmail.com**
  (`src/config/demo.ts`). Não é o controlador do app completo, que segue em aberto (OI-06).
- **D5** O nome nos textos jurídicos versionados fica para o go-live, junto com os textos finais do jurídico (no
  modo só demo eles nem aparecem).
- **D6** Domínio `*.vercel.app` por enquanto.
- **D7** A demo continua com `noindex`.
- **D8** Registro de erros: só os logs da hospedagem (o relatório já filtrado pela lista de campos, ADR-0038).
**Decisão (Fase 8a: modo só demo, ambiente, guardas e testes).**
- **Chave:** `DEMO_ONLY=true` (`src/lib/demo-mode.ts`); valor diferente de `true`, `false` ou vazio falha alto.
- **Ambiente próprio:** `parseDemoEnv` (`src/lib/demo-env.ts`) aceita só `APP_ENV`, `APP_URL`, `APP_REGION` e
  `CLIENT_IP_HEADER`; em produção exige https, região no Brasil e cabeçalho de IP (sem `x-forwarded-for`). Nenhuma
  credencial do app completo (URLs de banco, chave de backup, segredos de sessão, pepper, chave do KMS) pode estar
  definida: o `instrumentation` confere na subida e o servidor não sobe. `getEnv()` lança `NotEnabledError` no modo
  só demo, então banco (`getDb`), adaptadores e segredos ficam inacessíveis por qualquer caminho.
- **Proxy:** `demoOnlyRoute` (`src/lib/security/demo-routes.ts`, função pura): GET/HEAD fora de `/demo` → 307 para
  `/demo`; route handlers (`/privacidade/exportacoes/*`, prefixo reservado `/api`), server actions e outros métodos
  fora de `/demo` → 404. Respostas com CSP e `no-store`; os cabeçalhos de segurança do `next.config` continuam.
- **Guarda nas actions:** `assertFullApp()` (`src/lib/full-app.ts`, `notFound()`) é a primeira linha de cada uma das
  55 server actions e do route handler do app completo, porque o ID de uma action vale em qualquer caminho, inclusive
  em `/demo`. Ficam fora só as 3 actions de preferência da demo (período, modo privacidade, apresentação), que não
  alcançam sessão, banco nem adaptadores. Teste estático (`tests/security/demo-only-guard.test.ts`).
- **Jobs:** nenhum no modo só demo. **Erros:** `ConsoleErrorReporter` direto, sem adaptadores (D8).
- **Interface:** no modo só demo, a demo não convida a criar conta nem leva ao app completo (Header, início, aviso de
  somente leitura, via `DemoOnlyProvider`). No lugar da Política, `/demo/sobre` ("Sobre esta demonstração",
  RASCUNHO, `LEGAL-REVIEW` OI-38): o que é, o que não é coletado, as preferências no navegador, os registros técnicos
  da hospedagem e o responsável (D4). A página só existe no modo só demo (fora dele, 404): no app completo há
  cadastro, banco e outro controlador (revisão de privacidade).
- **Cookies:** só os 3 de preferência já existentes (`__Host-hm_period`, `__Host-hm_privacy`, `__Host-hm_presenting`),
  de sessão, sem identificador, criados só quando a pessoa muda uma opção. Nenhum analytics (a CSP `'self'` já
  bloqueia scripts de terceiros; Vercel Web Analytics e Speed Insights não são instalados).
- **Testes:** unitários (chave, ambiente, roteamento rota a rota sobre o inventário de páginas, guarda, relatório de
  erro) e o e2e `playwright.demo.config.ts` (`pnpm test:e2e:demo`, job `demo-only` da CI): build de produção SEM
  `.env`, banco nem credenciais; páginas redirecionam com CSP; route handlers e métodos dão 404; a `logoutAction`,
  chamada em `/demo` com o ID real tirado do bundle público, dá 404, e toda action do app completo referenciada pela
  demo também; a primeira visita não cria cookie; nenhum pedido sai da origem; só links para `/demo`; o aviso é
  acessível; os `.glb` saem com cache imutável, sem passar pelo proxy, e o twin monta o modelo. O e2e usa
  `APP_ENV=test` como os demais (em produção a CSP pede `upgrade-insecure-requests`, que quebra em http://localhost);
  as regras de produção do ambiente têm teste unitário.
- **Revisão de privacidade (sem bloqueantes):**
  - o limite por IP passa a varrer as janelas vencidas a cada janela, e o aviso diz "por pouco tempo" (a memória
    só some quando chega outro acesso ou a instância para);
  - o aviso cita o `localStorage` do tour e do modelo do corpo 3D;
  - `/demo/sobre` só existe no modo só demo;
  - o 404 leva a `/demo` nesse modo;
  - o job da CI faz o build com `DEMO_ONLY=true`, como na hospedagem;
  - um teste liga `DEMO_FORBIDDEN_VARS` aos campos de texto do `envSchema`;
  - o teste das guardas recusa outras formas de export;
  - OI-38 ganhou (e)–(h), e a Vercel em SUBPROCESSORS virou pré-condição para publicar (8c).
**Fases seguintes (fora desta).** 8b: nome do produto num único lugar ("Corpivum", constante + i18n, exceto os
textos jurídicos versionados, D5) e a faixa fixa "Demonstração com dados fictícios. O app ainda não está aberto ao
público.". 8c: hospedagem (`vercel.json` com `gru1`, SUBPROCESSORS com a Vercel, `infra/regions.json`, script de
verificação dos cabeçalhos e dos `.glb` na URL publicada) e os passos manuais do responsável (conta, GitHub, região,
variáveis).
**Consequências.** O app completo e a demo saem do mesmo build: a diferença é só a variável. Nova server action ou
route handler do app completo precisa de `assertFullApp()` na primeira linha (o teste falha sem ela); nova action
que valha na demo entra na lista do teste e não pode tocar em sessão, banco nem adaptadores. Voltar a publicar o
app completo é tirar `DEMO_ONLY` e configurar o ambiente completo, depois do checklist do go-live.

## ADR-0044 — Fase 8b: nome do produto num único lugar e faixa fixa da demonstração
**Contexto.** Fase 8b do ADR-0043: o produto passa a se chamar **Corpivum**, e a demonstração publicada precisa
dizer, sempre visível, que os dados são fictícios e que o app ainda não está aberto ao público. O nome antigo
("HealthMind 360") estava escrito em 12 textos do i18n e em literais do código (PDF, TOTP, nomes de arquivo).
**Decisão.**
- **Constante:** `PRODUCT_NAME = 'Corpivum'` e `PRODUCT_SLUG = 'corpivum'` em `src/config/product.ts`. O código usa a
  constante (criador do PDF, emissor do TOTP, nomes dos arquivos baixados, e-mail de desenvolvimento, mensagem do
  backup, senhas comuns recusadas).
- **i18n:** os textos usam o marcador `%PRODUTO%` (fora da sintaxe ICU), trocado pelo nome ao carregar o catálogo
  (`src/i18n/messages.ts`), usado pelo `next-intl`, pelos relatórios e pelos testes de componente. O título das
  páginas da demo passa a ser "<página> · Demonstração · Corpivum".
- **Exceção (ADR-0043 D5):** Política, Termos e consentimento de saúde (`DOCUMENT_MESSAGES`) seguem com "HealthMind
  360": são versionados por hash, e trocar o nome exige nova versão, migração e arquivo do texto antigo. Fica para o
  go-live, junto com os textos finais do jurídico (CHECKLIST_GO_LIVE 1.6). No modo só demo eles não aparecem nem vão
  ao navegador: o layout raiz passa ao `NextIntlClientProvider` o catálogo sem `legal` e `consent`
  (`demoClientMessages`; desde o ADR-0052, `clientMessages` por rota, com a mesma exclusão), que só o app completo usa; antes, o catálogo inteiro (com os rascunhos e os
  placeholders do controlador) ia no payload de toda página. No app completo os nomes ficam misturados até lá
  (OI-38 i).
  Identificadores internos (nome do pacote, banco `healthmind`, `Symbol.for('healthmind.*')`, domínio de dev
  `healthmind.local`) não são exibidos e ficam como estão.
- **Teste:** `tests/content/product-name.test.ts` falha se o catálogo escrever o nome, se o nome antigo sobrar fora
  dos textos versionados, se algum marcador ficar sem troca, se os textos versionados mudarem, se o catálogo do
  navegador no modo só demo tiver o nome antigo ou placeholders, se o nome tiver sintaxe de ICU, ou se o código
  (`src`, fora de testes) escrever "HealthMind" ou o nome fora da constante. Com o nome trocado, os avisos
  `disclaimer.*` seguem iguais aos aprovados e a varredura de alegações proibidas roda de novo. Como o nome entra
  num aviso aprovado, `src/config/product.ts` entrou no CODEOWNERS dos textos.
- **Monograma:** o logotipo da barra lateral usa `PRODUCT_MONOGRAM` (a inicial do nome), não mais "HM"; o teste
  também recusa o monograma antigo.
- **Faixa:** `DemoOnlyBanner` ("Demonstração com dados fictícios. O app ainda não está aberto ao público.", chave
  `demo.notPublicBanner`), `role="note"`, dentro dos cabeçalhos fixos (sticky) do shell da demo e do modo
  apresentação, e no topo da entrada da apresentação: não sai da tela ao rolar. Só aparece no modo só demo
  (`DemoOnlyProvider`); no app completo aberto ao público a frase seria falsa. O e2e `demo-only` confere a faixa e o
  nome em todas as telas da demo e da apresentação, a 390 px e depois de rolar, e que o HTML (com o payload do React)
  não tem o nome antigo nem placeholders. O 404 do modo só demo não tem a faixa: não mostra dado nenhum e leva a
  `/demo`.
- **Revisão de privacidade (sem bloqueantes):** catálogo do navegador sem textos jurídicos no modo só demo; e2e
  sobre o HTML inteiro; avisos e varredura conferidos também com o nome trocado; CODEOWNERS; testes de componente
  sobre o catálogo trocado; faixa fixa também na entrada da apresentação; OI-38 (i) e CHECKLIST 4.0.
**Consequências.** Trocar o nome é mudar a constante (e, no go-live, publicar novas versões dos textos jurídicos).
Texto novo com o nome usa `%PRODUTO%`; o teste recusa o nome escrito.

## ADR-0045 — Marca oficial: a imagem original do logotipo (Fase 9a)
**Contexto.** O redesenho visual (Fase 9) começou recriando o logotipo de referência em SVG com uma figura mais
neutra (silhueta tirada da média dos modelos do twin, depois variantes "fiel" e "neutra"). Nenhuma versão chegou
ao acabamento da referência.
**Decisão do responsável pelo produto (2026-10-21).**
- **Logo oficial = `docs/brand/logo-referencia.png`, sem redesenho.** É uma marca, não uma meta corporal.
- **A figura nunca aparece na interface como referência de corpo (LEG-M06):** não fica perto do twin, de medidas,
  metas, comparações ou de qualquer mensagem de progresso ou celebração (LEG-F05), não serve de silhueta, fallback ou
  carregamento do twin e não aparece em telas sobre o corpo como ilustração. Uso só como identidade em telas sem
  dado corporal: entrada, cadastro, onboarding, páginas jurídicas e imagens de compartilhamento. A barra lateral,
  que acompanha todas as telas (inclusive twin, medidas e metas), usa o ícone sem a figura (40 px).
- **Tamanho mínimo (pela largura exibida):** logo completo (símbolo + "CORPIVUM") só a partir de 128 px; de 48 a
  127 px, só o símbolo; abaixo de 48 px (favicon, ícones do app, manifest, qualquer logo pequeno), o favicon aprovado,
  só o "C" e um ponto, sem a figura (`docs/brand/corpivum-favicon.svg`). Garantido no componente
  `src/components/brand/Logo.tsx`: a forma sai da largura (`logoForma`), sem opção de forçar outra; teste em
  `Logo.test.tsx`.
- **Validação jurídica:** OI-39 `LEGAL-REVIEW` (figura atlética na marca de um app de imagem corporal; imagem
  gerada por IA, segundo o manifesto C2PA embutido no arquivo: proteção autoral e registro da marca).
**Arquivos.** `scripts/brand/exportar-logo.mjs` gera `public/brand/` a partir da imagem original, com o Chromium do
Playwright (sem dependência nova), e copia o favicon para `src/app/icon.svg` e `src/app/apple-icon.png`:
- **Fundo:** a imagem é brilho sobre preto (fundo medido em 0–1). Alfa = maior canal depois de descontar o preto e
  cor = canal / alfa, o que inverte a composição sobre preto: brilho e bordas suaves ficam, o preto vira
  transparência e não sobra halo escuro sobre o fundo do app (`#0b1118`).
- **Camada de apoio:** sem ela, a metade escura do corpo e os vãos internos ficariam transparentes, e gradientes,
  brilhos e cartões apareceriam através da figura. Atrás da imagem vai um disco sólido na cor mais escura da imagem
  (`#000000`), no círculo do símbolo (medido com a grade: centro 628,7 × 515,3, raio 240 px na original), sólido até
  95% do raio e com borda suave até 98,5%; o brilho de fora do círculo continua transparente. Testado sobre fundo
  liso, gradiente azul e cartão com brilho, em 128 e 64 px (folha `capturas/logo/teste-fundos.png`).
- **Saídas:** símbolo (recorte quadrado do "C") e logo completo, em WebP (qualidade 0,9) e PNG com transparência,
  em 512, 256, 128 e 64 px de largura; ícones do favicon em 16, 32, 48, 180, 192 e 512 px.
- **Tamanhos (WebP / PNG):** símbolo 512: 39,0 / 217,3 KiB; 256: 15,8 / 65,9; 128: 7,1 / 21,1; 64: 3,4 / 7,2.
  Logo completo 512: 31,3 / 98,8; 256: 12,3 / 32,1; 128: 5,1 / 11,5; 64: 2,4 / 4,1. Ícones: 0,6 a 18,7 KiB.
- **Orçamento:** imagens não entram no teto de JS (`perf-budget.json`), mas pesam na carga medida pelo e2e de
  desempenho. A interface usa WebP em 1× e 2× do tamanho exibido (`srcSet`): o símbolo de 48 px da barra lateral
  usa o ícone PNG de 48 px (1,7 KiB); o logo de 176 px da entrada baixa 12,3 KiB (1×) ou 31,3 KiB (2×). Os PNG ficam para usos fora
  do app (compartilhamento, materiais). As exportações não carregam o C2PA do original (só a imagem).
- **Entrega:** `brand/corpivum-<tipo>-<tamanho>.webp|png`, `icon.svg`, `apple-icon.png` e `manifest.webmanifest`
  ficam fora do proxy (padrão estrito no `matcher`, como os modelos do ADR-0028): abrem sem sessão (entrada e demo) e
  não recebem `no-store`. Imagens da marca com `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`
  (nome sem hash, então sem `immutable`). e2e em `e2e/security-headers.spec.ts` confere o acesso sem sessão e que
  caminhos parecidos (maiúsculas, outra extensão, sufixo) passam pelo proxy; `favicon.ico` e `robots.txt` também
  passaram a ter o ponto escapado e `$` no `matcher`.
- **Estudos descartados:** os scripts das tentativas de redesenho ficam em `scripts/brand/arquivo/` (só registro;
  escrevem em `capturas/logo/arquivo`, fora do Git).
**Consequências.** Trocar o logo é trocar a imagem de origem e rodar o exportador. A regra de uso da figura e a de
tamanho mínimo valem para qualquer tela nova; o monograma de texto (`PRODUCT_MONOGRAM`) saiu.

## ADR-0046 — Tema único escuro e fonte Inter auto-hospedada (Fase 9a)
**Contexto.** Redesenho visual (Fase 9): o produto passa a ter só o tema escuro, com o azul do logotipo como cor
principal, e uma fonte um pouco mais grossa.
**Decisão.**
- **Tema único escuro.** Saem o tema claro, o seletor em Configurações (`ThemeSelector`), o script que aplicava
  `.dark` antes da pintura (`THEME_INIT_SCRIPT`, ADR-0006), a variante `dark:` do Tailwind e os textos `theme.*`.
  `tokens.css` tem um bloco só (`:root`, `color-scheme: dark`) e o viewport declara `themeColor` `#0b1118` e
  `colorScheme: 'dark'`. A chave antiga `hm.theme` no `localStorage` fica sem uso (não guarda dado pessoal).
  Substitui o tema claro do ADR-0005 e o ADR-0006.
- **Paleta.** Fundo `#0b1118` e neutros puxados para o mesmo azul; primária `#4aa8ff` (azul do logotipo clareado
  para AA sobre o fundo; texto sobre ela `#041a33`), foco `#7cc4ff`. Estados, domínios e holograma do twin mantêm
  os valores do antigo tema escuro (mistura aditiva). `tests/design/contrast.test.ts` confere todos os pares (texto
  ≥ 4,5:1; borda, foco e cor de gráfico ≥ 3:1) e falha se voltar um bloco `.dark`. Sombras mais densas para separar
  superfícies no escuro.
- **Fonte.** Inter variável (OFL 1.1), do subconjunto latino do `@fontsource-variable/inter` 5.3.0 (Inter v4),
  reduzida com `fonttools` ao eixo de peso 400–700 e às features usadas (kern, liga, calt, tnum, case, ccmp,
  locl, mark, mkmk): 27,6 KiB (eram 47), 372 glifos, cobre os acentos do português. Fica em `src/app/fonts/` com a
  licença e é carregada por `next/font/local`: servida pelo próprio site (CSP `font-src 'self'`; continua sem
  fonte remota, como no ADR-0005), com preload e métricas da fonte de reserva ajustadas. Pesos: texto 450
  (`--font-weight-normal`), médio 550, seminegrito 600 e negrito 700. Registro em `docs/ASSETS.md` e
  `THIRD_PARTY_NOTICES.md`.
- **`font-display: optional` (orçamento de 2,5 s).** Medido com `pnpm test:perf` (4G lenta, CPU 4×, cache frio,
  mediana de 5 cargas), "interativo" de `/inicio` e `/demo`:

  | Versão | `/inicio` | `/demo` |
  |---|---|---|
  | `main` antes da 9a (3 rodadas) | 2295–2300 ms | 2181–2197 ms |
  | Inter completa (47 KiB), `swap` | 2458 ms | 2319 ms |
  | Inter completa, `swap`, sem preload | 2702 ms | — |
  | Inter reduzida (27,6 KiB), `swap` (3 rodadas) | 2390–2483 ms | 2214–2245 ms |
  | Inter reduzida, `optional` (2 rodadas, escolhida) | 2331–2355 ms | 2214–2224 ms |

  A troca da fonte de reserva pela Inter no meio da carga refaz o layout com a CPU lenta; com `optional` a página
  fica com a fonte de reserva quando a Inter não chega no período curto (primeira visita em rede lenta) e passa a
  usá-la, do cache, na visita seguinte. Custo final: ~40–60 ms em `/inicio`, ~30 ms em `/demo`.
- **Teste de desempenho.** `e2e/perf.spec.ts` esperava a primeira entrada de LCP sem prazo; quando o clique no
  botão vinha antes dela, o Chrome parava de registrar o LCP e a carga travava até o tempo do teste. O LCP é só
  informativo: depois de 3 s sem entrada, a carga segue sem ele.
- **Testes.** axe roda só no esquema escuro (`e2e/a11y.spec.ts`, `e2e/privacy.spec.ts`); o e2e de tema confere que
  não há seletor e que o `color-scheme` é escuro. `pnpm capturas` gera só a versão escura.
**Consequências.** Uma cor nova entra só em `tokens.css` e precisa passar no teste de contraste do tema escuro.

## ADR-0047 — Navegação, "Registrar" sempre visível e formulários de exemplo na demo (Fase 9b)
**Contexto.** Redesenho visual (Fase 9). A barra inferior da demo tinha 9 itens com rolagem horizontal, a demo não
mostrava como registrar dados (só um aviso no lugar dos formulários) e, revendo as capturas da 9a, o seletor de
período ainda era o `<select>` nativo e o foco ao trocar de tela não era tratado.
**Decisão.**
- **Barra inferior única** (`BottomNav`): Início · Twin · Registrar (central) · Timeline · Mais, igual no app e na
  demo, sem rolagem. A demo ganha `/demo/mais` com os outros módulos (`DEMO_MORE_ITEMS`). O item ativo tem cor,
  pílula atrás do ícone e sublinhado (a cor nunca é o único canal).
- **Sidebar** com dois grupos: módulos e "Conta" (relatórios, configurações, Central de Privacidade); o próprio menu
  rola em tela baixa.
- **"Registrar" na demo** abre o mesmo `QuickLogDialog` (variante `demo`), que leva aos formulários da própria demo.
  **Emenda o ADR-0021** ("demo sem formulários"): os formulários aparecem como **exemplo** (`ExampleForm`),
  preenchidos com dados fictícios dentro de um `<fieldset disabled>` (campos e envio desativados de uma vez), com o
  aviso fixo "na demonstração nada é salvo". Nada é enviado ao servidor (regras 4 e 6; LEG-X02), em duas camadas:
  no navegador, os formulários em modo `example` saem sem a server action (o ID dela não vai para o HTML da demo) e
  o envio é impedido; no servidor, um POST forjado continua barrado por `assertFullApp` (modo só demo),
  `requireAppSession` (sem sessão) e `healthWrite` (conta em modo demonstração). O e2e confere que nenhuma
  requisição além de GET sai durante o fluxo. Os exemplos não sugerem meta: sem calorias e sem
  valor-alvo de meta (LEG-M07); o de medidas repete a última medição da pessoa fictícia (vazio no modo privacidade).
  Metas entra no registro rápido (app e demo); a água fica fora da variante demo, que não tem exemplo para ela.
- **Foco na troca de rota** (`useRouteFocus`): o foco vai ao `<h1>` do cabeçalho (WCAG 2.4.3); a primeira carga e
  um diálogo aberto não mudam o foco. O foco por código (título, tela da apresentação, exemplo do registro rápido)
  passa por `focusProgrammatically`: depois de clique ou toque o alvo ganha `data-focus-quiet` e fica sem moldura;
  depois de tecla, o anel de `:focus-visible` aparece como sempre (WCAG 2.4.7). A decisão usa a última interação, e
  não a heurística do navegador para foco por script, que varia.
- **Seletor de período** em botões segmentados feitos de rádios nativos (`role="radiogroup"`, setas trocam a opção,
  nome pelo rótulo); a opção atual tem preenchimento, peso e ícone de check. Abaixo de 640px as opções ficam num menu
  (botão com a opção atual + lista), que fecha com Esc, clique fora ou foco saindo; pelo teclado as setas não o
  fecham. Cookie, `aria-live` do intervalo e presets não mudam.
- **Testes.** Unitários de `nav-config`, `PeriodSelector`, `useRouteFocus`, `focusProgrammatically` e
  `ExampleForm`; e2e da barra da demo em 320/390px, do "Registrar" na demo sem envio e do foco no título com mouse e
  com teclado; `e2e/period.ts` concentra a escolha de período dos e2e. axe cobre `/demo/mais`.

## ADR-0048 — Cartões com inclinação e opção "Reduzir animações" (Fase 9b, ajuste)
**Contexto.** Pedido depois da 9b, antes da 9c: inclinação leve com brilho que segue o cursor nos cartões curtos de
destaque. Parte do sistema de movimento previsto para a 9f é antecipada aqui (a preferência de movimento e a opção
"Reduzir animações"); a 9f reaproveita esta base.
**Decisão.**
- **`TiltCard`** (`src/components/ui/TiltCard.tsx`): inclinação de no máximo 6° (`tiltFor`, função pura) e brilho
  azul translúcido (`--hm-tilt-glow`) que acompanha o cursor. Anima só `transform` e `opacity`, direto no estilo do
  elemento num quadro por movimento (sem renderizar o React de novo); `isolate` + brilho em `-z-10` deixam o brilho
  entre o fundo e o texto. O brilho é `aria-hidden` e não captura o ponteiro; conteúdo, links e foco não mudam.
- **Onde:** indicadores do início (`DomainCard`), "Destaques do período" (`StatTile` com `tilt`), cartão do twin no
  início (agora também na demo, sem prefetch para não antecipar a tela do 3D, ADR-0026) e entrada do modo
  apresentação. O efeito é igual em todos os indicadores e não depende do valor: não é comemoração nem destaque de
  peso ou medida (LEG-M06).
- **Quando liga:** só com mouse ou trackpad (`(hover: hover) and (pointer: fine)` e `pointerType === 'mouse'`).
  Desligado em telas de toque, com `prefers-reduced-motion` e com a opção do app.
- **Opção "Reduzir animações"** (`src/lib/motion/motion.ts`, `ReduceMotionToggle`): botão com `aria-pressed` em
  Configurações e no menu de ajuda (vale na demo). Guardada no `localStorage` (`hm.motion`, só preferência de
  interface, sem dado pessoal, como a antiga chave de tema). Marca `<html data-motion="reduced">`, e o CSS aplica o
  mesmo corte de animações da preferência do sistema. Sem script inicial: o efeito só reage ao mouse depois da
  hidratação, então não há "piscar".
- **Inventário do navegador.** `hm.motion` entra em `/demo/sobre` (`demoAbout.browser`, RASCUNHO) e na ROPA (T2b,
  junto com `hm_tour_demo_seen` e `hm.twin.bodyModel`); o `/demo/sobre` deixa de dizer que não há formulário e diz só que os formulários de
  exemplo (ADR-0047) não enviam nada; cookies de preferência e registros da hospedagem seguem nas seções próprias. A Política v2 é texto versionado (hash em `policy_versions`) e não muda:
  a inclusão de `hm.motion`, e a retirada do "tema de cores" (ADR-0046), ficam para a próxima versão (OI-40).
  `tests/content/browser-storage-inventory.test.ts` falha se uma chave de `localStorage` do código faltar na ROPA.
- **Orçamento:** `check:perf-budget` OK. `pnpm test:perf` local deu `/inicio` 2570 ms com o efeito e 2572 ms na
  `main` sem ele, na mesma máquina (que hoje mede acima da CI): sem custo mensurável. O gate é o job de performance
  da CI.
- **Testes:** unitários de `tiltFor`, de quando o efeito liga (mouse, toque, `prefers-reduced-motion`, opção do
  app) e da persistência da opção; e2e com mouse (inclina e volta), com a opção (desliga e persiste após recarregar),
  em contexto de toque e com `reducedMotion: 'reduce'`; axe sem violações. `scripts/video-tilt.mjs` grava
  `capturas/tilt-inicio.webm` para revisão visual.

## ADR-0049 — Twin como destaque do início, 3D adiado e modelo fixo da pessoa da demo (Fase 9c)
**Contexto.** Redesenho visual (Fase 9): o twin deixa de ser só uma tela à parte e vira o destaque do início, sem
estourar o orçamento de 2,5 s (ADR-0039) nem mostrar o corpo em código na carga normal (ADR-0028). Revendo as
capturas da 9a, também: medidas de todas as regiões em várias datas na demo, e a pessoa fictícia já com um modelo.
**Decisão.**
- **Hero no início** (`TwinHero`, app e demo; fora do modo apresentação, que tem tela própria do corpo): corpo
  grande (≈ 62vh, até 640 px) e, ao lado (embaixo no celular), lista de regiões com `aria-pressed` e o painel da
  região: medida com unidade, data, variação desde a primeira medida do período (tom neutro, sem cor de bom ou ruim,
  LEG-M06), sparkline da região e selos INFORMADO/ESTIMADO ou DEMO. Começa na primeira região com medida. "Abrir
  twin completo" leva à tela do twin. O mesmo aviso da tela do twin (`disclaimer.bodyModel`: representação
  aproximada, não é avaliação corporal nem de saúde) fica no hero e no esqueleto. Sem nenhuma circunferência no
  período (`hasRegionMeasures`, decidido no servidor antes de mascarar), fica o atalho antigo. Modo privacidade: como
  na tela do twin (medidas próprias nem saem do servidor e o subtítulo diz que o modelo está na forma de
  referência; na demo, só os números ficam ocultos).
- **Carga sem "pulo".** O HTML traz um esqueleto (`TwinHeroPlaceholder`) com o mesmo cartão e a mesma área do
  modelo, com a silhueta holográfica (`HoloLoading`). Depois do evento `load`, de uma folga de 1,2 s e de um tempo
  ocioso (`useIdleStart`; sem a folga, a CI mediu o "interativo" de `/inicio` em 2527–2578 ms, porque o trabalho do
  three.js caía em cima do primeiro toque), chega o twin interativo, num chunk próprio, e só então a cena 3D (`LazyBodyScene`, ainda o único
  ponto que importa o three.js). A cena entra por baixo da silhueta e as duas trocam só em `opacity` (~300 ms)
  quando o modelo está desenhado (`onStatus` da cena = `data-twin-status` fora de `loading`/`choose`); com menos
  movimento, a troca é imediata. O corpo em código continua só como fallback real. Sem WebGL: 2D interativo.
  **Emenda o ADR-0026:** o three.js passa a ser baixado também no início, mas só depois da carga da página, nunca
  no JS de entrada (`check:perf-budget` e o e2e de horários garantem).
- **Silhueta parada no início.** A pulsação da silhueta desde o primeiro quadro custava ~210 ms no "interativo"
  com a CPU 4× mais lenta (medido: 2785 ms com ela, 2527 ms sem). No hero ela fica parada (`pulse={false}`); na
  tela do twin, continua pulsando.
- **Celular** (`(pointer: coarse)`): o 3D carrega sozinho se `canAutoload3D` permitir (sem economia de dados, rede
  não `slow-2g`/`2g`/`3g`, memória ≥ 4 GB e ≥ 4 núcleos quando o navegador informa; sinal ausente conta como
  "permite"). Se não, 2D interativo e o botão "Ver em 3D". Desktop com WebGL: sempre. Os sinais são só lidos, nada
  é guardado nem enviado.
- **Giro acompanhando o mouse** de até ~9° (0,16 rad), com o amortecimento do próprio `Turntable`; desligado em
  toque, durante o arrasto e com menos movimento (sistema ou "Reduzir animações", ADR-0048). O painel da região é
  um `TiltCard` (o tilt pedido para o "quadro do twin").
- **Modelo da pessoa fictícia** (`DEMO_BODY_MODEL`, masculino). **Emenda o ADR-0028:** na demo (pública ou dentro
  da conta) e na apresentação com dados de demonstração, o twin abre com esse modelo, sem perguntar. A troca feita
  na demo fica em `hm.demo.twin.bodyModel` e nunca vira a escolha da conta (`hm.twin.bodyModel`); contas reais
  continuam sem padrão. A nova chave entra na ROPA (T2b), em RETENTION e no teste de inventário do navegador.
- **Dados da demo:** circunferências de todas as regiões a cada 2 semanas (6–7 datas nos 90 dias, pelo menos 2 nos
  últimos 30) e a altura também na medição mais recente. As semanas extras usam um ruído fixo por dia, sem consumir
  o gerador pseudoaleatório: os demais dados fictícios não mudam.
- **Orçamento** (`pnpm test:perf`, build de produção, 4G lenta, CPU 4×, mediana de 5; WebGL por software no teste,
  como no `twin.spec`). Gate na CI; a máquina local mede ~10 % acima:

  | Cenário | `main` (CI) | 9c (CI) | 9c (local) | 3D pronto (CI) |
  |---|---|---|---|---|
  | `/inicio`, celular 412 px | 2241 ms | 2412 ms | 2513 ms | 8544 ms |
  | `/demo`, celular 412 px | 2110 ms | 2131 ms | 2281 ms | 8514 ms |
  | `/inicio`, desktop 1440 px | — | 2427 ms | 2547 ms | 8633 ms |

  Custo no `/inicio`: ~170 ms, dentro da meta de 2,5 s, com ~90 ms de folga. É o ponto a vigiar nas próximas
  sub-fases.
  JS de entrada: `/inicio` 177,6 KiB e `/demo` 175,3 KiB (eram 176,8 e 174,5). O "3D pronto" inclui baixar o
  chunk do three.js e os dois `.glb` na rede lenta e desenhar por software; é informativo, sem meta. O
  `perf.spec` ganhou o cenário desktop e a medida do 3D pronto; o gate continua sendo o job de performance da CI.
- **Testes:** unitários de `canAutoload3D`, do gerador (regiões em várias datas), do modelo da demo (chave separada,
  conta real sem padrão) e do `TwinHero` (painel, troca de região, privacidade, selos); e2e do horário do three.js
  (só depois do `load`), da troca holograma → modelo sem corpo em código, das regiões por clique e teclado, do 2D sem
  WebGL, do celular com e sem economia de dados e da conta real que pergunta o modelo; axe.

**Ajustes depois das capturas da 9c (emenda deste ADR).**
- **Demo coerente:** toda medição fictícia do corpo traz as cinco circunferências (o twin, o início e o Antes × Agora
  contam as mesmas datas; nenhuma região "sem registro" numa data de medição). Com dados reais, a data "antes" padrão
  do Antes × Agora é a primeira com todas as regiões (`firstCompleteDay`); sem nenhuma completa, a primeira.
- **Modo privacidade, forma do corpo:** com dados próprios, a tela do twin, o Antes × Agora, o twin do início e o
  modo apresentação já recebiam do servidor as medidas zeradas (`maskBodyScreen`): o modelo fica na forma de
  referência, e a forma real não chega ao navegador. Faltava o instante entre ligar o modo e a recarga: agora o
  cliente troca para a forma de referência e esconde os números no próprio clique (`usePrivacyHiddenNow`,
  `withoutMeasures`). Na demo a forma fictícia continua; só os números ficam ocultos.
- **Enquadramento:** o corpo ocupa ~88 % da altura do quadro (`BODY_FILL`) no 3D (câmera calculada pela altura do
  corpo, `CameraFit`), no 2D (recorte do SVG na altura do corpo) e na silhueta de carregamento.
- **Tela do twin** abre com a primeira região que tem medida (Peito), como o início.
- **Datas do Antes × Agora** no estilo do seletor do app (`ChoiceMenu`: botão com a data atual e lista de rádios).
- **Capturas:** acima de 7680 px físicos o Chrome headless repetia trechos da página na imagem (era a "página
  recomeçando" no meio). `pnpm capturas` passa a salvar páginas altas em partes (`_parte-N`). Não era conteúdo
  duplicado na página.

## ADR-0050 — Índice de Bem-Estar v3: atividade pela regularidade de registro (correções da 9a)
**Contexto.** Revendo as capturas da 9a, o Índice da demo aparecia como "dados parciais" em todo período, porque
o componente `activity` (peso 0,20) estava sempre fora desde a v1 (OI-28). A proposta antiga era medir minutos em
relação à meta da pessoa, mas a meta de atividade é opcional e medir volume premiaria fazer mais (LEG-M07).
**Decisão.** `SCORE_V3` (`score_version = 3`), com os mesmos pesos e limiares da v2. A atividade entra pela
**regularidade de registro**: semanas (segunda a domingo) com pelo menos uma atividade registrada ÷ semanas desde a
do primeiro registro do período (sono, check ou atividade) até a do fim dele, com no mínimo 3 dias com atividade.
Uma atividade na semana já conta a semana: dias de descanso não reduzem o valor e fazer mais não aumenta. A
primeira versão contava dias ativos ÷ dias, o que só chegava a 100 com atividade todo dia; a revisão de
privacidade (risco LEG-M07) trocou por semanas antes do merge. Só a data entra: duração, intensidade, distância,
carga e calorias não. O dashboard lê só as datas (`activityDays`, sem séries nem notas e sem decifrar nada); o
relatório reaproveita a leitura que já fazia. Vale para contas reais e
para a demo; na demo o Índice e o dashboard ficam completos em 7, 30 e 90 dias (teste do gerador e e2e).
Textos: regra do componente e `disclaimer.wellbeingScore` atualizados (aprovação em `approved-disclaimers.ts`).
Pedidos de revisão continuam guardando a versão usada.
**Consequências.** `docs/WELLBEING_SCORE.md` ganha a seção v3; OI-28 passa a aberta só pela revisão jurídica e
clínica (`LEGAL-REVIEW`, OI-09). O motivo `not_available` fica no tipo, sem uso na v3.

## ADR-0051 — Correções da revisão das capturas da 9a: gráficos, listas, selos, Corpo e unidades
**Contexto.** Dos 14 ajustes pedidos depois das capturas da 9a, 4 entraram na 9b e na 9c. Os outros 10 estavam
espalhados na 9d e na 9e; o produto pediu um PR só de correções antes da 9d.
**Decisão.**
- **Eixos (itens 1–3):** `paddedDomain` dá ao peso e às medidas uma faixa mínima de 4 (±2 kg ou cm) em torno da
  média, com limites em múltiplos de um passo redondo e tiques explícitos (`niceTicks`); variações pequenas não
  ocupam o gráfico inteiro (LEG-M06). As sparklines de medidas usam a mesma faixa. O eixo Y tem largura pelo maior
  rótulo formatado em pt-BR (sem a margem negativa que cortava "73,95"). Eixo com barra começa em zero, ignorando
  qualquer domínio; o `ScheduleChart` (horários) é exceção, porque é intervalo de horário. Séries de contagem
  (`integer`) têm eixo só com inteiros.
- **Paleta (item 4):** tokens `chart-1..5` e `chart-neutral`. Gráfico de uma série usa sempre o azul `chart-1`; as
  outras cores só aparecem em gráficos com várias séries (circunferências), sempre nessa ordem e com traços
  distintos. A paleta foi validada como conjunto com a skill dataviz no fundo escuro (faixa de luminosidade, croma,
  separação entre vizinhas para daltonismo e visão normal, >= 3:1 sobre `bg`, `surface` e `surface-muted`). Os tokens
  de domínio ficam só para ícones; `series-amber` e `series-violet` saíram. O `contrast.test` cobre marcas a 3:1 e
  vizinhas a OKLab ΔE >= 15. Grade e eixos continuam discretos (abaixo de 3:1, de propósito: não são informação).
- **Listas por semana (item 8):** `groupByWeek` (segunda a domingo) e `WeeklyList` em Alimentação, Atividade,
  Timeline e no histórico de Corpo: 2 semanas, "Ver mais" revela mais 2, foco no título da primeira semana nova e
  contador. Só apresentação. Sem JavaScript, ficam as 2 semanas mais recentes (o período inteiro continua nos
  gráficos e nas tabelas alternativas).
- **Selo DEMO (item 9):** discreto por padrão (só o ícone, 16 px, alvo de 24 px), com o mesmo nome acessível e a
  mesma dica; continua em cada dado (regra 7). `full` mostra o texto. A pílula do cabeçalho e a faixa continuam.
- **Corpo (item 10):** os blocos são o estado atual (a altura diz quando foi informada); a lista vira "Histórico de
  medições" por semana, só com os campos de cada data, sem repetir a altura nem o peso e a altura dos blocos
  (`historyRows`). A tabela alternativa dos gráficos continua.
- **Unidades (item 11):** `formatMeasure`/`MEASURE_UNITS` em toda medida exibida (Corpo, twin, início, carga dos
  exercícios, metas na timeline). A parte dos campos de formulário (unidade, "como medir", exemplo) segue na 9d.
- **Hábitos (item 12):** "Últimos 7 dias" em grade de 7 colunas; dia fora da agenda com borda tracejada e "não
  previsto" no nome do check, que também passa a dizer a data (antes dizia "hoje" em todos os dias).
**Consequências.** O plano do redesenho tira esses itens da 9d e da 9e. O ADR-0049 continua valendo; os números
dos próximos ADRs da Fase 9 andam um.

## ADR-0052 — Mensagens do navegador por rota (Fase 9, antes da 9d)
**Contexto.** O layout raiz entregava ao `NextIntlClientProvider` o catálogo inteiro (`messages/pt-BR.json`, 88 KB,
27 KB em gzip) em toda página: sem `messages`, o provedor do next-intl lê tudo da configuração da requisição. A
maior parte é texto de componentes de servidor (Central de Privacidade, resumos, textos jurídicos), que não
precisa ir ao navegador. No modo só demo já se tiravam `legal` e `consent` (ADR-0044).
**Decisão.**
- **Shell:** o provedor raiz recebe só os namespaces dos componentes de cliente de layouts, `error`, `loading` e
  `not-found` (`shellMessages`).
- **Página:** cada `page.tsx` exporta `withRouteMessages('<pasta>', Página)`, que envolve a página num provedor
  com só os namespaces dos componentes de cliente dela (`routeMessages`). Um provedor interno substitui as
  mensagens (não soma), então o conjunto da página é completo para o que está dentro dela; o shell fica com o
  provedor raiz. A raiz (`/`, só redirecionamento) não precisa.
- **Mapa gerado:** `scripts/i18n-client-namespaces.ts` (`pnpm i18n:client`) segue os imports a partir de cada
  página e dos arquivos do shell; a partir de um arquivo `'use client'`, junta os namespaces de `useTranslations`
  (literal, prefixo fixo de template, ou o primeiro trecho das chaves de um tradutor sem namespace). Argumento não
  literal num componente de cliente faz a análise falhar. Pega ramos (`twin.body`), não só o namespace inteiro.
  O resultado fica em `src/i18n/client-namespaces.generated.ts`.
- **Modo só demo:** `legal` e `consent` continuam fora de todo conjunto.
- **Testes:** o mapa gerado tem de bater com a análise do código (esqueceu de rodar `pnpm i18n:client` = teste
  vermelho); toda página com componente de cliente traduzido usa `withRouteMessages` com a própria pasta;
  `pickMessages`; demo sem textos jurídicos. e2e (`i18n-client.spec`): todas as rotas do app e da demo, o registro
  rápido e a entrada da apresentação sem `MISSING_MESSAGE` no console (conferido tirando `nav` do mapa: o teste
  falha).
- **Medida** (build de produção, local, HTML com o payload RSC embutido):

  | Página | Antes | Depois |
  |---|---|---|
  | `/inicio` (conta com dados) | 204,6 KB (46,2 KB gzip) | 131,6 KB (25,6 KB gzip) |
  | `/demo` | 192,8 KB (44,4 KB gzip) | 119,7 KB (23,8 KB gzip) |
  | `/privacidade` | 212,2 KB (45,7 KB gzip) | 155,8 KB (29,4 KB gzip) |
  | `/demo/corpo` | 188,0 KB (42,6 KB gzip) | 110,7 KB (21,1 KB gzip) |

  O JS de entrada não muda (`check:perf-budget`: `/inicio` 178,6 KiB, `/demo` 176,2 KiB).
**Consequências.** Componente de cliente novo com texto: rodar `pnpm i18n:client` (o teste lembra). Texto de
servidor nunca vai ao navegador por acaso. Navegar entre páginas baixa as mensagens da página nova no payload RSC,
como já acontecia com o resto da página.

## ADR-0053 — Polimento das capturas do #53/#54 (antes da 9d)
**Contexto.** A revisão das capturas depois das correções (ADR-0051) e das mensagens por rota (ADR-0052) apontou
repetições e um gráfico difícil de ler: "Medidas no período" num eixo único de 0 a 150 cm achatava todas as
regiões numa faixa de poucos centímetros.
**Decisão.**
- **Medidas no período → "Variação das medidas no período":** o gráfico mostra a diferença em cm desde a primeira
  medição do período de cada região (`changeRows`). Todas as linhas partem de zero, com o mesmo eixo em cm, rótulos
  com sinal e faixa mínima de ±2 cm. A tabela alternativa continua com as medidas em si (`tableData`).
  Minigráficos por região, cada um com escala própria, foram descartados: com escalas diferentes, 1 cm no braço e
  1 cm no quadril teriam alturas diferentes, e a comparação entre regiões enganaria. Num eixo comum de variação,
  a mesma altura é sempre a mesma mudança, e nenhuma medida grande achata as pequenas (LEG-M06).
- **Timeline:** o texto de cada linha não repete o rótulo ("Sono: 7 h 30 min", não "Sono: Sono: …";
  "Alimentação: 200 ml de água"). Quando todas as linhas do dia têm a mesma origem (na demo, sempre DEMO), o
  cartão do dia tem um selo só. Origens diferentes no mesmo dia (registro INFORMADO e marco ESTIMADO) mantêm o
  selo por linha (regra 7).
- **Alimentação:** sai a linha de números que repetia os Destaques (dias com refeição, água média, satisfação).
  O total estimado de calorias do dia, que os Destaques não trazem, fica junto do controle da estimativa, com
  selo ESTIMADO.
- **Formulários de exemplo:** um aviso só ("nada é salvo" e, fora do modo só demo, como registrar os próprios
  dados), no lugar de dois.
- **Início (modo só demo):** "Sobre esta demonstração" vai para a faixa fixa do topo. Saem o cartão de abertura,
  que repetia a faixa, e o ícone do cabeçalho. No app completo, o cartão fica, porque leva o convite para o
  cadastro. O destaque do início ("maior mudança") repetia um indicador: virou a marca "Maior mudança do período"
  no cartão do indicador. Nas outras telas, a grade de destaques tem tantas colunas quanto destaques (até 4), sem
  cartão solto em meia largura.
- **Sem `<select>` nativo:** `SelectField` usa o `ChoiceMenu`, com rádios nomeados que vão no envio do
  formulário e desativados juntos no exemplo da demo. O tipo de relatório vira três rádios à vista, sem depender
  de JavaScript, porque o formulário é GET.
**Consequências.** Os e2e escolhem opções pelo helper `e2e/choice.ts` em vez de `selectOption`. O guia "Como ler
este gráfico" das medidas descreve a variação.

## ADR-0054 — Clareza para registrar dados (9d)
**Contexto.** O plano da 9d pedia que cada campo de registro explicasse o que é, como medir e um exemplo, com a
unidade no campo; estados vazios com o próximo passo; e o caminho para registrar no tour. Parte já existia: o
"como medir" das circunferências (9c), os formulários de exemplo da demo com um aviso só (ADR-0047, ADR-0053), o
botão Registrar sempre visível (ADR-0047) e `MEASURE_UNITS` nas medidas exibidas (ADR-0051). A revisão das
capturas do #57 pediu também três ajustes.
**Decisão.**
- **Campo explicado:** `TextField`, `SelectField` (no `ChoiceMenu`, entre o rótulo e o botão), `TextAreaField` e
  `ScaleField` ganham `what`, `howTo`, `example` e `unit` (`FieldHelp`). Abaixo do rótulo: "o que é", "Como medir"
  num `<details>` fechado e "Ex.: 82,5 cm". O "o que é" e o exemplo entram no `aria-describedby`; o "como medir"
  fica no `<details>`, que se abre pelo teclado. A unidade é sufixo visual (`aria-hidden`) e entra por extenso no
  nome acessível ("Cintura, em centímetros").
- **Onde ficam os textos (desvio do plano):** o plano previa `<módulo>.fields.<campo>.{label,what,how,example,unit}`.
  Os rótulos `body.fields.*` já servem a gráficos, listas, resumos e ao twin como texto simples; virar objeto
  obrigaria a mexer em todos. Ficou `<módulo>.help.<campo>.{what,how,example}`, com os rótulos onde estavam. A
  unidade vem do código (`MEASURE_UNITS` e o tipo `FieldUnit`), não do catálogo, para não haver duas fontes. Os
  `form.*Hint` que explicavam o campo, o `body.howToMeasure` e o `UNITS` local do `BodyForm` saíram.
- **Exemplos neutros (revisão de privacidade):** nas medidas do corpo, o exemplo mostra só o formato ("Formato:
  12,3 cm"), um número que não é medida plausível, para não ser lido como referência de corpo (LEG-M06). O texto
  chega igual ao leitor de tela, e no modo privacidade os exemplos somem. Calorias não têm exemplo (LEG-M07). Metas
  não têm exemplo de alvo; a de sono explica a conversão com números neutros (60 min = 1 h). As linhas de séries de
  força têm só a unidade da carga; a explicação é a do grupo. Cada "Como medir" leva o nome do campo para o leitor
  de tela.
- **Estados vazios:** `StateView` ganha `nextStep` ("Próximo passo: …", com rótulo em texto) no vazio, sem dados e
  parcial. Nos módulos com formulário, `NoRecords` aponta para o formulário da própria página (`#novo`); na
  demonstração, onde nada é salvo, sugere outro período. A Timeline oferece o Registrar.
- **Tour:** novos passos `twinHero` (alvo `twin-hero`), `register` (alvo visível entre o botão do topo e o da barra
  de baixo), `quicklog` e `formField` (sem alvo: o diálogo e os formulários ficam em outras telas).
- **Ajustes da revisão:** Corpo sem o bloco "Variação no período" (o mesmo número dos Destaques); "Noites
  registradas" por semana com "Ver mais", como as outras listas; eixo do "Horário de sono" do deitar mais cedo ao
  acordar mais tarde, em múltiplos de 2 h, com tiques de 2 em 2 h e faixa mínima de 8 h (`scheduleAxis`).
**Consequências.** Os nomes acessíveis dos campos com unidade mudaram ("Peso, em quilogramas"), e os e2e foram
ajustados. O namespace `fields` vai às rotas com formulário (`pnpm i18n:client`). Textos de ajuda em RASCUNHO
(OI-41). A 9f passa a registrar o sistema de movimento no ADR-0055.
**Ajuste 9d1 (revisão das capturas do #58).** Os formulários ficaram pesados (três linhas de ajuda por campo).
Agora cada campo mostra uma linha curta, "o que é" e a dica (faixa aceita, pontas da escala) juntos, e um
`<details>` fechado: "Como medir", ou "Ver exemplo" quando o campo só tem exemplo, com o exemplo dentro. O leitor
de tela continua recebendo a linha curta e o exemplo pelo `aria-describedby` e a unidade por extenso no nome. O
eixo do "Horário de sono" ganhou margem em cima: o rótulo do primeiro tique (eixo invertido) era cortado.

## ADR-0055 — Sistema de movimento e interatividade (Fase 9f)
**Contexto.** Última sub-fase do redesenho visual. Base já existente: `TiltCard`, `useFinePointer`,
`useMotionPreference` e a opção "Reduzir animações" (ADR-0048). Plano aprovado com três escolhas do produto: ímã
só no Registrar do topo, no desktop; gráficos de Corpo e Alimentação só esmaecem; `/demo` no desktop entra na
medição de performance. Acréscimos pedidos na aprovação: brilho e borda azul em todo cartão e botão clicável ao
passar o mouse, destaque nas linhas das listas e entrada em sequência só dos itens novos do "Ver mais", tudo sem JS.
**Decisão.**
- **Sem biblioteca nova.** CSS, Web Animations, IntersectionObserver e o `<ViewTransition>` do React 19.3. Só
  `transform`, `opacity`, `clip-path`, cor e sombra. Nada começa antes da hidratação nem muda o HTML do servidor,
  então a primeira pintura e o LCP não mudam.
- **Uma preferência só.** `useReducedMotion()` (`src/lib/motion/motion.ts`) une `prefers-reduced-motion` e a opção do
  app; gráficos, tour e twin, que só olhavam o sistema, passam a usá-la. O CSS de "reduzido" também zera atrasos e
  desfaz os estados escondidos.
- **Sem script inicial (decisão revista na medição).** Um script com nonce no `<head>` marcaria a opção antes da
  primeira pintura, mas um `<script>` em linha depois das folhas de estilo faz o navegador parar a leitura do HTML até
  o CSS chegar: ~90 ms a mais no "interativo" de `/demo` no celular, medido. Nenhum efeito roda antes da hidratação
  (tudo é hover, clique, ou começa por JS depois de hidratar), então o script não é necessário, como no ADR-0048.
- **Sem JS (CSS em `globals.css`):** `.hm-hover` (botões, `ChoiceMenu`, opções do Registrar, cartões com inclinação,
  check de hábito, regiões do twin) e `.hm-row` (linhas de Timeline, refeições, noites, medições e sessões) só com
  `(hover: hover) and (pointer: fine)`; `.hm-press` (escala 0,98 ao pressionar, também no toque, desligada com
  "reduzido"); conteúdo de `<details>` entra suave; `data-enter` no `WeeklyList` só nas semanas novas, com as linhas
  em sequência; pulo do ícone do hábito só depois do clique; passo do tour esmaece e o destaque do alvo aparece se
  aproximando. Impressão: tudo no estado final (`@media print`).
- **Com JS pequeno:** `CountUp` (Índice, sono médio e hábitos no início; nunca peso, medidas nem alimentação,
  LEG-M06/M07): só conta se o número está fora da tela ao hidratar; o valor final fica no DOM (transparente durante a
  contagem) e é o que o leitor de tela lê, os intermediários são `aria-hidden`, sem `aria-live`. `useReveal`: o
  gráfico abre da esquerda para a direita (`draw`) ou só esmaece (`fade`: Corpo, Alimentação, relatórios e
  mini-gráficos de medidas) ao entrar na tela; o recharts deixa de animar (`isAnimationActive={false}`), o que tira
  trabalho da carga. O recorte vai no filho do contêiner observado: o IntersectionObserver do Chromium conta o
  `clip-path` do próprio alvo. Barra das metas (`ProgressTrack`, `useReveal('grow')`; peso e calorias não têm barra):
  enche ao entrar na tela; se já está na tela ao hidratar, fica como veio do servidor, sem piscar. `CountUp` e a barra
  decidem pela primeira resposta do IntersectionObserver, sem ler a caixa do elemento na hidratação. `Magnetic` (até 4 px, só no Registrar do topo, só com mouse; o contêiner não se move).
  Twin: a troca de destaque de região leva 240 ms no shader, pedindo quadros só enquanto dura (`frameloop="demand"`).
- **Troca de página:** `<ViewTransition>` em volta do conteúdo do shell (app e demo), esmaecimento de 200 ms, só em
  navegações pelo menu lateral e pela barra de baixo (`transitionTypes={['hm-page']}`; `default: 'none'` para o
  resto). Sem tipo, toda atualização dentro de uma transition do React (modo privacidade, período, `router.refresh`)
  esperava a animação: o "interativo" do celular subiu ~220 ms, medido. Direta com "reduzido" (regras nos
  pseudo-elementos `::view-transition-*`, que a regra geral não alcança). Durante a transição o Next só repõe o
  `<title>` no fim.
- **Desvios do plano:** o destaque do tour não desliza de um alvo ao outro (o contorno é do próprio alvo; deslizar
  exigiria uma camada nova), ele aparece se aproximando e o texto esmaece; contagem em minutos de atividade não se
  aplica (o início não tem cartão de atividade); a inclinação dos Destaques já existia (ADR-0048); o twin não fica
  fora da transição de página (ela só esmaece o quadro todo, sem mover nada).
**Testes.** Unitários (`src/lib/motion/motion.test.tsx`): preferência unida, script inicial (com e sem storage),
contagem (formatos, visível sem contar, fora da tela conta com o valor final no DOM, "reduzido"), peso sem contagem
no início, revelação (entra, termina sem recorte, "reduzido", sem IntersectionObserver), barra das metas (fora e
dentro da tela), "Ver mais" só nas semanas novas, pulo só depois do clique, ímã (mouse, toque, "reduzido"). E2e
(`demo.spec.ts`): desktop com mouse (contagem, gráfico, brilho, ímã com contêiner parado, "Ver mais" com foco e axe),
"reduzido" (sem contagem, gráfico escondido nem ímã) e toque sem inclinação, ímã nem hover. `e2e/settle.ts` deixa
a página no estado final antes de todo axe: emula "reduzir movimento" (o axe mede o contraste do que ainda não
entrou na tela), espera transição e animações acabarem e o título voltar, tira o mouse e volta ao topo (fica fora
da cobertura automática o alvo coberto pelo cabeçalho fixo no meio da rolagem, que a 9f não mudou).
Vídeo de revisão: `pnpm video:movimento` (projeto Playwright `video`, só sob demanda) grava
`capturas/movimento-9f.webm`.
