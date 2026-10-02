#!/bin/bash
# Recovery QM Cuti Web App setelah VM diganti (systemd units & postgres itu ephemeral).
# Aman dijalankan kapan saja (idempotent): memasang ulang unit files, memastikan
# PostgreSQL + database ada, lalu me-restore backup terbaru atau migrate+seed.
set -u
APP_DIR="/home/hatch/workspace/qm-cuti-web"
DEPLOY="$APP_DIR/deploy"

echo "=== 1. Pasang ulang systemd units ==="
cp "$DEPLOY/qm-cuti-web.service" "$DEPLOY/qm-cuti-tunnel.service" \
   "$DEPLOY/qm-cuti-notify.service" "$DEPLOY/qm-cuti-notify.timer" \
   "$DEPLOY/qm-cuti-backup.service" "$DEPLOY/qm-cuti-backup.timer" \
   /etc/systemd/system/ 2>/dev/null
systemctl daemon-reload
systemctl enable --now qm-cuti-notify.timer qm-cuti-backup.timer 2>/dev/null

echo "=== 2. Pastikan PostgreSQL terinstall & jalan ==="
if ! command -v psql >/dev/null 2>&1; then
  echo "PostgreSQL hilang, menginstall..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql >/dev/null 2>&1 \
    || { echo "Install postgres GAGAL"; exit 1; }
fi
systemctl enable --now postgresql 2>/dev/null || service postgresql start 2>/dev/null

echo "=== 3. Pastikan database qm_cuti ada ==="
export $(grep -v '^#' "$DEPLOY/proxy.env" | xargs)
cd "$APP_DIR"
if ! sudo -u postgres psql -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw qm_cuti; then
  echo "Database qm_cuti hilang, membuat ulang..."
  sudo -u postgres psql -c "CREATE USER qm_cuti WITH PASSWORD 'qm_cuti';" 2>/dev/null
  sudo -u postgres psql -c "CREATE DATABASE qm_cuti OWNER qm_cuti;" 2>/dev/null
  LATEST="$APP_DIR/backups/latest.dump"
  if [ -f "$LATEST" ]; then
    echo "Restore dari backup terbaru..."
    DB_URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"' | sed 's/?[^?]*$//')
    pg_restore -d "$DB_URL" --clean --if-exists "$LATEST" 2>/dev/null \
      && echo "Restore OK" || echo "Restore gagal, lanjut migrate+seed"
  fi
  if ! npx prisma migrate deploy 2>&1 | tail -1; then
    echo "Migrate GAGAL"; exit 1
  fi
  # Seed hanya jika tabel user kosong
  DB_URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"' | sed 's/?[^?]*$//')
  COUNT=$(psql "$DB_URL" -tAc "SELECT COUNT(*) FROM \"User\";" 2>/dev/null || echo 0)
  if [ "$COUNT" = "0" ]; then
    echo "Menjalankan seed data demo..."
    node prisma/seed.ts
  fi
else
  echo "Database qm_cuti sudah ada."
fi

echo "=== 4. Start aplikasi & tunnel ==="
systemctl enable --now qm-cuti-web qm-cuti-tunnel
sleep 3
systemctl is-active qm-cuti-web qm-cuti-tunnel
echo "=== Recovery selesai ==="
