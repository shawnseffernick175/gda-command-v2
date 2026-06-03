# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Accept API URL as build arg — supports both legacy VITE_V3_API_URL and new NEXT_PUBLIC_API_URL
ARG VITE_V3_API_URL=https://gda-v3.csr-llc.tech
ARG NEXT_PUBLIC_API_URL
# If NEXT_PUBLIC_API_URL is not set explicitly, fall back to VITE_V3_API_URL
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_URL:-$VITE_V3_API_URL}

# Copy workspace root files
COPY package.json package-lock.json ./
COPY packages/frontend-v3/package.json packages/frontend-v3/

# Install all workspace deps (including devDependencies for build)
RUN npm ci --workspace=@gda/frontend-v3 --include-workspace-root

# Copy source
COPY packages/frontend-v3/ packages/frontend-v3/

# Build (Next.js static export → out/)
RUN npm run build --workspace=@gda/frontend-v3

# ---- Production Stage ----
FROM nginx:1.27-alpine AS production

# Copy built assets (Next.js static export outputs to out/)
COPY --from=builder /app/packages/frontend-v3/out/ /usr/share/nginx/html/

# Custom nginx config for SPA routing
COPY packages/frontend-v3/nginx.conf /etc/nginx/conf.d/default.conf

# Non-root user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
