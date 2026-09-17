#!/bin/bash
#
# Restore the database from a dump.
#
# Usage:  bash scripts/db-restore.sh [filename]
#
# Default input: dumps/seed.sql
#
# Credentials are read from Apps/IRabi/WorkDir/ConfigDev/db.ini
# (fallback: Config/db.ini) — same source the PHP app uses.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DUMP_DIR="$SCRIPT_DIR/../dumps"
DUMP_FILE="${1:-$DUMP_DIR/seed.sql}"

if [ ! -f "$DUMP_FILE" ]; then
    echo "Dump file not found: $DUMP_FILE" >&2
    echo "Run 'bash scripts/db-dump.sh' first." >&2
    exit 1
fi

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

ini_get() {
    sed -nE 's/^[[:space:]]*'"$1"'[[:space:]]*=[[:space:]]*"?([^"]*)"?[[:space:]]*$/\1/p' "$DB_INI" | head -n1
}

DB_HOST="$(ini_get dbhost)"
DB_PORT="$(ini_get dbport)"
DB_NAME="$(ini_get dbname)"
DB_USER="$(ini_get user)"
DB_PASS="$(ini_get password)"

if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ]; then
    echo "db.ini missing required keys (dbname / user): $DB_INI" >&2
    exit 1
fi

echo "Restoring from: $DUMP_FILE"
echo "Target: ${DB_USER}@${DB_HOST:-127.0.0.1}:${DB_PORT:-3306}/${DB_NAME}"
echo "This will DROP and recreate all tables (except sessions)."
read -p "Continue? [y/N] " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    mysql -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" \
        -u "$DB_USER" -p"$DB_PASS" \
        "$DB_NAME" < "$DUMP_FILE"
    echo "Database restored successfully."
else
    echo "Cancelled."
fi
