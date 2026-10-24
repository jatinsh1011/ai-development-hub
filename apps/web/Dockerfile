FROM node:22-slim
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Canonical URLs, Open Graph, robots.txt and the sitemap are prerendered with this.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web apps/web
COPY packages packages
RUN npm ci --workspace @aidev/web --include-workspace-root && npm run build -w @aidev/web
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
