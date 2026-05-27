# Sécurité réseau — CORS, HSTS, CSRF WebSocket, DTLS

> Concepts appliqués dans : `backend/internal/handler/handler.go`, `frontend/nginx.conf`, `docker-compose.yml`, `frontend/src-tauri/src/bluetooth.rs`

---

## 1. CORS — Cross-Origin Resource Sharing

### Le problème

Un navigateur qui charge `https://evil.com` ne devrait pas pouvoir faire des requêtes vers `https://battleship.maxime-louis.com/api` à ton insu.

La **Same-Origin Policy** (SOP) du navigateur bloque par défaut toute requête vers un domaine différent. CORS est le mécanisme qui permet d'**assouplir** cette restriction de façon contrôlée.

### Comment ça marche

```
Navigateur                          Serveur
    │                                  │
    │── OPTIONS /api (preflight) ──────►│
    │   Origin: https://evil.com        │
    │                                  │
    │◄── 403 Forbidden ─────────────────│
    │    (evil.com non dans la liste)   │
    │                                  │
    │── OPTIONS /api (preflight) ──────►│
    │   Origin: https://battleship...   │
    │                                  │
    │◄── 200 + Access-Control-Allow-* ──│
    │                                  │
    │── GET /api/rooms ────────────────►│
```

**Requête preflight** : pour les requêtes "non-simples" (POST avec JSON, headers custom), le navigateur envoie d'abord un `OPTIONS` pour demander la permission. Les requêtes simples (GET, HEAD, POST `text/plain`) n'ont pas de preflight.

### CORS pour les WebSockets — le cas de ce projet

Les WebSockets **ne font pas de preflight CORS**. À la place, la librairie `coder/websocket` vérifie le header `Origin` manuellement :

```go
// handler.go
func allowedOrigins() []string {
    if v := os.Getenv("ALLOWED_ORIGINS"); v != "" {
        return strings.Split(v, ",")
    }
    return []string{"localhost:5173", "localhost"}
}

conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
    OriginPatterns: allowedOrigins(),
})
```

Si `Origin` ne matche pas → connexion refusée avant même le handshake WebSocket. En production, `ALLOWED_ORIGINS=battleship.maxime-louis.com` est passé en variable d'environnement.

**Bonne pratique** : ne jamais mettre `*` (wildcard) pour les WebSockets — ça revient à ne pas avoir de protection du tout.

---

## 2. CSRF — Cross-Site Request Forgery WebSocket

### Le problème spécifique aux WebSockets

CORS protège les requêtes HTTP, mais les WebSockets sont différents. Quand tu visites `evil.com`, le JavaScript peut initier une connexion WebSocket vers `battleship.maxime-louis.com` — et le navigateur **envoie les cookies de session automatiquement**.

```
Utilisateur connecté à battleship.maxime-louis.com
   │
   ▼
Visite evil.com
   │
   ▼ JavaScript malveillant
new WebSocket("wss://battleship.maxime-louis.com/ws")
// → le navigateur ajoute les cookies de battleship.maxime-louis.com
// → si le serveur ne vérifie pas l'Origin → attaque réussie
```

### La protection dans ce projet

La vérification `OriginPatterns` dans `websocket.Accept` est exactement la bonne défense contre ça. Si `evil.com` tente de se connecter, l'`Origin: https://evil.com` ne matche pas `battleship.maxime-louis.com` → connexion refusée.

Ce projet n'utilise pas de cookies de session (pas d'auth) → risque CSRF limité. Mais la protection `Origin` est là de toute façon.

---

## 3. HSTS — HTTP Strict Transport Security

HSTS est un header HTTP qui dit au navigateur : "ne jamais utiliser HTTP pour ce domaine, toujours HTTPS".

```nginx
# nginx.conf (serveur)
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

| Paramètre | Valeur | Signification |
|---|---|---|
| `max-age` | `63072000` | 2 ans en secondes |
| `includeSubDomains` | présent | s'applique aussi à `*.maxime-louis.com` |
| `preload` | présent | eligible à la liste HSTS preload des navigateurs |

### Ce que ça empêche — l'attaque SSL strip

Sans HSTS :
```
Attaquant (MITM)
   ↓
Utilisateur tape http://battleship.maxime-louis.com
   → Attaquant intercepte et répond en HTTP (sans TLS)
   → Attaquant proxifie en HTTPS vers le vrai serveur
   → Utilisateur pense être en HTTPS, il est en HTTP
```

Avec HSTS, le navigateur refuse de se connecter en HTTP après avoir vu le header une première fois. L'attaque SSL strip ne fonctionne plus.

**La liste preload** : les navigateurs (Chrome, Firefox) maintiennent une liste de domaines qui sont TOUJOURS en HTTPS, même à la toute première visite. `hstspreload.org` permet de soumettre un domaine.

---

## 4. TLS & Let's Encrypt — comment ça fonctionne

### Le rôle de TLS

TLS (Transport Layer Security, successeur de SSL) fournit :
1. **Authentification** : le certificat prouve que `battleship.maxime-louis.com` est bien toi
2. **Chiffrement** : les données sont illisibles pour un observateur réseau
3. **Intégrité** : les données ne peuvent pas être modifiées en transit

### Le handshake TLS 1.3 (simplifié)

```
Client                          Serveur
  │── ClientHello ─────────────►│
  │   (versions TLS supportées, │
  │    ciphers, key share)       │
  │                              │
  │◄── ServerHello ──────────────│
  │    Certificat                │
  │    Finished (chiffré)        │
  │                              │
  │── Finished (chiffré) ───────►│
  │                              │
  ╔══════════════════════════════╗
  ║   Données chiffrées (HTTPS)  ║
  ╚══════════════════════════════╝
```

TLS 1.3 réduit le handshake à **1 aller-retour** (contre 2 pour TLS 1.2) → latence réduite.

### Let's Encrypt & ACME

Let's Encrypt est une CA (Certificate Authority) gratuite. Le protocole ACME automatise la validation de propriété du domaine :

```
Certbot (ton serveur)           Let's Encrypt
    │── "Je veux un cert pour battleship.maxime-louis.com" ──►│
    │                                                          │
    │◄── "Prouve que tu contrôles le domaine" ─────────────────│
    │    "Mets ce token à http://battleship.../well-known/..." │
    │                                                          │
    │── Crée le fichier ─────────────────────────────────────► │
    │   (Nginx sert /.well-known/acme-challenge/)              │
    │                                                          │
    │◄── Certificat valide 90 jours ───────────────────────────│
```

**Renouvellement automatique** : `certbot renew` est lancé par un cron. À configurer sur le serveur avec `certbot renew --quiet` dans `/etc/cron.d/`.

---

## 5. DTLS — le TLS du Bluetooth et de WebRTC

**DTLS** (Datagram TLS) = TLS adapté à UDP. Même garanties de sécurité que TLS, mais sur un protocole sans connexion.

```
TCP  →  TLS   (WebSocket, HTTPS)
UDP  →  DTLS  (WebRTC, BLE)
```

### Dans WebRTC

WebRTC **impose** DTLS. Tu ne peux pas désactiver le chiffrement. Chaque pair génère un certificat auto-signé au démarrage, dont le **fingerprint** est inclus dans le SDP :

```
a=fingerprint:sha-256 AB:CD:EF:...   ← dans le SDP
```

Quand la connexion P2P s'établit, chaque pair vérifie que l'empreinte du certificat reçu correspond à celle dans le SDP. Si un attaquant intercepte et remplace le trafic, l'empreinte ne correspondra pas → connexion refusée.

### Dans Bluetooth BLE

BLE propose aussi du chiffrement (LE Secure Connections, basé sur ECDH), mais CoreBluetooth le gère de façon transparente au niveau du pairing. Dans ce projet, pour un jeu scolaire local, le chiffrement BLE n'est pas activé explicitement — les données de jeu (coordonnées de tirs) ne sont pas sensibles.

---

## 6. Headers de sécurité HTTP

```nginx
# nginx.conf — serveur Battleship
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

| Header | Protège contre |
|---|---|
| `Strict-Transport-Security` | SSL strip, connexions HTTP non chiffrées |
| `X-Frame-Options: SAMEORIGIN` | Clickjacking (ton app dans un iframe malveillant) |
| `X-Content-Type-Options: nosniff` | MIME sniffing (navigateur qui exécute un JS déguisé en image) |
| `Referrer-Policy` | Fuite de l'URL de provenance vers des services tiers |

---

## 7. Ce qui manque dans ce projet (dette technique connue)

| Manque | Impact | Solution |
|---|---|---|
| Rate limiting WebSocket | DoS par flood de connexions | `golang.org/x/time/rate` par IP |
| Pas d'auth | N'importe qui peut jouer | JWT ou session token si le projet évolue |
| Rooms non expirées | Leak mémoire progressif | TTL sur les rooms inactives (ex: 30min) |
| Cert `maxime-louis.com` expiré | HTTPS cassé sur le serveur | `certbot renew` |
| Pas de CSP (Content Security Policy) | XSS potentiel | `add_header Content-Security-Policy "..."` |

---

## 8. Ce que tu dois retenir

- **CORS** = le navigateur demande la permission au serveur cible avant une requête cross-origin
- **CSRF WebSocket** = vérifier l'`Origin` côté serveur, pas dans le navigateur
- **HSTS** = forcer HTTPS même si l'utilisateur tape HTTP, résiste au SSL strip
- **TLS 1.3** = 1 round-trip, chiffrement + authentification + intégrité
- **DTLS** = TLS sur UDP (WebRTC, BLE) — obligatoire dans WebRTC
- **Let's Encrypt** = CA gratuite, validation ACME, certificats 90 jours auto-renouvelables
