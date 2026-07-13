# Smart Ledger — multi-stage production image (Next.js standalone output).
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Puppeteer is a dev-only verification tool; never download its browser in Docker.
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Prisma engines need OpenSSL + CA certs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
# Placeholder so `prisma generate` / `next build` can import the db client at
# build time. The REAL url is injected at runtime by docker-compose (env wins).
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
WORKDIR /app

# --- deps: install with a warm pnpm store cache ---
# The prisma schema is copied first so the `postinstall` (prisma generate) works.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- build: generate Prisma client + build Next ---
# A placeholder DATABASE_URL lets the build import the db client; the real URL is
# injected at runtime by docker-compose. No DB connection happens at build time.
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# --- runtime: standalone server + Prisma CLI/tsx for migrate & seed on boot ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Overlay the full node_modules so `prisma` + `tsx` exist for the entrypoint.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src/generated ./src/generated
# seed.ts imports pure helpers from src/lib (money/date); include them so the
# entrypoint's `tsx prisma/seed.ts` resolves its imports.
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
ENTRYPOINT ["./docker-entrypoint.sh"]
