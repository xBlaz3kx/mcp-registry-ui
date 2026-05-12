# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG REGISTRY_URL=""
ARG BASE_PATH="/"
ENV REGISTRY_URL=$REGISTRY_URL
ENV BASE_PATH=$BASE_PATH

RUN npm run build

# ---- Runtime stage ----
FROM caddy:2-alpine

COPY --from=builder /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1