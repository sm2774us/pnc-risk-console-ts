# syntax=docker/dockerfile:1.7
FROM node:22.22.3-alpine AS build
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx nx build risk-console --configuration=production --skip-nx-cache

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/apps/risk-console/ /usr/share/nginx/html/
EXPOSE 8080
