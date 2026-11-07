#!/usr/bin/env bash
# Install or update the local LLM stack (llama-server text + omni servers, llm-gateway, nginx site) on an Ubuntu VM.
# Usage: sudo LLAMA_BUILD=/path/to/llama.cpp/build [MODEL_FILES="/path/a.gguf /path/b.gguf"] \
#   [OMNI_MODEL_FILE=/path/to/omni.gguf OMNI_MMPROJ_FILE=/path/to/mmproj.gguf] ./install.sh
# Each llm-server-<name>.env here runs as llm-server@<name> and names its model under /opt/llm/models;
# MODEL_FILES copies GGUFs there.
# Build (Neoverse-N1): CC=clang CXX=clang++ cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=ON -DGGML_OPENMP=OFF
#   then cmake --build build -j4 --target llama-server. Clang prefills ~14% faster than gcc here. Leave KleidiAI off:
#   it doubles prefill by re-quantizing Q6_K/Q8_0 weights per row, which costs 6x the logit drift (KLD 0.025).
set -euo pipefail

: "${LLAMA_BUILD:?set LLAMA_BUILD to a llama.cpp build directory containing bin/llama-server}"
if [ -n "${OMNI_MODEL_FILE:-}" ]; then
  : "${OMNI_MMPROJ_FILE:?set OMNI_MMPROJ_FILE together with OMNI_MODEL_FILE}"
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
for model_file in ${MODEL_FILES:-}; do
  install -o root -g llm -m 0440 "$model_file" "/opt/llm/models/$(basename "$model_file")"
done
install -m 0644 "$SCRIPT_DIR/llm-gateway.mjs" /opt/llm/gateway/llm-gateway.mjs

if [ ! -s /etc/llm/api-key ]; then
  echo "Create /etc/llm/api-key (root:llm 0640) with the bearer key before starting." >&2
  exit 1
fi
chown root:llm /etc/llm/api-key
chmod 0640 /etc/llm/api-key

# Single-upstream gateway configs predate model routing; replace them so the omni server is reachable.
grep -qs '^UPSTREAMS=' /etc/llm/llm-gateway.env || install -o root -g llm -m 0640 "$SCRIPT_DIR/llm-gateway.env" /etc/llm/llm-gateway.env

install -m 0644 "$SCRIPT_DIR/llm-server@.service" /etc/systemd/system/llm-server@.service
install -m 0644 "$SCRIPT_DIR/llm-gateway.service" /etc/systemd/system/llm-gateway.service
services=()
for env_file in "$SCRIPT_DIR"/llm-server-*.env; do
  name="$(basename "$env_file" .env)"
  name="${name#llm-server-}"
  [ -f "/etc/llm/llm-server-$name.env" ] || install -o root -g llm -m 0640 "$env_file" "/etc/llm/llm-server-$name.env"
  model="$(sed -n 's/^LLM_MODEL=//p' "/etc/llm/llm-server-$name.env")"
  if [ ! -f "$model" ]; then
    echo "llm-server@$name: $model is missing; pass it in MODEL_FILES." >&2
    exit 1
  fi
  services+=("llm-server@$name.service")
done
# Older installs ran one llm-server.service; llm-server@qwen takes over its port.
if [ -f /etc/systemd/system/llm-server.service ]; then
  systemctl disable --now llm-server.service
  rm /etc/systemd/system/llm-server.service
fi

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
