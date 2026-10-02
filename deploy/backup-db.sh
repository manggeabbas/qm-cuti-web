#!/bin/bash
# Backup database qm_cuti ke direktori persisten (tahan VM replace).
# Dijalankan tiap jam via systemd timer qm-cuti-backup.timer.
set -u
APP_DIR="/home/hatch/workspace/qm-cuti-web"
BACKUP_DIR="$APP_DIR/backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Ambil DATABASE_URL dari .env tanpa menampilkannya
DB_URL=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | cut -d= -f2- | tr -d '"')
if [ -z "$DB_URL" ]; then
  echo "[backup] DATABASE_URL tidak ditemukan, batal."
  exit 1
fi

TS=$(date +%Y%m%d-%H%M)
OUT="$BACKUP_DIR/qm_cuti-$TS.dump"
if pg_dump "$DB_URL" -Fc -f "$OUT" 2>/dev/null; then
  chmod 600 "$OUT"
  ln -sf "$(basename "$OUT")" "$BACKUP_DIR/latest.dump"
  # Simpan 48 backup terakhir (~2 hari)
  ls -t "$BACKUP_DIR"/qm_cuti-*.dump 2>/dev/null | tail -n +49 | xargs -r rm -f
  echo "[backup] OK: $(basename "$OUT")"
else
  echo "[backup] GAGAL"
  rm -f "$OUT"
  exit 1
fi
