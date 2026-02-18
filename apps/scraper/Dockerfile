FROM mcr.microsoft.com/playwright:v1.41.0-jammy

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/scraper/package.json ./apps/scraper/

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile || pnpm install

# Copy scraper source
COPY apps/scraper ./apps/scraper

WORKDIR /app/apps/scraper
RUN pnpm run build

EXPOSE 3000
CMD ["pnpm", "run", "start"]
