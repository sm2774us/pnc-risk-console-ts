# syntax=docker/dockerfile:1.7
FROM node:22.22.3-alpine AS build
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .
RUN node tools/build-bff.mjs

# Runtime: single bundled file, no node_modules, non-root, no shell tooling needed.
FROM gcr.io/distroless/nodejs22-debian12:nonroot
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /src/dist/apps/bff/main.mjs ./main.mjs
USER nonroot
EXPOSE 3000
HEALTHCHECK NONE
CMD ["main.mjs"]
