# Arquivos acima de 20 MB — Bot API local

O limite de 20 MB (download) / 50 MB (upload) é do servidor `api.telegram.org`. Rodando o **Bot API local** no VPS o limite sobe para **2 GB**.

## Passos (uma vez)
1. Em https://my.telegram.org → *API development tools* → criar app → copiar `api_id` e `api_hash`.
2. No VPS, em `/docker/assessor/.env`:
   ```
   TELEGRAM_API_ID=123456
   TELEGRAM_API_HASH=abcdef...
   TELEGRAM_API_BASE=http://telegram-api:8081
   TELEGRAM_WEBHOOK_URL=http://assessor:3000/webhook/telegram
   ```
3. Desligar o bot do servidor da nuvem (obrigatório antes de usar o local):
   ```
   curl "https://api.telegram.org/bot<TOKEN>/logOut"
   ```
4. Subir com o perfil `bigfiles` e refazer o webhook:
   ```
   cd /docker/assessor && docker compose --profile bigfiles up -d --build
   bash scripts/deploy-vps.sh
   ```
5. Testar: mandar um PDF de 30+ MB para o bot.

## Voltar para a nuvem
`curl "http://localhost:8081/bot<TOKEN>/close"` (de dentro da rede do compose), apagar `TELEGRAM_API_BASE` e `TELEGRAM_WEBHOOK_URL` do `.env`, `docker compose up -d --force-recreate`, `bash scripts/deploy-vps.sh`.

## Alternativa sem infra
Mandar o **link do arquivo no Google Drive** — o módulo Documentos move para a pasta certa e registra do mesmo jeito (OCR só até 18 MB; acima disso classifica pelo nome e você complementa por texto).
