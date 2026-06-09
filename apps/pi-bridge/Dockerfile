# Multi-arch: linux/arm64 (Pi 5) + linux/amd64 (dev + shadow)
# Build via: docker buildx build --platform linux/arm64,linux/amd64 .
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ avahi-dev
COPY package.json ./
# Use npm in the container since pi-bridge's pnpm-workspace dep was
# removed (ULID inlined into src/utils/ulid.ts). No frozen lockfile —
# the package.json is the single source of truth for this image.
RUN npm install --omit=optional

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ avahi-dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx tsc
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini avahi avahi-tools
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/_health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
