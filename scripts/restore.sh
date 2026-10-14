#!/usr/bin/env bash
# Restaura um backup do Assessor KM num VPS limpo (ou por cima). Uso: bash scripts/restore.sh assessor-km-backup-XXXX.tar.gz
set -euo pipefail
ARQ="$1"; cd "$(dirname "$0")/.."
TMP=$(mktemp -d); tar -C "$TMP" -xzf "$ARQ"
docker compose down 2>/dev/null || true
mkdir -p data; cp "$TMP/assessor-km/assessor.db" data/assessor.db; rm -f data/assessor.db-wal data/assessor.db-shm
rsync -a "$TMP/assessor-km/data/" data/ 2>/dev/null || true
cp "$TMP/assessor-km/.env" .env
# código: o repo é a fonte; se o git estiver vazio, usa a cópia do backup
if [ ! -d .git ] && [ -f "$TMP/assessor-km/repo.bundle" ]; then git clone "$TMP/assessor-km/repo.bundle" . ; fi
rsync -a "$TMP/assessor-km/codigo/src/personas/" src/personas/ 2>/dev/null || true
rsync -a "$TMP/assessor-km/codigo/src/conhecimento/" src/conhecimento/ 2>/dev/null || true
rm -rf "$TMP"
docker compose up -d --build && bash scripts/deploy-vps.sh
echo "✅ restaurado"
