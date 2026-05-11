# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/

# Install all workspace deps (including devDependencies for build)
RUN npm ci --workspace=@gda/shared --workspace=@gda/frontend --include-workspace-root

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/

# Build shared types first, then frontend
RUN npm run build --workspace=@gda/shared
RUN npm run build --workspace=@gda/frontend

# ---- Production Stage ----
FROM nginx:1.27-alpine AS production

# Copy built assets
COPY --from=builder /app/packages/frontend/dist/ /usr/share/nginx/html/

# Custom nginx config for SPA routing + API proxy
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Non-root user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
