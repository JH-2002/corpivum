# Runbook — Rotação de chaves e segredos

> **RASCUNHO.** Requisitos: LEG-S02, LEG-S07. A criptografia de campo é implementada na Fase 1a.

## Inventário
| Segredo | Onde fica | Rotação | Impacto |
|---|---|---|---|
| Chave mestra (KEK) do KMS | `{{KMS}}` (produção); `KMS_LOCAL_MASTER_KEY` só em dev | `{{PERIODICIDADE}}` ou em incidente | Recifrar DEKs |
| Credenciais do banco (`app_user`, `app_migrator`) | Gerenciador de segredos `{{SEGREDOS}}` | `{{PERIODICIDADE}}` | Reinício do runtime |
| Segredo de sessão / CSRF | `{{SEGREDOS}}` | Em incidente | Usuários precisam entrar de novo |
| Chave do provedor de LLM | `{{SEGREDOS}}` | `{{PERIODICIDADE}}` | Nenhum |
| Chave do provedor de e-mail | `{{SEGREDOS}}` | `{{PERIODICIDADE}}` | Nenhum |

Segredos **nunca** no repositório (CLAUDE.md regra 6; gitleaks na CI).

## Rotação da chave mestra (envelope)
Cada valor cifrado guarda a DEK cifrada e o `keyId` da KEK que a cifrou.
1. Criar a nova KEK no KMS (novo `keyId`); manter a antiga ativa só para decifrar.
2. Novas gravações passam a usar a nova KEK.
3. Job de recifragem: para cada DEK com `keyId` antigo, decifrar com a KEK antiga e cifrar com a nova
   (os dados em si não precisam ser recifrados).
4. Confirmar que nenhuma DEK usa o `keyId` antigo; desativar e depois destruir a KEK antiga.
5. Registrar data, `keyId` antigo/novo e responsável (sem material de chave no registro).

## Em incidente
Seguir `INCIDENT.md`: revogar sessões, rotacionar imediatamente os segredos expostos e recifrar DEKs.
