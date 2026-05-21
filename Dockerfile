# ===== Peregrine - image de production =====
# Construction en plusieurs etapes : on compile le frontend et le backend
# dans des etapes separees, puis on assemble une image finale legere.

# --- Etape 1 : construction de l'interface React ---
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Etape 2 : compilation du backend (TypeScript -> JavaScript) ---
FROM node:22-slim AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# --- Etape 3 : image finale executee en production ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Dependances de production du backend uniquement
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev && npm cache clean --force

# Backend compile + frontend compile
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 3000

# Verifie periodiquement que le panel repond
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/dist/index.js"]
