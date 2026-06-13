# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS deps

WORKDIR /app

ENV ASTRO_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ENABLE_ANALYTICS
ARG NEXT_PUBLIC_ENABLE_ERROR_TRACKING
ARG NEXT_PUBLIC_TTS_VOICE
ARG NEXT_PUBLIC_TTS_SPEED
ARG PUBLIC_GA_ID
ARG PUBLIC_SITE_URL
ARG PUBLIC_ENABLE_ANALYTICS
ARG PUBLIC_ENABLE_ERROR_TRACKING
ARG PUBLIC_TTS_VOICE
ARG PUBLIC_TTS_SPEED
ARG BROWSERSLIST_QUERY=""

ENV NEXT_PUBLIC_GA_ID=${NEXT_PUBLIC_GA_ID} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_ENABLE_ANALYTICS=${NEXT_PUBLIC_ENABLE_ANALYTICS} \
    NEXT_PUBLIC_ENABLE_ERROR_TRACKING=${NEXT_PUBLIC_ENABLE_ERROR_TRACKING} \
    NEXT_PUBLIC_TTS_VOICE=${NEXT_PUBLIC_TTS_VOICE} \
    NEXT_PUBLIC_TTS_SPEED=${NEXT_PUBLIC_TTS_SPEED} \
    PUBLIC_GA_ID=${PUBLIC_GA_ID} \
    PUBLIC_SITE_URL=${PUBLIC_SITE_URL} \
    PUBLIC_ENABLE_ANALYTICS=${PUBLIC_ENABLE_ANALYTICS} \
    PUBLIC_ENABLE_ERROR_TRACKING=${PUBLIC_ENABLE_ERROR_TRACKING} \
    PUBLIC_TTS_VOICE=${PUBLIC_TTS_VOICE} \
    PUBLIC_TTS_SPEED=${PUBLIC_TTS_SPEED} \
    NODE_OPTIONS=--max-old-space-size=4096

COPY . .
RUN if [ -n "${BROWSERSLIST_QUERY}" ]; then \
      export BROWSERSLIST="${BROWSERSLIST_QUERY}"; \
    fi; \
    npm run check && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    ASTRO_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOST=0.0.0.0 \
    HOSTNAME=0.0.0.0 \
    LOCAL_TTS_PYTHON=/opt/tts-venv/bin/python \
    LOCAL_TTS_CACHE_DIR=/var/cache/portfolio/kitten-tts \
    PYTHONUNBUFFERED=1 \
    HF_HUB_DISABLE_SYMLINKS_WARNING=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      espeak-ng \
      libespeak-ng1 \
      python3 \
      python3-venv \
      tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-tts.txt /tmp/requirements-tts.txt
RUN python3 -m venv /opt/tts-venv \
    && /opt/tts-venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel \
    && /opt/tts-venv/bin/pip install --no-cache-dir -r /tmp/requirements-tts.txt \
    && rm -f /tmp/requirements-tts.txt

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/scripts/kitten-tts-worker.py ./scripts/kitten-tts-worker.py
COPY --from=builder --chown=node:node /app/scripts/deploy.sh ./.deploy/deploy.sh
COPY --from=builder --chown=node:node /app/scripts/machine.conf.example ./.deploy/machine.conf.example
COPY --from=builder --chown=node:node /app/scripts/portfolio.conf.example ./.deploy/portfolio.conf.example
COPY --from=builder --chown=node:node /app/nginx-cloudflare.conf ./.deploy/nginx-cloudflare.conf

RUN chmod +x /app/.deploy/deploy.sh \
    && mkdir -p /var/cache/portfolio/kitten-tts \
    && chown -R node:node /var/cache/portfolio /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/entry.mjs"]