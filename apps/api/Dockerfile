FROM node:22-slim
# git: the importers clone source repositories (and read the pinned commit of mounted checkouts).
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* \
 && git config --system --add safe.directory '*'
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api apps/api
COPY packages packages
RUN npm ci --workspace @aidev/api --include-workspace-root
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["npx", "tsx", "src/main.ts"]
