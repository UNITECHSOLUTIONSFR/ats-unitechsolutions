#!/usr/bin/env bash
# Démarre une base Postgres temporaire (tests uniquement) et y applique les migrations.
# Usage : scripts/db-locale.sh  -> affiche l'URL de connexion
set -euo pipefail
BIN=/usr/lib/postgresql/16/bin
DIR="${PGTEST_DIR:-/tmp/ats-pgtest}"
PORT="${PGTEST_PORT:-54329}"
if [ ! -f "$DIR/PG_VERSION" ]; then
  rm -rf "$DIR"; mkdir -p "$DIR"; chown postgres "$DIR" 2>/dev/null || true
  su postgres -c "$BIN/initdb -D $DIR -A trust -U postgres" >/dev/null
fi
if ! su postgres -c "$BIN/pg_ctl -D $DIR status" >/dev/null 2>&1; then
  su postgres -c "$BIN/pg_ctl -D $DIR -o '-p $PORT -k /tmp' -l $DIR/log start -w" >/dev/null
fi
echo "postgresql://postgres@localhost:$PORT/postgres"
