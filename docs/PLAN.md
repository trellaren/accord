# Accord — Consolidation Review & Serverless Rework Plan

Goal: **one** Accord product, in **one** stack, that does what Discord does for a
group of friends — servers, text channels, and party voice chat — with **no
server that we own or operate**. Every participant runs the same app; the app
is the infrastructure.

This document has three parts:

1. [Review](#1-review-of-the-current-repository) — what exists today and what actually works.
2. [Target design](#2-target-design) — the architecture we consolidate onto.
3. [Delivery plan](#3-delivery-plan) — milestones, exit criteria, risks, open decisions.

---

## 1. Review of the current repository

### 1.1 Four versions, one real one

| Folder | Stack | Size | State |
|---|---|---|---|
| `e_honda/` | Go + Wails + Next.js | ~1.1k lines, mostly generated Wails bindings | Wails template. No networking, chat, or voice. |
| `gas_honda/` | Python CLI (click) | ~170 lines | Command stubs; every `tools/*.py` file is empty. |
| `hybrid-honda/` | Electron + Node | ~230 lines | Window boilerplate; all CSS themes and views are empty placeholders. |
| `turbo_honda/` | **Tauri v2 (Rust) + React/TS** | **~13k lines** | The only version with real code; all feature work since February has landed here. |

**Decision: consolidate on `turbo_honda` and delete the other three.** They
contain no logic worth porting — only intent. The useful intent survives:

* `gas_honda`'s headless P2P CLI idea → the `accord-node` headless binary (§2.2).
* `hybrid-honda`'s Honda paint themes → a theming task in the frontend backlog.

They remain in git history (last commit containing them: `693a32d`).

### 1.2 What `turbo_honda` actually does today

The UI is substantial and in good shape (server rail, channels, member panel,
roles UI, profile modal, keybinds, debug window). The backend, however, is
mostly local-only. Concretely:

| Area | Finding | Evidence |
|---|---|---|
| **Text chat** | **Messages never leave the machine.** `send_message` writes to local SQLite and returns; nothing is published to GossipSub. Inbound GossipSub messages on any topic other than presence/invite are only logged. Two peers cannot chat. | `commands/channels.rs` `send_message`; `p2p/mod.rs` gossipsub `else { log::debug! }` |
| **Voice** | **Entirely stubbed.** `join()` constructs an Opus encoder/decoder and stops at a `TODO`. No capture, playback, or transport. Device lists are hard-coded. The Opus wrapper and its tests are real. | `voip/mod.rs` |
| **Video / screen share** | Stubs that flip booleans; the frontend calls `getDisplayMedia` but nothing is sent. | `voip/mod.rs`, `VoiceChannel.tsx` |
| **"E2E encryption"** | Not end-to-end. The key is derived from the *local* private key, so only the author's own machine can ever decrypt — it is at-rest encryption of your own outbox. It also uses `age` *passphrase* mode, which runs scrypt per message (on the order of a second each), so loading 50 messages is very slow. The README roadmap marks this as done. | `crypto.rs`, `commands/channels.rs` `get_messages` |
| **Servers / membership** | Joining a server creates a local row only. Channels, members, roles are never replicated; a joiner sees an empty server. | `db.rs` `join_server_from_invite` |
| **Roles & permissions** | Stored and editable, but never checked anywhere — no code path enforces them, locally or across peers. | no permission checks in `src-tauri/src` |
| **Invites** | Sent on one global `accord/server-invite` topic, so every connected peer receives every invite. Delivery depends on exact multiaddr string equality between the dialled address and the connection's remote address, which is fragile. | `p2p/mod.rs` `ConnectionEstablished` |
| **Connectivity** | TCP on IPv4 only; mDNS for LAN. No QUIC, relay, hole punching, AutoNAT, UPnP, or DHT. Peers on different home networks generally cannot connect. | `p2p/mod.rs` `SwarmBuilder` |
| **Identity** | Ed25519 key persisted as a plain file; loaded twice at startup. Stable PeerId works. | `p2p/identity.rs`, `lib.rs` |
| **Frontend ↔ backend** | Polling with `setInterval` (invites, channel members, logs) instead of Tauri events. `lib/tauri.ts` is hand-maintained. | `App.tsx`, `VoiceChannel.tsx` |
| **Hardening** | `csp: null`; updater `pubkey` empty and endpoint is a placeholder; `channels/mod.rs` is dead code. | `tauri.conf.json` |
| **Process** | No CI. Builds have only been checked by hand (README documents a libp2p 0.55 derive regression). | no `.github/workflows` |

**Bottom line:** the shell (Tauri app, UI, SQLite, identity) is a solid
foundation; the core (networking, sync, voice, crypto) needs to be rebuilt
rather than patched, because the missing pieces — replication, NAT traversal,
a real-time media path, group keys — are the product.

---

## 2. Target design

### 2.1 Scope

**v1 must have**

* Identity: a keypair is your account; display name + avatar.
* Servers with text channels and voice channels; invite links.
* Text: send, edit, delete, reply, history sync, unread state, mentions, offline catch-up.
* Party voice: join/leave, mute/deafen, push-to-talk / voice activity, device selection,
  per-user volume, speaking indicators, ping display (issue #27).
* Roles and permissions that every peer enforces.
* End-to-end encryption for text and voice (issue #17).
* Windows and Linux only.

**Out of v1** (kept off the critical path, UI removed until built): video, screen
share, bots/integrations, mobile, macOS, multi-device accounts, more than **15 people in a
voice channel** (v1 hard cap), history for members who join later.

### 2.2 Stack and repository layout

Single stack: **Rust core + Tauri v2 shell + React/TypeScript UI.**

```
accord/
├── Cargo.toml                 # workspace
├── crates/
│   ├── accord-core/           # identity, op log, sync, permissions, crypto — no Tauri, no audio
│   ├── accord-net/            # libp2p swarm, connectivity, protocols
│   ├── accord-voice/          # capture → DSP → Opus → RTP/SRTP → jitter buffer → playback
│   └── accord-node/           # headless binary: CLI client, test harness, optional relay/archivist
├── app/
│   ├── src-tauri/             # thin Tauri layer: commands + events over the crates
│   └── src/                   # React UI (migrated from turbo_honda/accord/src)
├── docs/
└── .github/workflows/
```

Why split crates: everything except the UI and the audio device code becomes
testable headless, so integration tests can spin up 5 in-process nodes and assert
that they converge.

### 2.3 What "serverless" means — and what it can't avoid

There is no Accord-operated server. But the internet has NATs, and some pairs of
peers (both behind symmetric/CGNAT) cannot connect directly. The plan is honest
about this:

| Need | Serverless approach | Fallback |
|---|---|---|
| Find a server's members | Invite link carries server id, inviter PeerId, and inviter's last known addresses + relay addresses. Members cache each other's addresses. A private Kademlia DHT (`/accord/kad/1`) among Accord peers resolves PeerId → addresses. | Opt-in: use the public libp2p/IPFS DHT for peer routing (reveals IP + PeerId publicly — privacy trade-off, off by default). |
| LAN | mDNS (keep). | — |
| NAT traversal | QUIC + TCP transports, AutoNAT v2, UPnP/NAT-PMP, DCUtR hole punching. | — |
| Peers that still can't connect | **Any reachable member automatically acts as a Circuit Relay v2** for its server, with bandwidth limits. | `accord-node` in relay mode: anyone can run it on a home box with a port forward or a small VPS. It is a peer, holds no authority, and sees only ciphertext. |
| Media ICE | ICE host + server-reflexive candidates. Reflexive addresses come first from other Accord peers (libp2p observed addresses), then from public STUN servers (on by default, user-disableable — see §2.3.1). | Relay through a member / `accord-node` (TURN-like, encrypted media). |
| Offline delivery | Store-and-forward: every member keeps the server's log and serves it to whoever comes online. | Optional always-on `accord-node --archivist` per community. |

#### 2.3.1 Third-party infrastructure (decided)

* **Public STUN — on by default, can be disabled in settings.** A STUN server only
  tells a client its public IP:port; it learns the user's IP and roughly when
  they join calls, never content or who they talk to. Accord peers also answer
  this for each other, so STUN improves the direct-connection success rate but
  isn't required.
* **Public IPFS DHT — off by default, opt-in per user.** It would let members find
  each other after everyone's dynamic IPs change, but it publishes the user's
  PeerId → IP mapping where anyone can look it up. The recommended alternative is a
  community-run `accord-node` at a stable address, or a fresh invite link shared out of band.
* **Inherent to P2P:** every directly connected peer sees your IP. A relay-only
  privacy mode is on the post-v1 list.

Rule: **nothing in the protocol requires a well-known host.** Every role
(relay, archivist, voice forwarder) can be filled by any member and is chosen
dynamically.

### 2.4 Networking (`accord-net`)

* libp2p (pin a version known to compile; CI catches regressions):
  transports `quic` + `tcp`/`noise`/`yamux`; behaviours `identify`, `ping`,
  `mdns`, `kad`, `autonat`, `relay` (client + server), `dcutr`, `upnp`,
  `gossipsub`, `request-response`.
* **One GossipSub topic per server** — `accord/s/<blake3(server_id)>` — for live
  propagation of new ops. Validation mode on; ops are verified (signature,
  permissions) *before* being forwarded, and invalid senders are scored down.
* **Request-response protocols**
  * `/accord/sync/1` — op-log reconciliation (§2.5).
  * `/accord/invite/1` — direct, addressed invite delivery (replaces the global invite topic).
  * `/accord/voice-signal/1` — SDP/ICE exchange for voice sessions.
* Ping RTTs exposed to the UI (ping icon, issue #27).

### 2.5 Text and server state: a signed operation log

Everything a server "is" — its channels, roles, members, and messages — is
derived from a **log of signed operations** that every member replicates.

```
Op {
  id:       blake3(canonical bytes)
  server:   ServerId                 // = id of the genesis op
  author:   Ed25519 public key
  hlc:      hybrid logical clock     // causal + wall-clock ordering
  parents:  [OpId]                   // DAG heads the author had seen
  body:     Control(...) | Message(ciphertext)
  sig:      Ed25519 signature
}
```

* **Genesis op** is signed by the creator; the server id is its hash, so the
  owner is cryptographically the root of trust.
* **Control ops**: `CreateChannel`, `RenameChannel`, `DeleteChannel`,
  `CreateRole`, `GrantRole`, `SetChannelPermission`, `AddMember` (via invite
  redemption), `RemoveMember`, `Ban`, `SetServerProfile`, `SetUserProfile`.
* **Message ops**: `Post`, `Edit`, `Delete` (tombstone), `React`, per channel; body is
  E2E-encrypted (§2.7).
* **Validation:** every peer replays the DAG in a deterministic topological
  order (HLC, then op id) and checks each op against the permission state
  *at that point*. Invalid ops are rejected and never forwarded. This is what
  turns today's decorative roles into enforced roles.
* **Conflicts** resolve deterministically: removal/ban wins over concurrent
  grant; last-writer-wins (by HLC, then id) for renames and profiles.
* **Sync:** on connect, peers exchange DAG heads per server; the side that is
  behind requests missing ops by id, walking parents. Channels support
  "ops since HLC" queries so the UI can backfill recent history first. Range-based
  set reconciliation is a later optimisation once logs get large.
* **Storage:** SQLite via `sqlx` with real migrations; an `ops` table is the
  source of truth, and `channels`/`members`/`roles`/`messages` become
  materialised views rebuilt from it. Much of today's `db.rs` query code maps
  onto the views.

Invite links: `accord://join/<server_id>#<invite_secret>@<peer_id>/<addrs...>`.
An admin creates a `CreateInvite` op carrying `hash(invite_secret)`, an expiry, and a use limit;
the joiner proves knowledge of the secret to any online member, who then
publishes `AddMember`.

### 2.6 Party voice (`accord-voice`)

**Media path (native Rust, same on every OS):**

```
cpal capture → resample to 48 kHz (rubato) → APM: echo cancel / noise suppress / AGC
  (webrtc-audio-processing) → VAD / push-to-talk gate → Opus mono 20 ms, ~32 kbps,
  in-band FEC + DTX → per-frame E2E encryption (SFrame-style, §2.7) → RTP over
  WebRTC (ICE + DTLS-SRTP, via str0m) → peers
peers → SRTP → decrypt → adaptive jitter buffer + packet-loss concealment → Opus decode
  → per-user volume → mix → cpal playback
```

**Why not WebRTC in the WebView?** It would be less code, but Tauri on Linux
uses WebKitGTK, where WebRTC is not reliably available in distro builds; Linux
is a release target. Doing media in Rust gives one behaviour on every platform.
This is the riskiest choice in the plan, so it has an explicit decision gate
(Milestone 3): if the native pipeline isn't hitting quality targets, fall back to
an Electron shell, which ships Chromium's WebRTC on every OS, and keep the same
Rust core as a sidecar.

**Topology:**

* **v1: full mesh, hard cap of 15 participants per voice channel.** Each speaker
  encodes once and sends the same encrypted frame to every peer: ≈ 14 × 40 kbps ≈
  560 kbps upload while speaking, near zero when silent (DTX). Pairs that can't
  connect directly are relayed through a reachable member.
* **Post-v1: elected forwarding host** for larger channels (rest of issue #27). One participant
  receives everyone's frames and forwards only the active speakers (top 3 by
  audio level) to each listener. The host is picked by measured RTT/bandwidth
  and reachability, with an admin-pinned preferred host option, and is
  re-evaluated periodically with hysteresis so it doesn't flap. Because frames
  are E2E-encrypted, the host forwards bytes it cannot listen to.
* Presence ("who is in this voice channel") rides the server's GossipSub topic
  as ephemeral (non-logged) messages with heartbeats.

**Targets:** mouth-to-ear < 150 ms on LAN, < 250 ms typical internet; intelligible at
10 % packet loss; < 5 % CPU on a mid-range laptop for a 5-person call.

### 2.7 Security and identity

* **Identity:** Ed25519 key = account. Private key stored in the OS keychain
  (`keyring` crate) instead of a plain file; exportable as a recovery phrase.
  An X25519 key for key agreement, signed by the identity key, is published in a
  `SetUserProfile` op.
* **Text E2EE (closes #17 properly):** Sender Keys per channel, per epoch. Each member
  generates a sender chain key and distributes it to every other member,
  encrypted pairwise (HPKE to their X25519 key). Messages are encrypted with
  XChaCha20-Poly1305 using a ratcheted message key, so peers that relay or store
  ops can't read them. A `RemoveMember` or `Ban` triggers a new epoch, so the removed
  user can't read anything sent afterwards. **v1: new members only see messages
  sent after they join** (past-epoch keys are never shared); a server option to
  share history may come post-v1.
  *Later:* migrate to MLS (`openmls`) once the op DAG gives it the ordering it needs.
* **Voice E2EE:** each speaker encrypts every Opus frame with their per-epoch
  voice key (SFrame, RFC 9605) before RTP; DTLS-SRTP adds hop-by-hop protection.
  Forwarding hosts cannot listen.
* **At rest:** SQLite encrypted (SQLCipher) with a key held in the keychain.
  This replaces today's per-message `age`/scrypt scheme and the false "E2E" label.
* **Hardening:** strict Tauri CSP; minimal capabilities; signed updater with a real
  `pubkey`; rate limits and GossipSub peer scoring against spam; size limits on
  every op and protocol message.

### 2.8 Frontend

Keep the React + Zustand UI and most components. Changes:

* Replace all polling with Tauri events emitted by the core (`op-applied`,
  `presence-changed`, `voice-state`, `peer-rtt`).
* Generate TypeScript bindings from Rust command signatures (`tauri-specta`) in place of the
  hand-maintained `lib/tauri.ts`.
* Remove the video/screen-share UI until those features exist.
* New: invite-link handling (`accord://` deep link), connection-status indicator
  (direct / hole-punched / relayed), per-user volume, speaking rings, unread badges.
* Backlog: Honda paint themes from `hybrid-honda`.

### 2.9 Testing and CI

* **Unit:** op validation, permission evaluation, conflict resolution, crypto
  round-trips, Opus/jitter buffer (keep the existing codec tests).
* **Property tests (`proptest`):** delivering the same op set to N nodes in any
  order and with any partition always converges to identical state.
* **Multi-node integration:** 3–10 `accord-core` nodes in one process over
  libp2p's memory transport; offline/online churn; member removal and rekey.
* **NAT lab (nightly):** Docker network namespaces with two NATed peers and one
  relay; asserts hole punch, relay fallback, and a voice call completing.
* **Voice quality:** loopback harness with recorded speech, injected loss and jitter;
  measures latency and flags regressions.
* **CI (GitHub Actions):** `cargo fmt`, `clippy -D warnings`, `cargo test` on
  Ubuntu + Windows (the only release targets); `tsc` + `vite build`; Tauri bundles on tags.

---

## 3. Delivery plan

Each milestone ends with a demo-able build and passing CI. Sizes are relative
(S < M < L) rather than dates.

### M0 — Consolidate (S)

* Delete `e_honda/`, `gas_honda/`, `hybrid-honda/`. *(Done in this PR.)*
* Restructure into the workspace layout of §2.2; move the UI to `app/src`.
* Remove dead code (`channels/mod.rs`) and stubbed video/screen-share commands.
* Add CI; fix whatever it surfaces; pin libp2p to a version that builds.
* Rewrite the README to describe what actually works.

**Exit:** a clean checkout builds and tests green on Ubuntu and Windows CI.

### M1 — Connectivity (M)

* Rebuild the swarm per §2.4: QUIC + TCP, AutoNAT, UPnP, relay client/server, DCUtR,
  Kademlia, mDNS, request-response scaffolding.
* `accord-node` CLI: `id`, `listen`, `dial`, `relay`, `status`.
* Connection status surfaced in UI; ping/RTT per peer (#27 ping icon).

**Exit:** two peers on different home networks (no port forwarding) connect,
directly via hole punch or via a third peer's relay. NAT lab green.

### M2 — Servers and text (L)

* Op log, HLC, signing, validation, materialised views, SQLite migrations.
* Genesis/server creation, invite links and redemption, channels, roles, permissions
  enforced.
* Messages: post/edit/delete/reply/react; live via GossipSub; backfill via `/accord/sync/1`.
* Frontend on events; unread state; deep links.
* Migration of existing local data: none — pre-release; old DBs are discarded.

**Exit:** three peers, one offline during a conversation, converge on identical
history when it returns; a non-admin's `CreateChannel` is rejected by all peers.

### M3 — Party voice (L) — includes the stack decision gate

* 2-peer call first: capture → APM → Opus → str0m → jitter buffer → playback.
* Then mesh up to the 15-person cap; presence; mute/deafen; PTT / VAD (wire existing keybinds);
  device selection; per-user volume; speaking indicators.
* **Gate:** latency, loss-resilience and CPU targets of §2.6 met on Windows and
  Linux. If not, decide on the Electron fallback before continuing.

**Exit:** a 15-person call across mixed networks for 30 minutes with no
dropouts that last more than 1 s; a 16th join is refused with a clear message.

### M4 — End-to-end security (M)

* Sender Keys for text; SFrame for voice; epoch rotation on remove/ban.
* Keychain storage, SQLCipher, recovery phrase export/import.
* CSP, capabilities, op size limits, GossipSub scoring.

**Exit:** an external reviewer confirms that a removed member and a relaying
non-member can't read text or hear voice. Closes #17.

### M5 — Hosting and release (S–M)

* `accord-node --archivist` and `--relay` packaging (systemd unit, Docker image).
* Signed auto-updates, Windows (MSI/NSIS) and Linux (AppImage/.deb) installers,
  crash/log export, onboarding polish.

**Exit:** v1.0 tagged.

### Post-v1

Elected forwarding host for voice channels above 15 (rest of #27); video and screen
share (same RTP/SFrame path); optional history sharing for new members; relay-only
privacy mode; MLS; multi-device; macOS; mobile; large-server log compaction and
range-based reconciliation.

### 3.1 Keep / rewrite / delete map for `turbo_honda`

| Module | Action |
|---|---|
| React components, store, keybinds, CSS | **Keep**, move to `app/src`, switch to events |
| `p2p/identity.rs` | **Keep** logic, move key to keychain |
| `voip/codec.rs` + tests | **Keep**, adjust to mono/FEC/DTX |
| `db.rs` | **Rework** into op store + materialised views with migrations |
| `p2p/mod.rs` | **Rewrite** (connectivity, per-server topics, protocols) |
| `voip/mod.rs`, `commands/video.rs` | **Rewrite** voice; **delete** video until post-v1 |
| `crypto.rs` | **Replace** (Sender Keys / SFrame / SQLCipher) |
| `commands/*` | **Thin out** to call the crates; generate TS bindings |
| `channels/mod.rs` | **Delete** (dead) |
| `logger.rs`, debug window, tray | **Keep** |

### 3.2 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Native audio pipeline quality (echo cancellation, jitter) | Voice is the headline feature | Mature components (WebRTC APM, Opus, str0m); quality harness from day one; M3 gate with Electron fallback |
| `webrtc-audio-processing` C++ build on Windows | Build friction | Vendor/prebuild in CI early in M3; Speex DSP as a lesser fallback |
| Unreachable peer pairs | Some users can't join calls | Member relays, `accord-node` relay, clear "relayed" UI so users understand |
| libp2p API churn | Breakage on upgrade | Pin versions; CI; upgrade deliberately |
| Op-log growth in busy servers | Slow sync, disk use | Per-channel backfill-first; snapshots + compaction post-v1 |
| Permission edge cases under concurrency | Security holes | Deterministic replay rule, property tests, M4 review |

### 3.3 Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Media stack | Native Rust voice pipeline; Electron as the fallback at the M3 gate. |
| 2 | Third-party infrastructure | Public STUN on by default (can be disabled); public IPFS DHT off by default, opt-in (§2.3.1). |
| 3 | v1 voice size | Hard cap of 15, full mesh. Forwarding host is post-v1. |
| 4 | History for new members | Not in v1: members see only messages sent after they join. |
| 5 | Platforms | Windows and Linux only. |
