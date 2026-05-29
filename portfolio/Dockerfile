# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS deps

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    SKIP_EMBEDDINGS_BUILD=1

COPY package.json package-lock.json ./
COPY scripts/install-git-hooks.mjs ./scripts/install-git-hooks.mjs
RUN npm ci

FROM deps AS builder

ARG NEXT_BUILD_ID=local-build
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ENABLE_ANALYTICS
ARG NEXT_PUBLIC_ENABLE_ERROR_TRACKING
ARG NEXT_PUBLIC_TTS_VOICE
ARG NEXT_PUBLIC_TTS_SPEED
ARG NEXT_BUILD_FLAGS=""
ARG BROWSERSLIST_QUERY=""

ENV NEXT_BUILD_ID=${NEXT_BUILD_ID} \
    NEXT_PUBLIC_GA_ID=${NEXT_PUBLIC_GA_ID} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_ENABLE_ANALYTICS=${NEXT_PUBLIC_ENABLE_ANALYTICS} \
    NEXT_PUBLIC_ENABLE_ERROR_TRACKING=${NEXT_PUBLIC_ENABLE_ERROR_TRACKING} \
    NEXT_PUBLIC_TTS_VOICE=${NEXT_PUBLIC_TTS_VOICE} \
    NEXT_PUBLIC_TTS_SPEED=${NEXT_PUBLIC_TTS_SPEED} \
    NODE_OPTIONS=--max-old-space-size=4096

COPY . .
RUN if [ -n "${NEXT_BUILD_FLAGS}" ]; then \
            BROWSERSLIST="${BROWSERSLIST_QUERY}" npm run build -- ${NEXT_BUILD_FLAGS}; \
        else \
            npm run build; \
        fi

RUN mkdir -p /app/standalone/.next /app/standalone/.deploy \
    && cp -r .next/standalone/. /app/standalone/ \
    && rm -rf /app/standalone/.next/static \
    && cp -r .next/static /app/standalone/.next/ \
    && cp -r public /app/standalone/public \
    && cp scripts/deploy.sh /app/standalone/.deploy/deploy.sh \
    && cp scripts/machine.conf.example /app/standalone/.deploy/machine.conf.example \
    && cp scripts/portfolio.conf.example /app/standalone/.deploy/portfolio.conf.example \
    && cp nginx-cloudflare.conf /app/standalone/.deploy/nginx-cloudflare.conf \
    && chmod +x /app/standalone/.deploy/deploy.sh \
    && printf '{"buildId":"%s"}\n' "${NEXT_BUILD_ID}" > /app/standalone/.deploy/meta.json

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
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

COPY --from=builder --chown=node:node /app/standalone ./

RUN mkdir -p /var/cache/portfolio/kitten-tts \
    && chown -R node:node /var/cache/portfolio

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]