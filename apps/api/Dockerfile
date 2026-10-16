FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api apps/api
COPY packages packages
RUN npm ci --workspace @aidev/api --include-workspace-root
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["npx", "tsx", "src/main.ts"]
