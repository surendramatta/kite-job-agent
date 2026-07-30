# Kite deployment

## 1. Prepare the server

Install Docker Engine and the Docker Compose plugin. A small Linux VM with at
least 2 GB RAM is recommended because Chromium can use several hundred MB per
application.

## 2. Configure secrets

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Put a different generated value on each line in `.env`.

## 3. Start Kite

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f worker
```

## 4. Add HTTPS with Caddy

Example Caddyfile:

```caddy
kite.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Only expose ports 80/443 publicly. Keep port 3000 bound to localhost or protect
it with the host firewall when using a reverse proxy.

## 5. Back up data

```bash
docker run --rm \
  -v kitev8_work_kite_data:/data \
  -v "$PWD":/backup \
  alpine tar czf /backup/kite-backup-$(date +%F).tgz -C /data .
```

## 6. Upgrade

```bash
git pull
docker compose up -d --build
```

The SQLite schema migrates when the web process starts.
