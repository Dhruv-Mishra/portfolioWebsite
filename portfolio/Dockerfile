# syntax=docker/dockerfile:1.7

# Digest-pinned so cached apt/PyTorch layers survive upstream tag moves; Dependabot refreshes it.
FROM --platform=$BUILDPLATFORM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS deps

WORKDIR /app

ARG NPM_VERSION=10.9.8

ENV NEXT_TELEMETRY_DISABLED=1 \
    SKIP_EMBEDDINGS_BUILD=1 \
    ONNXRUNTIME_NODE_INSTALL=skip

COPY package.json package-lock.json ./
COPY scripts/install-git-hooks.mjs ./scripts/install-git-hooks.mjs
RUN --mount=type=cache,target=/root/.npm \
    npm install --global "npm@${NPM_VERSION}" \
    && npm ci --no-audit --no-fund

# Built once on $BUILDPLATFORM for both arches: Next output differs per build (Server Action IDs).
FROM deps AS builder

ARG NEXT_BUILD_ID=local-build
ARG BROWSERSLIST_QUERY=""
# Deploy workflows set 1 only when their deploy jobs also require the same-SHA checks job.
ARG NEXT_EXTERNAL_TYPECHECK=0

ENV NEXT_BUILD_ID=${NEXT_BUILD_ID} \
    NEXT_EXTERNAL_TYPECHECK=${NEXT_EXTERNAL_TYPECHECK} \
    NODE_OPTIONS=--max-old-space-size=4096

COPY . .
RUN if [ -n "${BROWSERSLIST_QUERY}" ]; then \
            export BROWSERSLIST="${BROWSERSLIST_QUERY}"; \
        fi; \
        npm run build

RUN mkdir -p /app/standalone/.next /app/standalone/.deploy \
    && cp -r .next/standalone/. /app/standalone/ \
    && rm -rf /app/standalone/.next/static \
    && cp -r .next/static /app/standalone/.next/ \
    && rm -rf /app/standalone/public \
    && cp -r public /app/standalone/public \
    && find /app/standalone/.next/static -type f -print -quit | grep -q . \
    && test -s /app/standalone/public/resources/aboutPhoto.webp \
    && test -s /app/standalone/public/resources/audioAgent.mp4 \
    && test -s /app/standalone/public/resources/resume.pdf \
    && test ! -e /app/standalone/public/public \
    && cp scripts/deploy.sh /app/standalone/.deploy/deploy.sh \
    && cp scripts/machine.conf.example /app/standalone/.deploy/machine.conf.example \
    && cp scripts/portfolio.conf.example /app/standalone/.deploy/portfolio.conf.example \
    && cp nginx-cloudflare.conf /app/standalone/.deploy/nginx-cloudflare.conf \
    && chmod +x /app/standalone/.deploy/deploy.sh \
    && test -z "$(find /app/standalone -type d -name '.cache' -print -quit)" \
    && test -z "$(find /app/standalone -type f \( -name '*.node' -o -name '*.dll' -o -name '*.so' -o -name '*.dylib' \) -print -quit)" \
    && RELEASE_VERSION="$(node -p "require('./package.json').version")" \
    && printf '{"buildId":"%s","version":"%s"}\n' "${NEXT_BUILD_ID}" "${RELEASE_VERSION}" > /app/standalone/.deploy/meta.json

FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    LOCAL_TTS_PYTHON=/opt/tts-venv/bin/python \
    LOCAL_TTS_CACHE_DIR=/var/cache/portfolio/pocket-tts \
    LOCAL_TTS_REFERENCE_PATH=/app/public/sounds/voice/TTSReference.mp3 \
    LOCAL_TTS_VOICE_STATE_PATH=/var/cache/portfolio/pocket-tts/custom-dhruv.safetensors \
    LOCAL_TTS_INTRA_OP_THREADS=1 \
    LOCAL_TTS_INTER_OP_THREADS=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    HF_HUB_CACHE=/var/cache/portfolio/pocket-tts \
    PYTHONUNBUFFERED=1 \
    HF_HUB_DISABLE_SYMLINKS_WARNING=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
        libsndfile1 \
      python3 \
      python3-venv \
      tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-tts.txt /tmp/requirements-tts.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /opt/tts-venv \
    && /opt/tts-venv/bin/pip install --upgrade pip==26.2.2 \
    && /opt/tts-venv/bin/pip install -r /tmp/requirements-tts.txt \
    && /opt/tts-venv/bin/python -c "import pocket_tts, soundfile, torch" \
    && rm -f /tmp/requirements-tts.txt

COPY --from=builder --chown=node:node /app/standalone ./

RUN mkdir -p /var/cache/portfolio/pocket-tts \
    && chown -R node:node /var/cache/portfolio

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]