# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY apps/gda-mcp-server/package.json apps/gda-mcp-server/

# Install all workspace deps (including devDependencies for build)
RUN npm ci --workspace=@gda/mcp-server --include-workspace-root

# Copy source
COPY apps/gda-mcp-server/ apps/gda-mcp-server/

# Build
RUN npm run build --workspace=@gda/mcp-server

# ---- Runtime Stage ----
FROM node:20-alpine

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY apps/gda-mcp-server/package.json apps/gda-mcp-server/

# Install production deps only
RUN npm ci --workspace=@gda/mcp-server --include-workspace-root --omit=dev

# Copy built artifacts
COPY --from=builder /app/apps/gda-mcp-server/dist/ apps/gda-mcp-server/dist/

# Bake deploy commit SHA into image
ARG DEPLOY_COMMIT_SHA=unknown
ENV GIT_SHA=$DEPLOY_COMMIT_SHA

EXPOSE 4100

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4100/health || exit 1

CMD ["node", "apps/gda-mcp-server/dist/index.js"]
