#!/usr/bin/env sh
set -eu

DATABASE_URL="${DATABASE_URL:-${BEASTMODE_DATABASE_URL:-}}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL or BEASTMODE_DATABASE_URL is required" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required; install postgresql-client on the host or use the app image" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/beastmode-$timestamp.dump"

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$target"
gzip -f "$target"

find "$BACKUP_DIR" -type f -name 'beastmode-*.dump.gz' -mtime +"$RETENTION_DAYS" -delete

echo "$target.gz"
