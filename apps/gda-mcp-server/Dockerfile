# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files + all workspace package.json manifests
COPY package.json package-lock.json ./
COPY apps/gda-mcp-server/package.json apps/gda-mcp-server/
COPY apps/backend-v3/package.json apps/backend-v3/

# Install all workspace deps (including devDependencies for build)
RUN npm ci --workspace=@gda/mcp-server --include-workspace-root

# Copy source for both packages
COPY apps/backend-v3/ apps/backend-v3/
COPY apps/gda-mcp-server/ apps/gda-mcp-server/

# Build backend-v3 first (mcp-server imports its dist/), then mcp-server
RUN npm run build --workspace=@gda/backend-v3 && npm run build --workspace=@gda/mcp-server

# ---- Runtime Stage ----
FROM node:20-alpine

WORKDIR /app

# Copy workspace root files + all workspace package.json manifests
COPY package.json package-lock.json ./
COPY apps/gda-mcp-server/package.json apps/gda-mcp-server/
COPY apps/backend-v3/package.json apps/backend-v3/

# Install production deps only
RUN npm ci --workspace=@gda/mcp-server --include-workspace-root --omit=dev

# Copy built artifacts for both packages
COPY --from=builder /app/apps/gda-mcp-server/dist/ apps/gda-mcp-server/dist/
COPY --from=builder /app/apps/backend-v3/dist/ apps/backend-v3/dist/

# Bake deploy commit SHA into image
ARG DEPLOY_COMMIT_SHA=unknown
ENV GIT_SHA=$DEPLOY_COMMIT_SHA

EXPOSE 4100

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4100/health || exit 1

CMD ["node", "apps/gda-mcp-server/dist/index.js"]
