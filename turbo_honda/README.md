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

| Tool | Version | Notes |
|---|---|---|
| [Rust + Cargo](https://rustup.rs) | stable ≥ 1.77 | Install via `rustup` |
| [Node.js](https://nodejs.org) | ≥ 18 LTS | npm is bundled |
| [Tauri CLI v2](https://tauri.app/start/prerequisites/) | `^2` | Installed automatically by the scripts |

---

## Installation & Build — Linux

Tested on Ubuntu 22.04 / Debian 12 and derivatives. Adjust package names for other distributions.

### 1 — System libraries

```bash
sudo apt update
sudo apt install -y \
  build-essential pkg-config curl \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libssl-dev \
  libasound2-dev
```

> **Fedora / RHEL:**
> ```bash
> sudo dnf install -y \
>   webkit2gtk4.1-devel gtk3-devel \
>   libappindicator-gtk3-devel librsvg2-devel \
>   openssl-devel alsa-lib-devel
> ```

> **Arch Linux:**
> ```bash
> sudo pacman -S --needed webkit2gtk-4.1 gtk3 \
>   libayatana-appindicator librsvg openssl alsa-lib
> ```

### 2 — Rust toolchain

```bash
curl https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
```

### 3 — Node.js (via nvm or package manager)

```bash
# Using the NodeSource repository (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should print v20.x.x or later
```

### 4 — Clone and run

```bash
git clone https://github.com/trellaren/accord.git
cd accord/turbo_honda/accord

# Install Node dependencies
npm install

# Development mode (Vite hot-reload + Tauri)
./scripts/dev.sh        # or: cargo tauri dev

# Release build (produces an AppImage / .deb in src-tauri/target/release/bundle/)
./scripts/build.sh      # or: cargo tauri build
```

---

## Installation & Build — Windows

Tested on Windows 10 (22H2) and Windows 11.

### 1 — Rust toolchain

Download and run the [rustup-init.exe](https://win.rustup.rs/x86_64) installer.  
When prompted, choose the default installation which installs the **`stable-x86_64-pc-windows-msvc`** toolchain.

> Restart your terminal after installation so that `cargo` and `rustc` are on your `PATH`.

### 2 — Visual Studio Build Tools (C++ compiler)

Tauri requires the MSVC C++ compiler. Install either:

- **[Visual Studio 2022 Community](https://visualstudio.microsoft.com/vs/community/)** (free) — select the **"Desktop development with C++"** workload during setup.
- **[Build Tools for Visual Studio 2022](https://aka.ms/vs/17/release/vs_BuildTools.exe)** (command-line tools only) — also select the **"Desktop development with C++"** workload.

Make sure the following individual components are included:
- MSVC v143 C++ build tools
- Windows 10/11 SDK (latest)

### 3 — WebView2 Runtime

Windows 10 (version 1803+) and Windows 11 ship WebView2 by default.  
If you are on an older or stripped-down installation, download the [WebView2 Evergreen bootstrapper](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section).

### 4 — Node.js

Download and install the **LTS** release from <https://nodejs.org> (the installer adds `node` and `npm` to your `PATH` automatically).

### 5 — Optional: CMake (for Opus codec compilation)

The `audiopus` crate bundles `libopus` and compiles it from source using CMake and the MSVC C compiler.

Download and install [CMake ≥ 3.25](https://cmake.org/download/) and make sure to check **"Add CMake to the system PATH for all users"** during setup.

### 6 — Clone and run

Open **x64 Native Tools Command Prompt for VS 2022** (or any terminal where `cl.exe` is on the `PATH`):

```powershell
git clone https://github.com/trellaren/accord.git
cd accord\turbo_honda\accord

# Install Node dependencies
npm install

# Install Tauri CLI (first time only)
cargo install tauri-cli --version "^2" --locked

# Development mode
cargo tauri dev

# Release build (produces a .msi / .exe installer in src-tauri\target\release\bundle\)
cargo tauri build
```

> **PowerShell users**: the `scripts/dev.sh` and `scripts/build.sh` are bash scripts.  
> Use `cargo tauri dev` / `cargo tauri build` directly, or run them with Git Bash.

---

## Known Build Issues

### Linux

| Symptom | Cause | Fix |
|---|---|---|
| `The system library 'glib-2.0' was not found` | Missing GTK dev headers | `sudo apt install libglib2.0-dev libgtk-3-dev` |
| `Package alsa was not found` | Missing ALSA dev headers | `sudo apt install libasound2-dev` |
| `Package webkit2gtk-4.1 was not found` | WebKit headers not installed | `sudo apt install libwebkit2gtk-4.1-dev` |
| System tray icon missing | `libayatana-appindicator` not installed | `sudo apt install libayatana-appindicator3-dev` |

### Windows

| Symptom | Cause | Fix |
|---|---|---|
| `error: linker 'link.exe' not found` | MSVC build tools not installed or wrong terminal | Install **Visual Studio Build Tools** (C++ workload) and build from the *x64 Native Tools Command Prompt* |
| `error: failed to run custom build command for 'opus-sys'` | CMake or MSVC compiler not found | Install [CMake](https://cmake.org/download/) and ensure Visual Studio C++ workload is installed |
| `WebView2 not found` at runtime | WebView2 runtime not installed | Install the [WebView2 bootstrapper](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section) |
| `error[E0277]: the trait bound … NetworkBehaviour` in `p2p/mod.rs` | libp2p 0.55 derive-macro type inference regression | Known upstream issue; tracked in [#17](https://github.com/trellaren/accord/issues/17) — workaround: pin `libp2p = "0.54"` until fixed |
| mDNS discovery not working | Windows Firewall blocking UDP multicast | Add an inbound rule allowing UDP on port 5353, or temporarily disable the firewall for testing |
| Build very slow on first run | Compiling heavy crates (libp2p, sqlx, WebRTC) | Expected on first build; subsequent incremental builds are fast |

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
- [x] User identity & key management (Ed25519 keypair persisted to disk)
- [ ] Screen share support
- [ ] End-to-end encryption for text messages (noise protocol / age)
- [x] System tray integration
- [ ] Auto-update via Tauri updater plugin
