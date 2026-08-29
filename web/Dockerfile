# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client is generated into src/generated/prisma (see schema.prisma).
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- run ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Prisma CLI for `migrate deploy` on boot (schema + migrations copied below).
# tsx and the pg adapter additionally let scripts/ run in production — the
# operator-scope backfill gate has to be runnable where the real accounts are,
# not only on a developer's machine.
# @prisma/client is explicit rather than inherited from the standalone
# bundle: the generated client requires @prisma/client/runtime, and relying on
# whatever Next's tracing happened to bundle would break silently on upgrade.
#
# papaparse + @turf/* are the same story, for prisma/seed/*.ts specifically:
# Next's file trace only keeps a package if it survives in the WEBPACK SERVER
# BUNDLE, and small pure-JS libs like these get inlined into that bundle
# rather than left as a standalone node_modules/ entry — so `directions.ts`
# importing @turf/helpers works fine in-process (webpack already resolved it)
# while `tsx prisma/seed/build-geojson.ts`, which does real Node module
# resolution against disk, gets MODULE_NOT_FOUND for the exact same package.
# Any script under prisma/seed/ or scripts/ that needs a package NOT reached
# by an app route (check with `grep -rl <pkg> src/`) has to be added here —
# the standalone build gives no signal that it's missing until you try to run
# the script in the container.
RUN npm install --no-save --no-package-lock \
    prisma@7.8.0 @prisma/client@7.8.0 dotenv@17 tsx@4 @prisma/adapter-pg@7.8.0 \
    papaparse@5.5.4 @turf/helpers@7.3.5 @turf/length@7.3.5 @turf/simplify@7.3.5

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
# Operational scripts plus the generated client they import. Scripts resolve
# it by relative path (../src/generated/prisma), so the layout is preserved
# rather than flattened.
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/generated ./src/generated

# Seed the export directory before USER nextjs. Docker initializes an empty
# named volume from the image path it mounts over, ownership included; without
# this the volume arrives root-owned and the first feed generation fails with
# EACCES as uid 1001.
RUN mkdir -p /app/.gtfs-exports && chown nextjs:nodejs /app/.gtfs-exports

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
