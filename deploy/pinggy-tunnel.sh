#!/bin/bash
# Tunnel publik Pinggy untuk QM Cuti Web App.
# Menulis URL publik ke deploy/tunnel-url.txt setiap kali tunnel tersambung.
set -u
cd /home/hatch/workspace/qm-cuti-web
URL_FILE="deploy/tunnel-url.txt"
: > "$URL_FILE"
while true; do
  echo "[tunnel] menghubungkan..."
  timeout 3300 ssh -p 443 -R0:localhost:3000 \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o ServerAliveInterval=20 -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -o ProxyCommand="nc -X connect -x hatch-egress-proxy:3128 %h %p" \
    a.pinggy.io 2>&1 | while IFS= read -r line; do
      echo "$line"
      url=$(echo "$line" | grep -oE "https://[a-z0-9.-]+\.(pinggy-free\.link|free\.pinggy\.net)" | head -1)
      if [ -n "$url" ]; then
        echo "$url" > "$URL_FILE"
        echo "[tunnel] URL publik: $url"
      fi
    done
  echo "[tunnel] terputus, mencoba lagi dalam 5 detik..."
  sleep 5
done
