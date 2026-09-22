# Keep tag in sync with playwright in apps/scraper/package.json (CI enforces via scripts/check-build-version-sync.sh).
FROM mcr.microsoft.com/playwright:v1.63.0-jammy

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY packages/logging ./packages/logging
COPY apps/scraper/package.json ./apps/scraper/

# Install pnpm (pin matches root package.json packageManager — CI enforces)
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
RUN pnpm install --frozen-lockfile || pnpm install

# Copy scraper source
COPY apps/scraper ./apps/scraper

WORKDIR /app
RUN pnpm --filter @mtb-aggregator/logging run build

WORKDIR /app/apps/scraper
RUN pnpm run build

EXPOSE 3000
CMD ["pnpm", "run", "start"]
