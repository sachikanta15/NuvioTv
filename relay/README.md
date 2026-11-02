# NuvioTV Stream Relay

A lightweight, standalone stream relay for NuvioTV Live TV channels. Runs locally or on a remote server/VPS to provide clean, CORS-enabled HLS/DASH streaming for all live channels.

---

## Features

- **Direct Live Channel Endpoints**:
  - `GET /live/{channelId}.m3u8` — HLS master & variant playlists with rewritten chunk URLs.
  - `GET /live/{channelId}.mpd` — DASH manifest proxying with resolved absolute BaseURLs.
- **Custom Channel Overrides**:
  - Map any channel ID (e.g. `9450546` for Eurosport HD) to your own custom stream source (IPTV feed, local tuner, or custom M3U8/MPD) in `channels.json`.
- **CORS & Header Handling**:
  - Automatically adds required upstream `Referer: https://www.watcho.com/` and `Origin` headers while serving standard `Access-Control-Allow-Origin: *` to the web player.
- **Zero External Dependencies**:
  - Written in modern native Node.js (Node 18+). No `npm install` needed to start.

---

## Quick Start

### 1. Start the Relay Server

```bash
cd NuvioTV/relay
node server.mjs
```

Or run with a custom port:

```bash
PORT=8090 node server.mjs
```

The relay will log:
```
=======================================================
🚀 NuvioTV Stream Relay running on http://0.0.0.0:8090
📡 Live Channel URL pattern: http://0.0.0.0:8090/live/{channelId}.m3u8
=======================================================
[Relay] Loaded 318 channels from Kaltura OTT directory.
```

### 2. Connect NuvioTV to the Relay

In `NuvioTV/web/.env`:

```env
VITE_VZY_RELAY_URL=http://localhost:8090
```

Or directly in the browser's Developer Tools Console:
```javascript
localStorage.setItem("nuvio.vzy.relayUrl", "http://localhost:8090");
```

NuvioTV will immediately prioritize your relay for all live playback!

---

## Custom Channel Overrides (`channels.json`)

If you have a custom or unencrypted feed for specific channels (e.g., Eurosport HD, Discovery, Sports channels), copy `channels.example.json` to `channels.json`:

```json
{
  "channels": {
    "9450546": {
      "name": "Eurosport HD",
      "url": "http://your-iptv-server:8000/live/eurosport.m3u8"
    },
    "9450542": {
      "name": "Investigation Discovery HD",
      "url": "http://your-iptv-server:8000/live/id_hd.m3u8"
    }
  }
}
```

Whenever NuvioTV requests channel `9450546`, the relay automatically serves your custom source instead of upstream.

---

## Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server health check and channel count. |
| `GET` | `/channels` | JSON list of all channels and their relay stream URLs. |
| `GET` | `/live/:channelId.m3u8` | Proxied HLS playlist for a channel. |
| `GET` | `/live/:channelId.mpd` | Proxied DASH manifest for a channel. |
| `GET` | `/proxy/m3u8?url=...` | Rewrites an arbitrary HLS playlist URL. |
| `GET` | `/segment?url=...` | Streams media chunks (`.ts`, `.m4s`, `.mp4`) with Range header support. |

