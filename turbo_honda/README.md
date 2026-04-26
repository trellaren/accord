# Turbo Honda / Accord

**Turbo_Honda** is the Tauri v2 + Rust edition of the Accord family —
a fully **peer-to-peer** desktop application for group voice, video, and text
communication with no central server required.

| | |
|---|---|
| **Backend** | Rust (Tauri v2) |
| **Frontend** | React 18 + TypeScript + Vite |
| **P2P layer** | libp2p (TCP · Noise · Yamux · mDNS · GossipSub) |
| **Audio** | cpal (cross-platform audio I/O) + Opus codec |
| **Video** | WebRTC (optional `video` feature) |
| **Platforms** | Windows · Linux (macOS optional) |

---

## Project structure

```
turbo_honda/accord/
├── src-tauri/               # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── lib.rs           # Tauri builder + app state
│   │   ├── commands/        # Tauri IPC commands (p2p, voip, video, channels)
│   │   ├── p2p/             # libp2p node, peer discovery, gossipsub
│   │   ├── voip/            # Audio/video capture & streaming
│   │   └── channels/        # In-memory text channel & message store
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/        # Tauri v2 capability JSON files
│
├── src/                     # React / TypeScript frontend
│   ├── components/
│   │   ├── layout/          # AppLayout, Sidebar, Welcome screen
│   │   ├── channels/        # TextChannel, VoiceChannel, VideoChannel
│   │   └── chat/            # MessageList, MessageInput
│   ├── lib/tauri.ts         # Typed invoke() wrappers for every Rust command
│   ├── store/useAppStore.ts # Global Zustand state
│   ├── App.tsx              # React Router routes
│   └── main.tsx             # ReactDOM entry
│
├── scripts/
│   ├── dev.sh               # Start in development mode
│   └── build.sh             # Build release binary
│
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Prerequisites

| Tool | Install |
|---|---|
| Rust + Cargo | `curl https://sh.rustup.rs -sSf \| sh` |
| Node.js ≥ 18 | https://nodejs.org |
| Tauri v2 system deps | See [Tauri prerequisites](https://tauri.app/start/prerequisites/) |

On **Linux** you need:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
                 libssl-dev libasound2-dev pkg-config
```

On **Windows** the WebView2 runtime is bundled by default in Windows 10/11.

---

## Getting started

```bash
cd turbo_honda/accord

# Install Node dependencies
npm install

# Start in dev mode (hot-reloads both frontend and backend)
./scripts/dev.sh
# or: cargo tauri dev

# Build a release binary / installer
./scripts/build.sh
# or: cargo tauri build
```

---

## Architecture overview

```
┌─────────────────────────────────────────────────────┐
│  Frontend  (React + Vite, rendered in Tauri WebView)│
│                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Sidebar  │  │  TextChannel │  │  VoiceChannel │ │
│  │ (channels│  │  (messages)  │  │  + Video      │ │
│  │  + peers)│  └──────────────┘  └───────────────┘ │
│  └──────────┘                                       │
│           ▲ invoke() / events                       │
└───────────┼─────────────────────────────────────────┘
            │ IPC bridge (Tauri)
┌───────────┼─────────────────────────────────────────┐
│  Backend  │ (Rust)                                  │
│           ▼                                         │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │  commands/   │  │  channels/   │                 │
│  │  (IPC layer) │  │  (msg store) │                 │
│  └──────┬───────┘  └──────────────┘                 │
│         │                                           │
│  ┌──────▼──────┐    ┌──────────────────────────┐    │
│  │    p2p/     │◄──►│        voip/             │    │
│  │  (libp2p)   │    │  cpal audio + WebRTC vid │    │
│  └─────────────┘    └──────────────────────────┘    │
│         │ TCP / mDNS / GossipSub                    │
└─────────┼───────────────────────────────────────────┘
          │ internet / LAN
     ◄────┼────►  peers
```

### P2P design

- **Transport**: TCP + Noise encryption + Yamux multiplexing (same stack Discord uses internally for voice).
- **Discovery**: mDNS for zero-config LAN discovery; manual peer ID exchange for internet peers.
- **Messaging**: GossipSub pub/sub — each text channel is a topic; voice/video signalling uses dedicated topics.
- **Voice**: PCM captured with `cpal`, encoded with Opus at 48 kHz, streamed over a dedicated libp2p stream.
- **Video** *(feature = "video")*: WebRTC peer connections negotiated via GossipSub signalling; VP8/H.264 encoded frames.

---

## Roadmap

- [ ] Wire up the real libp2p swarm event loop with Tokio
- [ ] Integrate Opus encoding/decoding for audio
- [ ] Enable `video` feature with WebRTC / nokhwa camera capture
- [ ] SQLite persistence for messages (sqlx)
- [ ] User identity & key management (Ed25519 keypair persisted to disk)
- [ ] Screen share support
- [ ] End-to-end encryption for text messages (noise protocol / age)
- [ ] System tray integration
- [ ] Auto-update via Tauri updater plugin
