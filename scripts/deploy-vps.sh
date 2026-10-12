#!/usr/bin/env bash
# Primeiro deploy no VPS. Rodar como root em /docker.
set -e
cd /docker
[ -d assessor ] || git clone https://github.com/kauemunchen/assessor.git assessor
cd assessor && git pull
[ -f .env ] || { cp .env.example .env; echo ">> Edite /docker/assessor/.env com TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, GOOGLE_CLIENT_ID/SECRET e rode de novo."; exit 1; }
mkdir -p data
docker compose up -d --build
sleep 5
TOKEN=$(grep ^TELEGRAM_BOT_TOKEN .env | cut -d= -f2)
URL=$(grep ^PUBLIC_URL .env | cut -d= -f2)
API_BASE=$(grep -E '^TELEGRAM_API_BASE=' .env | cut -d= -f2- | tr -d '[:space:]')
API_BASE=${API_BASE:-https://api.telegram.org}
# Bot API local: o webhook pode apontar direto para o container (sem passar pelo Traefik)
WEBHOOK_URL=$(grep -E '^TELEGRAM_WEBHOOK_URL=' .env | cut -d= -f2- | tr -d '[:space:]')
WEBHOOK_URL=${WEBHOOK_URL:-${URL}/webhook/telegram}
curl -s "${API_BASE}/bot${TOKEN}/setWebhook?url=${WEBHOOK_URL}" && echo
docker compose logs --tail=20
