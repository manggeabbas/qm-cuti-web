#!/usr/bin/env bash
#
# Setup qm-cuti-web di Ubuntu (proot-distro) dalam Termux Android.
#
# Cara pakai:
#   1. Di Termux (bukan di dalam Ubuntu):
#        pkg update -y && pkg install -y proot-distro
#        proot-distro install ubuntu
#        proot-distro login ubuntu
#   2. Di dalam Ubuntu, jalankan SATU perintah ini:
#        curl -fsSL https://raw.githubusercontent.com/manggeabbas/qm-cuti-web/master/deploy/termux-ubuntu-setup.sh -o /tmp/setup.sh && bash /tmp/setup.sh
#   3. Setelah selesai:  cd ~/qm-cuti-web && npm start
#      lalu buka di browser HP: http://localhost:3000
#
# Catatan: build Next.js di HP bisa belasan menit + menguras baterai.
# Nyalakan "wake lock" di notifikasi Termux agar proses tidak di-kill Android.
#
set -euo pipefail

echo "=== [1/7] Paket dasar ==="
apt update
apt install -y curl git postgresql ca-certificates

echo "=== [2/7] Node.js 22 ==="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi
node --version
npm --version

echo "=== [3/7] PostgreSQL ==="
service postgresql start
su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='qm_cuti'\"" | grep -q 1 \
  || su postgres -c "psql -c \"CREATE USER qm_cuti WITH PASSWORD 'qm_cuti' CREATEDB;\""
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='qm_cuti'\"" | grep -q 1 \
  || su postgres -c "psql -c \"CREATE DATABASE qm_cuti OWNER qm_cuti;\""
echo "PostgreSQL siap."

echo "=== [4/7] Clone repo ==="
if [ ! -d "$HOME/qm-cuti-web" ]; then
  git clone https://github.com/manggeabbas/qm-cuti-web.git "$HOME/qm-cuti-web"
else
  echo "Direktori ~/qm-cuti-web sudah ada, lewati clone."
fi
cd "$HOME/qm-cuti-web"

echo "=== [5/7] npm install (bisa beberapa menit di HP, sabar...) ==="
npm install

echo "=== [6/7] File .env ==="
if [ ! -f .env ]; then
  cat > .env <<'EOF'
DATABASE_URL="postgresql://qm_cuti:qm_cuti@localhost:5432/qm_cuti?schema=public"
APP_URL="http://localhost:3000"
TELEGRAM_BOT_TOKEN=""
WECOM_WEBHOOK_URL=""
PAIRING_SECRET=""
ADMIN_PASSWORD=""
EOF
  chmod 600 .env
  echo ".env dibuat (password DB lokal: qm_cuti — hanya untuk testing di HP)."
else
  echo ".env sudah ada, tidak ditimpa."
fi

echo "=== [7/7] Migrate + seed + build ==="
npx prisma migrate deploy
npx prisma db seed
npm run build

echo ""
echo "================================================================"
echo " SELESAI."
echo ""
echo " Untuk menjalankan aplikasi (setiap kali mau testing):"
echo "   proot-distro login ubuntu"
echo "   cd ~/qm-cuti-web"
echo "   service postgresql start   # bila postgres belum jalan"
echo "   npm start"
echo ""
echo " Lalu buka di browser HP: http://localhost:3000"
echo " Akun demo: admin / admin123   |   wspv1 / cuti123   |   crew1 / cuti123"
echo "================================================================"
