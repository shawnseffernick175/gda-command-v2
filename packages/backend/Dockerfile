# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# Install all workspace deps (including devDependencies for build)
RUN npm ci --workspace=@gda/shared --workspace=@gda/backend --include-workspace-root

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/

# Build shared types first, then backend with project references
RUN npm run build --workspace=@gda/shared
RUN npm run build --workspace=@gda/backend

# Generate migration manifest (F-019: hash verification at runtime)
RUN npx tsx packages/backend/src/db/generate-migration-manifest.ts

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# Install production deps only
RUN npm ci --workspace=@gda/shared --workspace=@gda/backend --include-workspace-root --omit=dev

# Copy built artifacts (includes compiled server, routes, db scripts, data)
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/backend/dist/ packages/backend/dist/

# Copy SQL migration files + manifest (read at runtime by migrate.js)
COPY packages/backend/src/db/migrations/ packages/backend/src/db/migrations/
COPY --from=builder /app/packages/backend/src/db/migrations/migration-manifest.json packages/backend/src/db/migrations/migration-manifest.json

# Copy entrypoint
COPY packages/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# pg_dump for in-app backup API; p7zip for .7z archive extraction
# tesseract-ocr + eng data for image/scanned-PDF OCR; poppler-utils for pdftoppm
RUN apk add --no-cache postgresql16-client p7zip \
    tesseract-ocr tesseract-ocr-data-eng \
    poppler-utils

# Backup and upload directories
RUN mkdir -p /var/backups/gda/daily /var/backups/gda/weekly /var/uploads/gda

# Non-root user
RUN addgroup -g 1001 -S gda && adduser -u 1001 -S gda -G gda
RUN chown -R gda:gda /var/backups/gda /var/uploads/gda
USER gda

# Bake deploy commit SHA into image (set via --build-arg at docker build time)
ARG DEPLOY_COMMIT_SHA=unknown
ENV DEPLOY_COMMIT_SHA=$DEPLOY_COMMIT_SHA

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
