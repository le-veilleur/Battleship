# ── Stage 1 : Builder ─────────────────────────────────────────────────────────
#
# $BUILDPLATFORM = plateforme de la machine qui build (ex: linux/arm64 sur M1/M2/M3)
# $TARGETOS / $TARGETARCH = cible du binaire (ex: linux/amd64 en prod)
#
# Avantage : le compilateur Go tourne nativement (pas d'émulation QEMU),
# et cross-compile vers la cible. Rapide en local ET en CI.
#
# Exemples :
#   Local ARM     → docker build .                          (arm64 natif)
#   Prod AMD64    → docker buildx build --platform linux/amd64 .
#   Multi-arch    → docker buildx build --platform linux/amd64,linux/arm64 --push .
#
FROM --platform=$BUILDPLATFORM golang:1.26.0-alpine3.23 AS builder

# ARGs injectés automatiquement par Docker buildx
ARG TARGETOS
ARG TARGETARCH

WORKDIR /usr/src/app

# On copie uniquement go.mod/go.sum en premier pour profiter du cache Docker :
# si les dépendances n'ont pas changé, `go mod download` n'est pas rejoué.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO=0 : cross-compilation standard, pas de dépendances natives
# -trimpath : supprime les chemins absolus du binaire (reproductibilité)
# -ldflags="-s -w" : supprime la table de symboles et les infos de debug (binaire plus léger)
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" \
    -o /usr/local/bin/server ./cmd/server

# ── Stage 2 : Image finale ────────────────────────────────────────────────────
#
# "scratch" = image vide (0 MB) — uniquement le binaire + certificats TLS
# Avantages : surface d'attaque minimale, image ultra-légère (~10-20 MB)
#
FROM scratch

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/local/bin/server /usr/local/bin/server

EXPOSE 8080

CMD ["/usr/local/bin/server"]
