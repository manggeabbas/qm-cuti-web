#!/bin/bash
# Tunnel publik Pinggy untuk QM Cuti Web App.
# Menulis URL publik ke deploy/tunnel-url.txt setiap kali tunnel tersambung.
set -u
cd /home/hatch/workspace/qm-cuti-web
URL_FILE="deploy/tunnel-url.txt"
: > "$URL_FILE"
update_app_url() {
  local url="$1"
  if grep -q "^APP_URL=\"$url\"$" .env 2>/dev/null; then return 0; fi
  python3 - "$url" <<'EOF'
import re, sys
url = sys.argv[1]
p = '.env'
s = open(p).read()
s = re.sub(r'^APP_URL=".*"$', f'APP_URL="{url}"', s, flags=re.M)
open(p, 'w').write(s)
EOF
  systemctl restart qm-cuti-web 2>/dev/null
  echo "[tunnel] APP_URL diperbarui & qm-cuti-web di-restart"
}
while true; do
  echo "[tunnel] menghubungkan..."
  got_url=""
  timeout 3300 ssh -p 443 -R0:localhost:3000 \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o ConnectTimeout=45 -o ServerAliveInterval=20 -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -o ProxyCommand="nc -X connect -x hatch-egress-proxy:3128 %h %p" \
    a.pinggy.io 2>&1 | while IFS= read -r line; do
      echo "$line"
      url=$(echo "$line" | grep -oE "https://[a-z0-9.-]+\.(pinggy-free\.link|free\.pinggy\.net)" | head -1)
      # Hanya proses URL pertama per koneksi (pinggy mencetak 2 varian domain)
      if [ -n "$url" ] && [ -z "$got_url" ]; then
        got_url="$url"
        echo "$url" > "$URL_FILE"
        echo "[tunnel] URL publik: $url"
        update_app_url "$url"
      fi
    done
  echo "[tunnel] terputus, mencoba lagi dalam 5 detik..."
  sleep 5
done
