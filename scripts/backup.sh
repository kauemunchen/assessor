#!/usr/bin/env bash
# Backup completo do Assessor KM (rodar no VPS): código + .env + banco SQLite (cópia consistente) + data/ + personas/conhecimento editados.
# Uso: bash scripts/backup.sh [destino]   → gera assessor-km-backup-AAAAMMDD-HHMM.tar.gz (e opcionalmente envia ao Google Drive do dono)
set -euo pipefail
cd "$(dirname "$0")/.."
TS=$(date +%Y%m%d-%H%M); DEST="${1:-./backups}"; mkdir -p "$DEST"
TMP=$(mktemp -d); mkdir -p "$TMP/assessor-km"
# 1) banco: cópia consistente mesmo com o bot rodando (WAL)
if [ -f data/assessor.db ]; then
  if command -v sqlite3 >/dev/null; then sqlite3 data/assessor.db ".backup '$TMP/assessor-km/assessor.db'"
  else docker run --rm -v "$PWD/data:/d" -v "$TMP/assessor-km:/o" node:22-alpine sh -c "apk add -q sqlite && sqlite3 /d/assessor.db \".backup '/o/assessor.db'\"" ; fi
fi
# 2) segredos e config
cp .env "$TMP/assessor-km/.env" 2>/dev/null || true
cp docker-compose.yml "$TMP/assessor-km/" 2>/dev/null || true
# 3) dados (sem o db já copiado, sem cache do telegram-api)
rsync -a --exclude 'assessor.db*' --exclude 'telegram-api' data/ "$TMP/assessor-km/data/" 2>/dev/null || true
# 4) código no estado atual (inclui alterações locais em personas/conhecimento)
git bundle create "$TMP/assessor-km/repo.bundle" --all >/dev/null 2>&1 || true
rsync -a --exclude node_modules --exclude .git --exclude data --exclude backups --exclude '__pycache__' ./ "$TMP/assessor-km/codigo/"
# 5) manifesto
{ echo "Assessor KM — backup $TS"; echo "commit: $(git rev-parse --short HEAD 2>/dev/null || echo ?)"; echo "host: $(hostname)"; echo; echo "Restaurar: bash scripts/restore.sh <arquivo.tar.gz>"; } > "$TMP/assessor-km/LEIA-ME.txt"
ARQ="$DEST/assessor-km-backup-$TS.tar.gz"
tar -C "$TMP" -czf "$ARQ" assessor-km && rm -rf "$TMP"
echo "✅ $ARQ ($(du -h "$ARQ" | cut -f1))"
# 6) retenção local: mantém os 10 últimos
ls -1t "$DEST"/assessor-km-backup-*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
# 7) opcional: envia ao Google Drive do dono (pasta Assessor KM/Backups) usando o token já autorizado do bot
if [ "${BACKUP_DRIVE:-1}" = "1" ] && [ -f data/assessor.db ]; then
  # roda dentro do container (tem node_modules e o .env); o arquivo é montado em /tmp
  docker run --rm --env-file .env -v "$PWD/data:/app/data" -v "$(realpath "$ARQ"):/tmp/backup.tar.gz:ro" assessor-assessor node scripts/backup-drive.js /tmp/backup.tar.gz \
    || echo "⚠️ não enviou ao Drive (segue local)"
fi
