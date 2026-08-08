# DNS Ops Collector Worker Dockerfile
# Node.js runtime for DNS collection and probes
#
# BUILD FROM REPO ROOT:
#   docker build -f apps/collector/Dockerfile -t dns-ops-collector .
#
# OR from apps/collector:
#   docker build -f Dockerfile -t dns-ops-collector ../..

# =============================================================================
# Stage 1: Build
# =============================================================================
FROM oven/bun:1.3.11-slim AS builder

# Install DNS utilities needed for build-time tests (optional)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace configuration files first (for cache efficiency)
COPY package.json ./
COPY bun.lock ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copy all workspace package.json files
COPY apps/collector/package.json ./apps/collector/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/logging/package.json ./packages/logging/
COPY packages/parsing/package.json ./packages/parsing/
COPY packages/rules/package.json ./packages/rules/

# Install dependencies (bun workspace resolution)
RUN bun install --frozen-lockfile

# Copy source code for workspace packages (dependencies first)
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY packages/logging/ ./packages/logging/
COPY packages/parsing/ ./packages/parsing/
COPY packages/rules/ ./packages/rules/

# Copy collector source
COPY apps/collector/ ./apps/collector/

# Build all packages (turbo handles dependency order)
RUN bun run build --filter=@dns-ops/collector...

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:20-slim AS production

# Install runtime dependencies (curl for healthcheck, dnsutils for debugging)
RUN apt-get update && apt-get install -y \
    curl \
    dnsutils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /app/apps/collector/dist ./dist
COPY --from=builder /app/apps/collector/package.json ./

# Copy workspace package builds (needed for runtime imports)
COPY --from=builder /app/packages/contracts/dist ./node_modules/@dns-ops/contracts/dist
COPY --from=builder /app/packages/contracts/package.json ./node_modules/@dns-ops/contracts/
COPY --from=builder /app/packages/db/dist ./node_modules/@dns-ops/db/dist
COPY --from=builder /app/packages/db/package.json ./node_modules/@dns-ops/db/
COPY --from=builder /app/packages/logging/dist ./node_modules/@dns-ops/logging/dist
COPY --from=builder /app/packages/logging/package.json ./node_modules/@dns-ops/logging/
COPY --from=builder /app/packages/parsing/dist ./node_modules/@dns-ops/parsing/dist
COPY --from=builder /app/packages/parsing/package.json ./node_modules/@dns-ops/parsing/
COPY --from=builder /app/packages/rules/dist ./node_modules/@dns-ops/rules/dist
COPY --from=builder /app/packages/rules/package.json ./node_modules/@dns-ops/rules/

# Copy production node_modules (external deps only)
COPY --from=builder /app/node_modules ./node_modules

# Create non-root user for security
RUN groupadd -r collector && useradd -r -g collector collector
RUN chown -R collector:collector /app
USER collector

# Readiness probe — dependency failure must not count as healthy.
# start-period covers worker/queue startup before /readyz is required.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/readyz || exit 1

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/index.js"]
