#!/bin/sh
set -e

echo "Applying database migrations…"
./node_modules/.bin/prisma migrate deploy

# Operator-scope gate. WARN ONLY, deliberately: a route-operator with no
# operatorCode cannot open the console, which is bad for one dispatcher. A
# boot-blocking check would take the whole site down for every rider instead,
# which is much worse. Surface it loudly and start anyway.
echo "Checking operator scope…"
if ! ./node_modules/.bin/tsx scripts/backfill-operator-codes.ts; then
  echo ""
  echo "!!  Console users above have no operator assigned and cannot open the"
  echo "!!  console. Riders are unaffected. Fix with:"
  echo "!!    docker compose exec web ./node_modules/.bin/tsx \\"
  echo "!!      scripts/backfill-operator-codes.ts --set EMAIL=ANBESSA"
  echo ""
fi

echo "Starting Next.js…"
exec node server.js
