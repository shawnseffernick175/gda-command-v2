# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY apps/backend-v3/package.json apps/backend-v3/

# Install all workspace deps (including devDependencies for build)
RUN npm ci --workspace=@gda/backend-v3 --include-workspace-root

# Copy source
COPY apps/backend-v3/ apps/backend-v3/

# Build
RUN npm run build --workspace=@gda/backend-v3

# ---- Runtime Stage ----
FROM node:20-alpine

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY apps/backend-v3/package.json apps/backend-v3/

# Install production deps only
RUN npm ci --workspace=@gda/backend-v3 --include-workspace-root --omit=dev

# Copy built artifacts
COPY --from=builder /app/apps/backend-v3/dist/ apps/backend-v3/dist/

# Bake deploy commit SHA into image
ARG DEPLOY_COMMIT_SHA=unknown
ENV GIT_SHA=$DEPLOY_COMMIT_SHA

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1

CMD ["node", "apps/backend-v3/dist/server.js"]
