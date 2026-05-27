# Docker & Déploiement — de la machine locale au serveur

> Concepts utilisés dans : `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `frontend/nginx.conf`

---

## 1. Pourquoi Docker ?

Le problème classique : "ça marche chez moi". Docker résout ça avec des **conteneurs** : des processus isolés qui embarquent leurs propres dépendances (librairies, runtime, config).

```
Sans Docker                     Avec Docker
─────────────────────────       ─────────────────────────────
Machine dev : Go 1.22           Machine dev
Machine prod : Go 1.19          ↓ docker build
→ Comportements différents      Image = snapshot figée
→ "Ça marchait avant !"        Machine prod
                                ↓ docker run <même image>
                                → Comportement identique garanti
```

**Différence conteneur vs VM** :
- Une VM émule un OS entier (heavy, ~minutes à démarrer)
- Un conteneur partage le kernel Linux de la machine hôte (léger, ~secondes)

---

## 2. Dockerfile multi-stage — le backend Go

```dockerfile
# Stage 1 : Builder (gros, avec tous les outils de compilation)
FROM --platform=$BUILDPLATFORM golang:1.26.0-alpine3.23 AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /usr/src/app
COPY go.mod go.sum ./
RUN go mod download                    # cache séparé des dépendances

COPY . .
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" \
    -o /usr/local/bin/server ./cmd/server

# Stage 2 : Image finale (vide = scratch)
FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/local/bin/server /usr/local/bin/server
EXPOSE 8080
CMD ["/usr/local/bin/server"]
```

### Pourquoi deux stages ?

Le stage `builder` contient Go, les sources, les outils de compilation → ~800MB.  
L'image `scratch` ne contient que le binaire compilé → ~12MB.

**`FROM scratch`** = image vide (0 octet). Aucun shell, aucun outil, aucune lib. Surface d'attaque quasi nulle.

### Cross-compilation sans émulation

`--platform=$BUILDPLATFORM` = le compilateur Go tourne nativement sur ta machine (M1/M2 = arm64).  
`GOOS=${TARGETOS} GOARCH=${TARGETARCH}` = le binaire produit cible le serveur (linux/amd64).

Sans ça, Docker utiliserait QEMU pour émuler l'architecture cible → 10x plus lent.

### Le cache Docker layer par layer

```dockerfile
COPY go.mod go.sum ./     ← layer 1 (change rarement)
RUN go mod download        ← layer 2 (recalculé seulement si layer 1 change)
COPY . .                   ← layer 3 (change à chaque modification du code)
RUN go build ...           ← layer 4 (recalculé si layer 3 change)
```

**Règle** : mettre ce qui change rarement **avant** ce qui change souvent → les premières layers restent cachées même si le code change.

---

## 3. Dockerfile frontend — Node + Nginx

```dockerfile
# Stage 1 : deps (npm ci)
FROM node:20-alpine AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --legacy-peer-deps

# Stage 2 : build (Vite → dist/)
FROM node:20-alpine AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG VITE_WS_URL
ENV VITE_WS_URL=${VITE_WS_URL}
RUN npm run build          # génère dist/

# Stage 3 : nginx sert les fichiers statiques
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

`VITE_WS_URL` est injecté au **moment du build** (pas au runtime). Vite remplace `import.meta.env.VITE_WS_URL` par la valeur dans le bundle JS. C'est un choix fort : changer l'URL du WebSocket nécessite de rebuilder l'image.

---

## 4. nginx.conf — serveur web + proxy WebSocket

```nginx
server {
    listen 80;

    # WebSocket : headers d'upgrade obligatoires
    location /ws {
        proxy_pass         http://battleship-backend:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;       # ← obligatoire
        proxy_set_header   Connection "upgrade";         # ← obligatoire
        proxy_read_timeout 3600s;                        # ← connexion persistante
    }

    # API REST
    location /api {
        proxy_pass http://battleship-backend:8080;
    }

    # SPA : tout le reste → index.html (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Pourquoi `proxy_http_version 1.1` + `Upgrade` + `Connection` ?**  
HTTP/1.0 ne supporte pas les connexions persistantes. Le handshake WebSocket nécessite `Upgrade: websocket` et `Connection: Upgrade`. Sans ces headers, Nginx coupe la connexion dès la fin de la requête HTTP.

**`proxy_read_timeout 3600s`** : par défaut 60s. Si aucune donnée ne transite pendant 60s, Nginx ferme la connexion → parties de Battleship longues coupées. 1h = largement suffisant.

**`battleship-backend:8080`** : dans Docker Compose, les conteneurs se résolvent par leur **nom de service**. Pas besoin d'IP : Docker crée un réseau interne avec DNS intégré.

---

## 5. docker-compose.yml — orchestration locale et prod

```yaml
services:
  backend:
    build: ./backend
    container_name: battleship-backend
    environment:
      - ALLOWED_ORIGINS=battleship.maxime-louis.com
    networks:
      - proxy

  frontend:
    build:
      context: ./frontend
      args:
        VITE_WS_URL: wss://battleship.maxime-louis.com/ws
    container_name: battleship-frontend
    depends_on:
      - backend
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.battleship.rule=Host(`battleship.maxime-louis.com`)"
      - "traefik.http.routers.battleship.entrypoints=web"
      - "traefik.http.services.battleship.loadbalancer.server.port=80"

networks:
  proxy:
    external: true   # réseau créé par Traefik, partagé
```

Aucun port exposé directement sur l'hôte. Tout passe par Traefik via le réseau Docker `proxy`.

---

## 6. Architecture réseau sur le serveur

```
Internet
   │ HTTPS :443
   ▼
[Nginx] ─── Let's Encrypt TLS ─── cert wildcard *.maxime-louis.com
   │ HTTP :81 (interne seulement)
   ▼
[Traefik] ─── lit les labels Docker ─── route par Host header
   │ réseau Docker "proxy"
   ├──► [battleship-frontend:80]  (battleship.maxime-louis.com)
   ├──► [portfolio:3000]          (maxime-louis.com)
   └──► [whoami:80]               (whoami.maxime-louis.com)
```

**Nginx** = terminaison TLS (HTTPS), headers de sécurité, HTTP/3  
**Traefik** = reverse proxy applicatif, routing par labels Docker  
**Conteneurs** = ne voient jamais Internet directement

**Pourquoi deux niveaux de proxy ?** Nginx gère le TLS mieux que Traefik dans cette config. Traefik gère le routing dynamique (détecte automatiquement les nouveaux conteneurs via le socket Docker).

---

## 7. Variables d'environnement — la règle des 12 facteurs

La méthode **12-factor app** (Heroku, 2011) est le standard pour les apps cloud-native. Facteur III : la configuration dans l'environnement.

```
❌ Pas ça : URL en dur dans le code
✅ Ça : variable d'environnement
```

Dans ce projet :
- `ALLOWED_ORIGINS` → `docker-compose.yml` ou `.env`
- `VITE_WS_URL` → build arg Docker
- `PORT` → env var Go (fallback 8080)

---

## 8. Ce que tu dois retenir

- **Multi-stage build** : sépare l'outil de compilation de l'image finale → images légères et sécurisées
- **Layer cache** : mettre les dépendances avant le code source → builds rapides
- **`FROM scratch`** : image vide = surface d'attaque minimale
- **Docker Compose** : orchestre plusieurs conteneurs, gère le réseau, les dépendances, les variables
- **Traefik labels** : configuration du routing declarative, versionnée dans le docker-compose
- **Nginx proxy WebSocket** : headers `Upgrade` + `Connection` + timeout long = obligatoires
