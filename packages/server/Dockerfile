FROM node:22-slim AS base
WORKDIR /app

# ─── Dependencies ──────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --ignore-scripts

# ─── Build shared + server ─────────────────────────
FROM deps AS build-server
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
RUN npx tsc -b packages/server/tsconfig.json

# ─── Build client ──────────────────────────────────
FROM deps AS build-client
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/client/ packages/client/
RUN npm run build -w @mathchois/client

# ─── Production image ─────────────────────────────
FROM base AS production
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build-server /app/packages/shared/dist packages/shared/dist
COPY --from=build-server /app/packages/shared/package.json packages/shared/
COPY --from=build-server /app/packages/server/dist packages/server/dist
COPY --from=build-server /app/packages/server/package.json packages/server/
COPY --from=build-client /app/packages/client/dist packages/client/dist
COPY --from=build-client /app/packages/client/package.json packages/client/

# Fix shared package.json for production (source .ts → compiled .js)
RUN sed -i 's|"./src/index.ts"|"./dist/index.js"|g; s|"./src/\*"|"./dist/\*"|g' packages/shared/package.json

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE ${PORT:-3001}
CMD ["node", "packages/server/dist/index.js"]
