# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS node-base
ARG TARGETARCH
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/database/prisma.config.ts ./packages/database/prisma.config.ts
COPY packages/database/prisma ./packages/database/prisma

FROM node-base AS production-dependencies
RUN --mount=type=cache,id=neozebra-pnpm-${TARGETARCH},target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --store-dir=/pnpm/store

FROM node-base AS node-build
COPY apps/web/package.json ./apps/web/package.json
RUN --mount=type=cache,id=neozebra-pnpm-${TARGETARCH},target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY packages/database ./packages/database
COPY apps/server ./apps/server
COPY apps/web ./apps/web
RUN pnpm --filter @neozebra/database build \
    && pnpm --filter @neozebra/server build \
    && pnpm --filter @neozebra/web build

FROM --platform=$BUILDPLATFORM golang:1.26.5-alpine AS vault-build
ARG TARGETOS TARGETARCH
WORKDIR /build
COPY packages/assets/vault/go.mod packages/assets/vault/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY packages/assets/vault ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/vault ./cmd/vault

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl nginx tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /tmp/nginx/client_body /tmp/nginx/proxy \
    && chown -R node:node /tmp/nginx
ENV NODE_ENV=production HOST=127.0.0.1 PORT=3000 \
    VAULT_API_TARGET=http://127.0.0.1:3001 STORAGE_ADDRESS=0.0.0.0:3001
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=production-dependencies /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=node-build /app/apps/server/package.json ./apps/server/package.json
COPY --from=node-build /app/apps/server/dist ./apps/server/dist
COPY --from=node-build /app/packages/database/package.json ./packages/database/package.json
COPY --from=node-build /app/packages/database/dist ./packages/database/dist
COPY packages/database/prisma.config.ts ./packages/database/prisma.config.ts
COPY packages/database/prisma ./packages/database/prisma
COPY --from=node-build /app/apps/web/dist /usr/share/nginx/html
COPY --from=vault-build /out/vault /usr/local/bin/vault
COPY deploy/production/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=755 deploy/production/entrypoint.sh /usr/local/bin/neozebra
LABEL org.opencontainers.image.source="https://github.com/wzh-devin/neozebra"
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=6s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8080/api/assets/vault/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/neozebra"]
CMD ["serve"]
