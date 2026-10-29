#!/usr/bin/env bash
# Install or update the local LLM stack (llama-server text + omni servers, llm-gateway, nginx site) on an Ubuntu VM.
# Usage: sudo LLAMA_BUILD=/path/to/llama.cpp/build MODEL_FILE=/path/to/model.gguf \
#   [OMNI_MODEL_FILE=/path/to/omni.gguf OMNI_MMPROJ_FILE=/path/to/mmproj.gguf] ./install.sh
set -euo pipefail

: "${LLAMA_BUILD:?set LLAMA_BUILD to a llama.cpp build directory containing bin/llama-server}"
: "${MODEL_FILE:?set MODEL_FILE to the GGUF to serve}"
if [ -n "${OMNI_MODEL_FILE:-}" ]; then
  : "${OMNI_MMPROJ_FILE:?set OMNI_MMPROJ_FILE together with OMNI_MODEL_FILE}"
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_NAME="$(basename "$MODEL_FILE")"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

id llm >/dev/null 2>&1 || useradd --system --home-dir /opt/llm --shell /usr/sbin/nologin llm
install -d -o root -g root -m 0755 /opt/llm /opt/llm/bin /opt/llm/gateway
install -d -o root -g llm -m 0750 /opt/llm/models /etc/llm

# Binaries and their shared libraries live together so LD_LIBRARY_PATH stays simple.
install -m 0755 "$LLAMA_BUILD/bin/llama-server" /opt/llm/bin/llama-server
find "$LLAMA_BUILD/bin" -maxdepth 1 -name '*.so*' -exec cp -a {} /opt/llm/bin/ \;
install -o root -g llm -m 0440 "$MODEL_FILE" "/opt/llm/models/$MODEL_NAME"
install -m 0644 "$SCRIPT_DIR/llm-gateway.mjs" /opt/llm/gateway/llm-gateway.mjs

if [ ! -s /etc/llm/api-key ]; then
  echo "Create /etc/llm/api-key (root:llm 0640) with the bearer key before starting." >&2
  exit 1
fi
chown root:llm /etc/llm/api-key
chmod 0640 /etc/llm/api-key

[ -f /etc/llm/llm-server.env ] || install -o root -g llm -m 0640 "$SCRIPT_DIR/llm-server.env" /etc/llm/llm-server.env
# Single-upstream gateway configs predate model routing; replace them so the omni server is reachable.
grep -qs '^UPSTREAMS=' /etc/llm/llm-gateway.env || install -o root -g llm -m 0640 "$SCRIPT_DIR/llm-gateway.env" /etc/llm/llm-gateway.env
sed -i "s|^LLM_MODEL=.*|LLM_MODEL=/opt/llm/models/$MODEL_NAME|" /etc/llm/llm-server.env

install -m 0644 "$SCRIPT_DIR/llm-server.service" /etc/systemd/system/llm-server.service
install -m 0644 "$SCRIPT_DIR/llm-gateway.service" /etc/systemd/system/llm-gateway.service
services=(llm-server.service)

if [ -n "${OMNI_MODEL_FILE:-}" ]; then
  OMNI_MODEL_NAME="$(basename "$OMNI_MODEL_FILE")"
  OMNI_MMPROJ_NAME="$(basename "$OMNI_MMPROJ_FILE")"
  install -o root -g llm -m 0440 "$OMNI_MODEL_FILE" "/opt/llm/models/$OMNI_MODEL_NAME"
  install -o root -g llm -m 0440 "$OMNI_MMPROJ_FILE" "/opt/llm/models/$OMNI_MMPROJ_NAME"
  [ -f /etc/llm/llm-omni.env ] || install -o root -g llm -m 0640 "$SCRIPT_DIR/llm-omni.env" /etc/llm/llm-omni.env
  sed -i "s|^OMNI_MODEL=.*|OMNI_MODEL=/opt/llm/models/$OMNI_MODEL_NAME|; s|^OMNI_MMPROJ=.*|OMNI_MMPROJ=/opt/llm/models/$OMNI_MMPROJ_NAME|" /etc/llm/llm-omni.env
  install -m 0644 "$SCRIPT_DIR/llm-omni.service" /etc/systemd/system/llm-omni.service
  services+=(llm-omni.service)
fi

systemctl daemon-reload
systemctl enable "${services[@]}" llm-gateway.service
systemctl restart "${services[@]}"
systemctl restart llm-gateway.service

install -m 0644 "$SCRIPT_DIR/nginx-llm.conf" /etc/nginx/sites-available/llm.whoisdhruv.com.conf
ln -sf /etc/nginx/sites-available/llm.whoisdhruv.com.conf /etc/nginx/sites-enabled/llm.whoisdhruv.com.conf
nginx -t
systemctl reload nginx

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8081/health >/dev/null; then
    echo "llm-gateway healthy"
    exit 0
  fi
  sleep 2
done
echo "llm-gateway did not become healthy" >&2
exit 1
