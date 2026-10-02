#!/bin/bash
# Worker notifikasi QM Cuti — dipanggil cron tiap menit.
set -e
cd /home/hatch/workspace/qm-cuti-web
if [ -f .env ]; then set -a; source .env; set +a; fi
exec /usr/bin/node node_modules/.bin/tsx scripts/notify-worker.ts
