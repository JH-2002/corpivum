# Questões jurídicas em aberto (`LEGAL-REVIEW`)

> Lista viva. Cada item precisa de decisão de advogado(a) especializado(a) e, quando indicado, de revisão
> clínica, antes do lançamento público. Ao resolver: registrar a decisão, a data e quem decidiu, e mover para
> "Resolvidas". Ver também `docs/legal/CHECKLIST_GO_LIVE.md`.

| ID | Tema | Questão | Referência | Afeta | Status |
|---|---|---|---|---|---|
| OI-01 | Base legal | Consentimento (art. 11, I) é a base adequada para dados de saúde em app de bem-estar? | LEG §A, §C.1 | Fase 1b | Aberta |
| OI-02 | Idade | Autodeclaração de data de nascimento + bloqueio de menores basta frente ao ECA Digital (Lei 15.211/2025) e à fiscalização da ANPD? Confirmar vigência e obrigações na data do lançamento. | LEG-F01, F02, §C.2 | Fase 1a | Aberta (Fase 1a implementada; validação jurídica pendente) |
| OI-03 | Transferência internacional | Provedor de LLM e outros subprocessadores fora do Brasil: mecanismo do art. 33 e regulamento da ANPD. | LEG-I03, LEG-S10, §C.3 | Fase 5 | Aberta |
| OI-04 | Retenção | Prazos de prova de consentimento e de pedidos do titular (LEG-R03), backups e logs. | LEG-R03, S07, §C.4 | Fases 1b, 6 | Aberta |
| OI-05 | Incidentes | Prazo vigente de comunicação à ANPD e aos titulares (regulamento de incidentes). Placeholder no runbook. | LEG-S08, §C.4 | Fase 7 | Aberta |
| OI-06 | Marco Civil | Definir o controlador (PF ou PJ). Se o art. 15 não se aplicar, reduzir `ACCESS_LOG_RETENTION_DAYS` (hoje 180) ao mínimo para segurança. | LEG-R02, §C.6 | Fase 1b | Aberta |
| OI-07 | ANVISA | Enquadramento (SaMD, RDC 657/2022) de medicamentos, metas e recomendações. Revisar `docs/INTENDED_USE.md`. | LEG-M01, §C.5 | Todas | Aberta |
| OI-08 | Textos | Política de Privacidade, Termos, consentimentos por finalidade, Aviso de IA, Cookies: textos finais. | LEG-G04, §C.7 | Fase 1b | Aberta |
| OI-09 | Avisos de interface | Revisão jurídica **e clínica** das chaves `disclaimer.*` em `messages/pt-BR.json` (texto de bem-estar, medicamentos, cérebro/neuroquímica, IA, rodapé de relatório, apoio CVV/SAMU, rótulo de rascunho). | LEG-M01–M05, LEG-I07 | Fase 0 em diante | Aberta |
| OI-10 | Glossário | Validar o glossário de termos proibidos (`tests/content/forbidden-terms.ts`) com revisão jurídica/clínica. | LEG-M03 | Fase 0 em diante | Aberta |
| OI-11 | Subprocessadores | Escolher hospedagem, banco, storage, filas, e-mail e monitoramento com região no Brasil; assinar DPAs; preencher `docs/privacy/SUBPROCESSORS.md`. | LEG-S10, LEG-D06 | Fase 7 | Aberta |
| OI-12 | Encarregado | Nomear o encarregado e publicar o canal de contato (`{{ENCARREGADO}}`). | LEG-G03 | Fase 1b | Aberta |
| OI-13 | Revisão de avisos | CODEOWNERS preenchido com @JH-2002. Falta: (a) incluir revisor jurídico/clínico quando houver; (b) exigir aprovação de Code Owners na branch `main` (em repositório privado, requer plano GitHub Pro/Team). Até lá, a revisão de `disclaimer.*` depende do teste de texto aprovado e do checklist de PR. | LEG-M03 | Fase 0 | Parcial |
| OI-14 | Retenção técnica | Expurgo de dados de autenticação: job `auth.purge_expired` a cada 6 h já agendado (`src/instrumentation.ts`). Falta: (a) fila real com workers na hospedagem (hoje a fila em memória é consumida no próprio servidor); (b) confirmar com o jurídico a folga de 1 dia para investigação de abuso. | LEG-R*, ROPA T1/T5, ADR-0017 | Fase 7 | Parcial |
| OI-15 | Disponibilidade da conta | O bloqueio de login por conta (5 por 15 min) permite que terceiros travem o acesso de alguém sabendo só o e-mail. Avaliar atraso progressivo ou exceção para aparelho conhecido, sem reabrir a enumeração. | LEG-S04, ADR-0017 | Fase 7 | Aberta |

## Achados de severidade baixa do `privacy-reviewer` (Fase 1a)

Registrados aqui por decisão do responsável pelo projeto. Os marcados como resolvidos foram corrigidos na
própria Fase 1a (ADR-0017), com teste; ficam listados para rastreabilidade.

| ID | Achado | Referência | Status |
|---|---|---|---|
| PR1a-B1 | `cookies().delete()` não apaga cookie `__Host-` (Set-Cookie sem `Secure`); o token revogado ficava no navegador. | LEG-S04 | Resolvido: sobrescrita com os mesmos atributos e `maxAge: 0` |
| PR1a-B2 | Bloqueio por conta permite travar o login de terceiros sabendo só o e-mail (também `resetAccount`). | LEG-S04 | **Aberto**, ver OI-15 |
| PR1a-B3 | Pepper dos códigos de recuperação é o `SESSION_SECRET`: girá-lo invalida todos os códigos. | LEG-S04 | **Aberto**: efeito documentado em KEY_ROTATION; segredo próprio na Fase 7 |
| PR1a-B4 | Pequena diferença de tempo no cadastro (e-mail novo × existente). | ADR-0014 | Resolvido: token e e-mail após a resposta (`after()`) |
| PR1a-B5 | Erros do Prisma/Next fora do logger podem ecoar argumentos (hashes). | LEG-R04 | **Parcial**: Prisma com `errorFormat: 'minimal'`; `onRequestError` com ferramenta de erros na Fase 7 |
| PR1a-B6 | `hm_age_block` só era checado nas páginas, não nas server actions do cadastro. | LEG-F01 | Resolvido: checado também nas actions |
| PR1a-B7 | Políticas RLS chamavam função plpgsql por linha. | LEG-S03 | Resolvido: `(SELECT app.current_user_id())` |
| PR1a-B8 | `app_user` podia alterar qualquer coluna de `users`. | LEG-S03 | Resolvido: UPDATE só nas colunas mutáveis (teste) |
| PR1a-B9 | URI `otpauth://` (com o segredo) ia ao cliente sem uso. | Minimização | Resolvido: só QR e chave manual |
| PR1a-B10 | `test:db`/e2e apagavam tabelas do banco do `.env` sem trava. | Regra 6 | Resolvido: recusam banco não local fora da CI |

### Segunda revisão (ADR-0018)

| ID | Achado | Referência | Status |
|---|---|---|---|
| PR1a-R2-B1 | Desativar o MFA consome o limite `mfaAccount` antes de checar a senha. Uma sessão roubada pode travar o login com MFA do titular por 1 h e disparar o aviso de bloqueio. Correção: checar a senha antes. | LEG-S04 | Aberto |
| PR1a-R2-B2 | `mfaAccount` conta também tentativas certas: mais de 10 logins com MFA por hora bloqueiam. Durante o bloqueio por conta, a mensagem "entre novamente" não resolve. Correção: contar só falhas e trocar o texto para "tente de novo em até 1 hora". | LEG-S04 | Aberto |
| PR1a-R2-B3 | `CLIENT_IP_HEADER` aceita `x-forwarded-for` e usa o 1º valor, que o cliente controla em hospedagens que só acrescentam ao cabeçalho. Sem o cabeçalho, todo mundo cai em `'unknown'` sem alerta. Correção: recusar `x-forwarded-for` no schema e registrar `auth.client_ip_missing`. | LEG-S05 | Aberto |
| PR1a-R2-B4 | `regenerateRecoveryCodes` e `resetPassword` não enviam `security-alert`. | LEG-S04 | Aberto |
| PR1a-R2-B5 | O runtime pode alterar qualquer coluna de `sessions` (`mfa_pending`, `token_hash`, `user_id`…). Correção: UPDATE só em `last_seen_at`, `idle_expires_at`, `revoked_at`, `mfa_attempts` e `updated_at`, com teste. | LEG-S03 | Aberto |
| PR1a-R2-B6 | O job de expurgo não é singleton. Com fila real, cada instância cria uma cadeia nova. Na fila em memória, um `drain` acima de 60 s reexecuta o job. Correção: "enqueue if absent" e status `running`. | LEG-R*, OI-14 | Aberto (Fase 7, com a fila real) |
| PR1a-R2-B7 | O limite usa o relógio da aplicação (`p_now`) e o expurgo usa `now()` do banco. Com diferença de relógio, uma janela ativa pode ser apagada. Correção: mesmo relógio ou folga de 5 min no expurgo. | LEG-S05 | Aberto |
| PR1a-R2-B8 | O teste de guarda das actions só detecta `export async function`. Escapam `export const x = async` e `route.ts` em `(app)`. Correção: iterar os exports do módulo ou usar regra de ESLint. | LEG-S04 | Aberto |

## Resolvidas
_(nenhuma)_
