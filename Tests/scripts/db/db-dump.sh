#!/bin/bash
#
# Dump the dev database (excluding sessions).
#
# Usage:  bash scripts/db-dump.sh [filename]
#
# Default output: dumps/seed.sql
#
# Credentials and table prefix are read from
# Apps/IRabi/WorkDir/ConfigDev/db.ini (fallback: Config/db.ini) — the
# same source the PHP app uses, so the dump always targets the active
# database without hard-coded duplication.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DUMP_DIR="$SCRIPT_DIR/../dumps"
DUMP_FILE="${1:-$DUMP_DIR/seed.sql}"

# Locate db.ini — dev first, then prod fallback.
for candidate in \
    "$REPO_ROOT/Apps/IRabi/WorkDir/ConfigDev/db.ini" \
    "$REPO_ROOT/Apps/IRabi/WorkDir/Config/db.ini"; do
    if [ -f "$candidate" ]; then
        DB_INI="$candidate"
        break
    fi
done

if [ -z "${DB_INI:-}" ]; then
    echo "db.ini not found — checked ConfigDev/ and Config/." >&2
    exit 1
fi

# Pull a "key = value" pair out of the ini, stripping quotes/whitespace.
ini_get() {
    sed -nE 's/^[[:space:]]*'"$1"'[[:space:]]*=[[:space:]]*"?([^"]*)"?[[:space:]]*$/\1/p' "$DB_INI" | head -n1
}

DB_HOST="$(ini_get dbhost)"
DB_PORT="$(ini_get dbport)"
DB_NAME="$(ini_get dbname)"
DB_USER="$(ini_get user)"
DB_PASS="$(ini_get password)"
DB_PREFIX="$(ini_get prefix)"

if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PREFIX" ]; then
    echo "db.ini missing required keys (dbname / user / prefix): $DB_INI" >&2
    exit 1
fi

mkdir -p "$(dirname "$DUMP_FILE")"

mysqldump \
    -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" \
    -u "$DB_USER" -p"$DB_PASS" \
    --add-drop-table \
    --ignore-table="${DB_NAME}.${DB_PREFIX}_session" \
    --ignore-table="${DB_NAME}.${DB_PREFIX}_session_data" \
    "$DB_NAME" > "$DUMP_FILE"

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "Dump saved: $DUMP_FILE ($SIZE)"
