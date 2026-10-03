#!/usr/bin/env bash
# Ежедневный дамп базы (theabc-backup.timer). Хранятся 14 дней, плюс бэкапы диска в Timeweb.
set -euo pipefail
# В дампах персональные данные — доступ только у root
umask 077
cd /opt/theabc

dir=/var/backups/theabc
mkdir -p "$dir"
file="$dir/db-$(date +%F_%H%M).sql.gz"

docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "$file.tmp"
mv "$file.tmp" "$file"
find "$dir" -name 'db-*.sql.gz' -mtime +14 -delete
echo "Backup saved: $file ($(du -h "$file" | cut -f1))"
