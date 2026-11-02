# NuvioTV Unified Relay & JioTV Addon — Deployment Guide

This relay serves as a permanent, standalone streaming relay for **both VZY (Watcho) and JioTV Live TV channels**, as well as a native **Stremio Addon**.

---

## Capabilities

- **Unified `/live/{channelId}.m3u8` endpoint:**
  - **JioTV Channels** (e.g. `1132` Star Plus HD, `875` Eurosport HD, `173` Aaj Tak): Automatically fetches tokens, parses DASH manifests, and decrypts CENC AES-CTR chunks on the fly.
  - **VZY / Watcho Channels** (e.g. `9252604` Prarthana TV, `9487071` 9XM, `9487055` Zee News): Injects Watcho upstream referers, rewrites sub-playlists, and adds CORS headers.
  - **Custom Overrides** (`channels.json`): Route any channel ID to custom IPTV or tuner URLs.
- **Full Stremio Addon Engine:**
  - `GET /manifest.json` — Install directly into Stremio on Android TV, Mobile, Mac, PC.
  - `GET /catalog/channel/jiotv.json` — Channel directory with logos and categories.
  - `GET /stream/channel/jiotv:{id}.json` — Returns the live relay stream.

---

## Important: IP & Geo-Blocking

> [!IMPORTANT]
> JioTV's CDN (`jiotvmblive.cdn.jio.com`) geo-blocks IPs outside of India.
> - **Best Option:** Run on a home server (Raspberry Pi, Mac, PC, NAS) on your Indian home broadband with a permanent Cloudflare Tunnel.
> - **Cloud Option:** If deploying to a VPS/Cloud, select a region located in **India** (e.g. AWS Mumbai `ap-south-1`, Oracle Cloud Mumbai/Hyderabad, DigitalOcean Bangalore `blr1`).

---

## Option 1: Home Server + Permanent Cloudflare Tunnel (Recommended)

This gives you a permanent `https://relay.yourdomain.com` URL that **never expires**, runs on your home Indian IP, and requires no router port forwarding.

### 1. Install & Log In to Cloudflare
```bash
# macOS
brew install cloudflared

# Linux / Debian / Ubuntu / Raspberry Pi
sudo apt install cloudflared
```

Log in with your free Cloudflare account:
```bash
cloudflared tunnel login
```

### 2. Create a Permanent Named Tunnel
```bash
cloudflared tunnel create nuvio-relay
```
*(This creates a persistent tunnel credential that never expires, unlike temporary `trycloudflare.com` quick tunnels).*

### 3. Route Your Subdomain
```bash
cloudflared tunnel route dns nuvio-relay relay.yourdomain.com
```

### 4. Create Configuration File (`~/.cloudflared/config.yml`)
```yaml
tunnel: nuvio-relay
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: relay.yourdomain.com
    service: http://localhost:8090
  - service: http_status:404
```

### 5. Run as a Background Service
```bash
# Start relay with PM2:
npm install -g pm2
pm2 start server.mjs --name nuvio-relay
pm2 save
pm2 startup

# Start tunnel service:
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```
Your relay is now permanently accessible at `https://relay.yourdomain.com`!

---

## Option 2: Docker / Docker Compose

### Using Docker Compose
```bash
cd NuvioTV/relay
docker compose up -d
```

### Using Raw Docker
```bash
cd NuvioTV/relay
docker build -t nuvio-relay .
docker run -d \
  --name nuvio-relay \
  --restart unless-stopped \
  -p 8090:8090 \
  nuvio-relay
```

Check health:
```bash
curl http://localhost:8090/health
```

---

## Option 3: Linux VPS / Cloud (PM2 / Systemd)

1. **Clone & install Node.js (Node 20+):**
   ```bash
   git clone <repo-url>
   cd NuvioTV/relay
   ```

2. **Start with PM2:**
   ```bash
   npm install -g pm2
   pm2 start server.mjs --name nuvio-relay
   pm2 startup
   pm2 save
   ```

3. **Reverse Proxy with Nginx (Optional for SSL):**
   ```nginx
   server {
       server_name relay.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:8090;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header Range $http_range;
           proxy_set_header If-Range $http_if_range;
       }
   }
   ```

---

## Connecting the Relay

### 1. In NuvioTV Web App
In `NuvioTV/web/.env`:
```env
VITE_VZY_RELAY_URL=https://relay.yourdomain.com
VITE_JIOTV_RELAY_URL=https://relay.yourdomain.com
```
*(If running locally, set both to `http://localhost:8090`).*

### 2. In Stremio
On any device (Android TV, Mobile, Desktop):
1. Open Stremio -> **Addons** -> **Community Addons**.
2. Paste the manifest URL into the search bar:
   ```text
   https://relay.yourdomain.com/manifest.json
   ```
3. Click **Install**. All JioTV channels will appear under "JioTV Live" on your home screen and stream seamlessly!

### 3. In VLC, TiviMate, or IPTV Players
Any channel can be streamed directly via:
```text
https://relay.yourdomain.com/live/{channelId}.m3u8
```
Examples:
- Star Plus HD: `https://relay.yourdomain.com/live/1132.m3u8`
- Eurosport HD: `https://relay.yourdomain.com/live/875.m3u8`
- Aaj Tak: `https://relay.yourdomain.com/live/173.m3u8`
- Zee News: `https://relay.yourdomain.com/live/9487055.m3u8`
