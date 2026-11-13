# Build stage: compile the Vue SPA
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Empty = same-origin requests; nginx (or the ingress) routes /api to the API
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# Runtime stage: static files served by unprivileged nginx on :8080
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Upstream for the /api proxy; rendered into nginx config at container start
ENV API_UPSTREAM=http://api:8000
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
