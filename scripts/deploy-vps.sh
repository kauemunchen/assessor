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
curl -s "https://api.telegram.org/bot${TOKEN}/setWebhook?url=${URL}/webhook/telegram" && echo
docker compose logs --tail=20
