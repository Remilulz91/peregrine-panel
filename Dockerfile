# ===== Peregrine - production image =====
# Multi-stage build: the frontend and backend are compiled in separate
# stages, then assembled into a small final image.

# --- Stage 1: build the React interface ---
FROM node:26-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# --- Stage 2: compile the backend (TypeScript -> JavaScript) ---
FROM node:26-slim AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --ignore-scripts
COPY backend/ ./
RUN npm run build

# --- Stage 3: final image run in production ---
FROM node:26-slim AS runtime
ENV NODE_ENV=production
# v0.37.0: cap the V8 old-space heap at 512 MiB. The panel itself
# (Fastify + node:sqlite + socket.io + a handful of workers) needs
# well under 200 MiB at steady state, so 512 MiB is generous but
# still small enough that a runaway leak crashes the container fast
# instead of suffocating a small VPS. Operators on tight hosts can
# lower this via docker-compose's `environment:` override.
ENV NODE_OPTIONS=--max-old-space-size=512
WORKDIR /app

# Backend production dependencies only
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev --ignore-scripts && npm cache clean --force

# v0.34.0+: anti-LOLBin. We aggressively remove binaries that have no
# legitimate use at runtime but are commonly used for post-compromise
# exfiltration / persistence. `node` remains the sole significant
# binary an attacker could leverage. Specifically removed: apt + dpkg
# (no further package installs), find/xargs (discovery), curl/wget
# (HTTP exfil — not in slim by default but defence in depth), ssh
# client, base64 + xxd if present.
# We keep coreutils minimal (rm, mv, cat, ls — needed by the entrypoint
# and HEALTHCHECK). If something we removed is required, the container
# crashes immediately on start which is what we want.
#
# v0.43.2+: we KEEP `tar` + `gzip` + `gunzip` — earlier versions
# tried to remove them too, but `services/backups.ts` spawns
# `tar -czf` to create backup archives and `tar -xzf` to restore
# them. Removing those binaries broke every backup (manual + via
# the schedule worker) with a "tar: command not found" the moment
# the cache-less Docker layer ran the rm. They ARE technically
# LOLBins from an attacker's POV, but they're functional
# dependencies of the panel itself; trade-off accepted. `du` is
# also kept (used by diskQuotaWorker + measureDirectorySize) —
# it's part of coreutils and was never on the removal list.
RUN apt-get update -y && apt-get install -y --no-install-recommends ca-certificates \
    && rm -f /usr/bin/apt /usr/bin/apt-get /usr/bin/dpkg /usr/bin/dpkg-deb /usr/bin/dpkg-query 2>/dev/null || true \
    && rm -f /usr/bin/find /usr/bin/xargs /usr/bin/curl /usr/bin/wget 2>/dev/null || true \
    && rm -f /usr/bin/ssh /usr/bin/scp /usr/bin/nc /usr/bin/ncat 2>/dev/null || true \
    && rm -f /usr/bin/xxd /usr/bin/base32 /usr/bin/sftp 2>/dev/null || true \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt 2>/dev/null || true

# Compiled backend + compiled frontend
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 3000

# Periodically checks that the panel responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/dist/index.js"]
