# Backup e restauração — Assessor KM

## O que é salvo
- `.env` (todas as chaves), `docker-compose.yml`
- `data/assessor.db` (contas, personas, memória, posts, documentos, biblioteca, tokens Google/Instagram) — cópia consistente via `.backup`
- `data/` (demais arquivos), código atual (inclui `src/personas` e `src/conhecimento` editados) e `repo.bundle` (histórico git)
- Mídias no Cloudinary e documentos no Drive **não** entram (já estão na nuvem e têm retenção própria).

## Manual
```
cd /docker/assessor && bash scripts/backup.sh
```
Gera `backups/assessor-km-backup-AAAAMMDD-HHMM.tar.gz`, mantém os 10 últimos e envia uma cópia para o Google Drive (pasta `Assessor KM/Backups`, 10 últimos).

## Automático (diário 04:00)
```
(crontab -l 2>/dev/null; echo "0 4 * * * cd /docker/assessor && bash scripts/backup.sh >> /var/log/assessor-backup.log 2>&1") | crontab -
```

## Restaurar (VPS novo)
```
git clone https://github.com/kauemunchen/assessor /docker/assessor && cd /docker/assessor
bash scripts/restore.sh /caminho/assessor-km-backup-XXXX.tar.gz
```
Depois: `status` no Telegram (Google e Instagram devem aparecer ✅ — os tokens vêm no banco).

## Baixar o backup para o seu computador
`scp root@76.13.210.24:/docker/assessor/backups/assessor-km-backup-*.tar.gz ~/Downloads/` — ou abra a pasta Backups no Drive.
