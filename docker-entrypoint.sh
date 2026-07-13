#!/bin/sh
set -e

# Apply any pending migrations against the compose Postgres.
echo "→ Applying database migrations…"
pnpm exec prisma migrate deploy

# Seed a demo user on first boot unless SEED=false. Idempotent: the seed resets
# the demo user each run, so re-running compose won't pile up data.
if [ "${SEED:-true}" = "true" ]; then
  echo "→ Seeding demo data…"
  pnpm exec tsx prisma/seed.ts || echo "(seed skipped/failed — continuing)"
fi

echo "→ Starting Next.js server…"
exec node server.js
