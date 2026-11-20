#!/usr/bin/env bash
# Nightly encrypted backup for EpiFive Website Privacy Kit.
#
#   WPK_ENV=/etc/privacykit.env AGE_RECIPIENT=age1... scripts/backup.sh
#
# What it does:
#   1. dumps the database (MySQL: mysqldump --single-transaction with triggers; SQLite: VACUUM INTO)
#      and records the row count of every table in counts.tsv (the restore drill compares them),
#   2. adds STORAGE_DIR/rights (encrypted request attachments) and config.json,
#   3. encrypts the archive with `age` for AGE_RECIPIENT (public key; the private key is NOT on the server),
#   4. keeps 35 daily and 12 monthly copies in BACKUP_DIR (default /var/backups/privacykit),
#   5. uploads to S3-compatible storage (DigitalOcean Spaces BLR1 / S3 ap-south-1) when BACKUP_S3_URI is set
#      (needs the aws CLI; set BACKUP_S3_ENDPOINT for Spaces, e.g. https://blr1.digitaloceanspaces.com).
#
# Docker Compose: set BACKUP_MYSQL_CONTAINER (e.g. privacykit-mysql-1) to dump through the mysql
# container, and BACKUP_STORAGE_DIR to the host folder mounted as /app/storage.
#
# THE MASTER KEY IS NOT IN THE BACKUP, ON PURPOSE. Without WPK_MASTER_KEY the encrypted emails,
# phone numbers, request details and attachments in it can't be read and withdraw links can't be
# checked. Keep the key (and the age private key) in your password manager, separately from the
# backups. Restore: decrypt with `age -d -i <identity>` and load the dump (README, "Backups").
#
# Crontab (02:30 IST every night): 30 21 * * * /path/to/website-privacy-kit/scripts/backup.sh
set -euo pipefail
umask 077

if [ -n "${WPK_ENV:-}" ] && [ -f "$WPK_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$WPK_ENV"
  set +a
fi

: "${AGE_RECIPIENT:?Set AGE_RECIPIENT to an age public key (age-keygen -o key.txt on another machine).}"
command -v age >/dev/null || { echo "Install age (https://age-encryption.org) first." >&2; exit 1; }

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# BACKUP_STORAGE_DIR wins over the env file.
STORAGE_DIR="${BACKUP_STORAGE_DIR:-${STORAGE_DIR:-$APP_DIR/storage}}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/privacykit}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/monthly"

DRIVER="${DB_DRIVER:-}"
if [ -n "${DATABASE_URL:-}" ] || [ -n "${BACKUP_MYSQL_CONTAINER:-}" ]; then DRIVER="mysql"; fi
if [ -z "$DRIVER" ] && [ -f "$STORAGE_DIR/config.json" ]; then
  DRIVER="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).db.driver)' "$STORAGE_DIR/config.json")"
fi

if [ "$DRIVER" = "mysql" ]; then
  if [ -n "${BACKUP_MYSQL_CONTAINER:-}" ]; then
    # Docker: run the clients inside the mysql container as the schema owner (the dump then includes
    # the triggers). The password reaches docker exec through the environment, never the command line.
    DB_NAME="${DB_NAME:-privacykit}"
    DUMP_USER="${DB_MIGRATE_USER:-wpk_owner}"
    export MYSQL_PWD="${DB_MIGRATE_PASSWORD:-${WPK_DB_OWNER_PASSWORD:-}}"
    mysql_cmd() { docker exec -i -e MYSQL_PWD "$BACKUP_MYSQL_CONTAINER" mysql -u"$DUMP_USER" "$@"; }
    mysqldump_cmd() { docker exec -i -e MYSQL_PWD "$BACKUP_MYSQL_CONTAINER" mysqldump -u"$DUMP_USER" "$@"; }
  else
    # Connection details go into a 0600 options file, never on the command line.
    if [ -n "${DATABASE_URL:-}" ]; then
      node -e 'const u=new URL(process.env.DATABASE_URL);const d=decodeURIComponent;process.stdout.write(`[client]
host=${u.hostname}
port=${u.port||3306}
user=${d(u.username)}
password=${JSON.stringify(d(u.password))}
`)' > "$WORK/my.cnf"
      DB_NAME="$(node -e 'console.log(decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)))')"
    else
      # Prefer the schema owner so the dump includes the triggers.
      cat > "$WORK/my.cnf" <<CNF
[client]
host=${DB_HOST:-127.0.0.1}
port=${DB_PORT:-3306}
user=${DB_MIGRATE_USER:-${DB_USER:-root}}
password="${DB_MIGRATE_PASSWORD:-${DB_PASSWORD:-}}"
CNF
    fi
    DB_NAME="${DB_NAME:-privacykit}"
    SSL_OPT=()
    if [ "${DB_SSL:-}" = "true" ]; then SSL_OPT=(--ssl-mode=REQUIRED); fi
    mysql_cmd() { mysql --defaults-extra-file="$WORK/my.cnf" "${SSL_OPT[@]}" "$@"; }
    mysqldump_cmd() { mysqldump --defaults-extra-file="$WORK/my.cnf" "${SSL_OPT[@]}" "$@"; }
  fi
  # Row count of every table (taken just before the dump; on a busy server, session and log
  # tables can differ by a few rows from the dump's snapshot).
  TABLES="$(mysql_cmd -N -B -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME")"
  Q=""
  for t in $TABLES; do Q="$Q${Q:+ UNION ALL }SELECT '$t', COUNT(*) FROM \`$t\`"; done
  mysql_cmd -N -B -e "$Q" "$DB_NAME" > "$WORK/counts.tsv"
  mysqldump_cmd --single-transaction --quick --routines --triggers --set-gtid-purged=OFF --no-tablespaces "$DB_NAME" > "$WORK/database.sql"
else
  DB_FILE="${DB_FILE:-database.sqlite}"
  case "$DB_FILE" in /*) SRC="$DB_FILE" ;; *) SRC="$STORAGE_DIR/$DB_FILE" ;; esac
  node -e 'const {DatabaseSync}=require("node:sqlite");new DatabaseSync(process.argv[1]).exec(`VACUUM INTO '"'"'${process.argv[2]}'"'"'`)' "$SRC" "$WORK/database.sqlite"
  node -e 'const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1]);for(const {name} of d.prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE ? ORDER BY name").all("table","sqlite_%"))console.log(name+"\t"+d.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n)' "$WORK/database.sqlite" > "$WORK/counts.tsv"
fi

[ -d "$STORAGE_DIR/rights" ] && cp -a "$STORAGE_DIR/rights" "$WORK/rights"
[ -f "$STORAGE_DIR/config.json" ] && cp "$STORAGE_DIR/config.json" "$WORK/config.json"
# Never back up a master key file next to the data.
rm -f "$WORK/master.key" "$WORK/my.cnf"
cat > "$WORK/README.txt" <<TXT
EpiFive Website Privacy Kit backup $STAMP ($DRIVER)
This archive does NOT contain WPK_MASTER_KEY. Restore needs that key from your password manager.
Restore: age -d -i <age identity file> <this file> | tar -x
TXT

OUT="$BACKUP_DIR/daily/privacykit-$STAMP.tar.gz.age"
tar -C "$WORK" -czf - . | age -r "$AGE_RECIPIENT" -o "$OUT"
echo "[backup] wrote $OUT ($(du -h "$OUT" | cut -f1); $(wc -l < "$WORK/counts.tsv") tables, $(awk -F'\t' '{s+=$2} END {print s+0}' "$WORK/counts.tsv") rows)"

# First backup of a month is also kept as the monthly copy.
MONTH="$(date -u +%Y%m)"
if ! ls "$BACKUP_DIR/monthly/privacykit-$MONTH"* >/dev/null 2>&1; then cp "$OUT" "$BACKUP_DIR/monthly/"; fi
ls -1t "$BACKUP_DIR/daily"/privacykit-*.age 2>/dev/null | tail -n +36 | xargs -r rm -f
ls -1t "$BACKUP_DIR/monthly"/privacykit-*.age 2>/dev/null | tail -n +13 | xargs -r rm -f

if [ -n "${BACKUP_S3_URI:-}" ]; then
  aws ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"} s3 sync "$BACKUP_DIR/" "$BACKUP_S3_URI" --delete --only-show-errors
  echo "[backup] synced to $BACKUP_S3_URI"
fi

echo "[backup] REMINDER: WPK_MASTER_KEY is not in this backup. Check that a copy is in your password manager."
