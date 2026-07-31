# node:24-alpine to match this project's other Node service
# (picoclaw-openai-proxy/Dockerfile).
#
# Do NOT add `corepack enable` back. node:24-alpine already ships a real yarn
# 1.22.22 (/opt/yarn-v1.22.22, symlinked at /usr/local/bin/yarn), which is
# exactly what this repo's yarn.lock wants -- it is a v1 lockfile. `corepack
# enable` replaces that working binary with a shim that resolves the yarn
# version over the NETWORK on every invocation. That turned `yarn build` -- a
# step whose inputs are all already inside the image -- into one that needs
# egress to the npm registry, and a builder without DNS died on
# `getaddrinfo EAI_AGAIN registry.npmjs.org`.
#
# Pinning `packageManager` in package.json does NOT fix it: corepack then
# insists on downloading that exact version from registry.yarnpkg.com even
# though the identical version is already on disk. Both behaviours were
# verified offline against this image, not assumed.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# `output: "standalone"` (next.config.ts) traces only the deps actually used
# at runtime, so the final image doesn't need node_modules/yarn at all.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
