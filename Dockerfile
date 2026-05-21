# ===== Peregrine - production image =====
# Multi-stage build: the frontend and backend are compiled in separate
# stages, then assembled into a small final image.

# --- Stage 1: build the React interface ---
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: compile the backend (TypeScript -> JavaScript) ---
FROM node:22-slim AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# --- Stage 3: final image run in production ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Backend production dependencies only
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev && npm cache clean --force

# Compiled backend + compiled frontend
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 3000

# Periodically checks that the panel responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/dist/index.js"]
