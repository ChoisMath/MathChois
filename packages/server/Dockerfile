# 재현성 위해 Node 버전 핀 고정 — floating `22-slim` 의 자동 상향이 런타임 비호환을 유발한 적 있음
FROM node:22.23.0-slim AS base
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
# Vite 빌드 타임 env: HTML 도구를 앱과 다른 origin 에서 서빙하기 위한 origin
ARG VITE_TOOLS_ORIGIN
ENV VITE_TOOLS_ORIGIN=$VITE_TOOLS_ORIGIN
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

EXPOSE ${PORT:-3001}
CMD ["node", "packages/server/dist/index.js"]
