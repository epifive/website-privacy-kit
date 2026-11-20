# syntax=docker/dockerfile:1
# EpiFive Website Privacy Kit (Free edition) production image.
#
#   npm run setup                  # once: writes .env.local with WPK_MASTER_KEY and job secrets
#   docker compose up -d --build   # app on http://localhost:3000, SQLite in the "storage" volume
#
# The image holds no secrets: WPK_MASTER_KEY comes from the environment (.env.local via docker-compose.yml).
# Building needs about 2 GB of free memory.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Heap for `next build` (MB). 2048 fits a 4 GB build machine; raise it on bigger ones.
ARG BUILD_HEAP=2048
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=${BUILD_HEAP}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && rm -rf .next/cache && npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOST=0.0.0.0 STORAGE_DIR=/app/storage
# tini forwards SIGTERM so in-flight requests finish on `docker compose stop`. Fixed uid/gid 10001 so a
# host folder mounted as /app/storage can be chowned to it.
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 privacykit && useradd --system --uid 10001 --gid privacykit --home-dir /app --shell /usr/sbin/nologin privacykit
COPY --from=build --chown=privacykit:privacykit /app/.next ./.next
COPY --from=build --chown=privacykit:privacykit /app/node_modules ./node_modules
COPY --from=build --chown=privacykit:privacykit /app/public ./public
# Guides are read at request time; the Hindi pack and the key/check scripts are used at runtime.
COPY --from=build --chown=privacykit:privacykit /app/content ./content
COPY --from=build --chown=privacykit:privacykit /app/languages ./languages
COPY --from=build --chown=privacykit:privacykit /app/scripts ./scripts
COPY --from=build --chown=privacykit:privacykit /app/src/core/consent/chain.ts ./src/core/consent/chain.ts
COPY --from=build --chown=privacykit:privacykit /app/package.json /app/server.js /app/next.config.ts ./
RUN mkdir -p storage && chown privacykit:privacykit storage
USER privacykit
VOLUME ["/app/storage"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
