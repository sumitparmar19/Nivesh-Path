# Container image for the Nivesh-Path Node/Express backend. It also serves the web UI: the React app
# (built in the first stage from frontend/) plus the legacy HTML pages in public/ that React hasn't replaced yet.

# --- Stage 1: build the React app (frontend/dist) ---
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: the server ---
FROM node:22-alpine
# Links the image published to GHCR (by CI) to this repository.
LABEL org.opencontainers.image.source="https://github.com/sumitparmar19/Nivesh-Path"

ENV NODE_ENV=production
WORKDIR /app

# The schema comes first: `npm ci` runs `prisma generate` (postinstall), which builds the client from it.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY scripts/db-check.js scripts/migrate-ledger.js scripts/with-db-url.js ./scripts/
COPY src ./src
COPY models ./models
COPY public ./public
COPY --from=frontend /frontend/dist ./frontend/dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
