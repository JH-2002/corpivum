# Fase 1a — Autenticação, sessões, idade, RLS e criptografia

> Rode em sessão limpa (`/clear`). Comece pelo modo plan.

```text
Leia CLAUDE.md, docs/LEGAL_REQUIREMENTS.md, docs/SPEC_ADDENDUM.md e as seções relevantes de docs/PRODUCT_SPEC.md. Proponha um plano e aguarde minha aprovação antes de escrever código.

Implemente autenticação com Auth.js (e-mail/senha com hash forte, verificação de e-mail, recuperação de senha,
MFA TOTP com códigos de recuperação, limite de tentativas) usando SESSÕES EM BANCO, listáveis e revogáveis
individualmente. Se o provider Credentials não permitir isso de forma limpa, pare, explique e proponha
alternativa em docs/DECISIONS.md antes de seguir.
Implemente o age gate 18+ (LEG-F01): menor não persiste nenhum dado, nem a data informada.
Implemente RLS no PostgreSQL: runtime como app_user, extensão do Prisma Client que envolve cada operação em
transação com SET LOCAL app.user_id, políticas com current_setting('app.user_id', true).
Implemente criptografia de campo (AES-256-GCM, envelope via KmsProvider) como utilitário reutilizável,
rate limiting, CSRF e security headers.
Critérios: teste de isolamento entre dois usuários; teste de que consulta sem app.user_id retorna vazio;
revogar uma sessão derruba o acesso na próxima requisição; menor de 18 não gera linha em nenhuma tabela;
nenhum log com dado sensível; privacy-reviewer sem achados críticos.
Requisitos: LEG-F01, LEG-F03, LEG-S01–S05, LEG-R04.
```
