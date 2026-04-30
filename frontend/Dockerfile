# ── Stage 0 : Dev (hot-reload) ───────────────────────────────
FROM node:20-alpine AS dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --legacy-peer-deps

EXPOSE 5173

CMD ["npm", "run", "dev"]

# ── Stage 1 : Dépendances ────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --legacy-peer-deps

# ── Stage 2 : Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# URL du backend WebSocket (ex: ws://api.mondomaine.com)
ARG VITE_WS_URL
ENV VITE_WS_URL=${VITE_WS_URL}

RUN npm run build

# ── Stage 3 : Nginx ──────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
