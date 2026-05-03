# DNS Ops Collector - Railway Deployment
# Multi-stage build with Bun for compilation, Node for runtime

# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM oven/bun:1.3.13-slim AS builder

WORKDIR /app

# Copy workspace config
COPY package.json bun.lock turbo.json tsconfig.base.json ./

# Copy all package.json files for workspace resolution
COPY apps/collector/package.json ./apps/collector/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/logging/package.json ./packages/logging/
COPY packages/parsing/package.json ./packages/parsing/
COPY packages/rules/package.json ./packages/rules/

# Install dependencies
RUN bun install

# Copy source code
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY packages/logging/ ./packages/logging/
COPY packages/parsing/ ./packages/parsing/
COPY packages/rules/ ./packages/rules/
COPY apps/collector/ ./apps/collector/

# Build
RUN bun run build --filter=@dns-ops/collector...

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:20-slim AS production

RUN apt-get update && apt-get install -y curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/apps/collector/dist ./apps/collector/dist
COPY --from=builder /app/packages/*/dist ./node_modules/@dns-ops/
COPY --from=builder /app/packages/*/package.json ./node_modules/@dns-ops/
COPY --from=builder /app/node_modules ./node_modules

# Runtime environment variables (provided by Railway)
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "apps/collector/dist/index.js"]
