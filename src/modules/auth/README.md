# Módulo `auth`

Conta, autenticação, MFA, sessões em banco e age gate 18+.

- Spec: §52 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-S04, LEG-F01, LEG-F03
- Fase: 1a (ADR-0014, ADR-0015, ADR-0016)

## Estrutura
- `service.ts`: regras (cadastro, login, MFA, sessões, recuperação). Dependências injetadas; testado com
  Postgres real em `tests/db`.
- `server.ts`: integração com o Next (cookies `__Host-`, guards `requireSession`/`requireVerifiedSession`).
- `crypto.ts`: `constantTimeEqual`, hashes, tokens. **Segredos nunca são comparados com `===`** (regra ESLint).
- `password.ts` (Argon2id nativo), `totp.ts` (RFC 6238), `recovery.ts`, `age.ts`, `qr.ts` (QR local),
  `rate-limit.ts`, `schemas.ts` (Zod), `constants.ts` (seguro para o cliente).

## Regras
- Login, cadastro, recuperação e reenvio não revelam se o e-mail existe.
- Pré-login só pelas funções SECURITY DEFINER de `app.*`; o resto por `withUser` (RLS).
- Logs só com `userId`/`operation`/`errorCode`.

Exponha a API pública do módulo apenas por `index.ts`. Outros módulos não importam arquivos internos.
