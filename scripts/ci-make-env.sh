#!/bin/sh
# Gera um .env efêmero para a CI a partir do .env.example, com senhas e segredos aleatórios.
# Nunca imprime os valores. Usado pelos jobs que sobem o Postgres (CLAUDE.md regra 6).
set -eu

pw="$(openssl rand -hex 16)"
kms="$(openssl rand -base64 32)"
session="$(openssl rand -base64 32)"
ratelimit="$(openssl rand -base64 32)"
recovery="$(openssl rand -base64 32)"
backup="$(openssl rand -base64 32)"

sed \
  -e "s/troque-localmente/${pw}/g" \
  -e "s|^KMS_LOCAL_MASTER_KEY=|KMS_LOCAL_MASTER_KEY=${kms}|" \
  -e "s|^SESSION_SECRET=|SESSION_SECRET=${session}|" \
  -e "s|^RATE_LIMIT_SECRET=|RATE_LIMIT_SECRET=${ratelimit}|" \
  -e "s|^RECOVERY_CODE_PEPPER=|RECOVERY_CODE_PEPPER=${recovery}|" \
  -e "s|^BACKUP_ENCRYPTION_KEY=|BACKUP_ENCRYPTION_KEY=${backup}|" \
  .env.example > .env
