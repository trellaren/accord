# accord

A serverless, peer-to-peer Discord-style desktop app: servers, text channels, and
party voice chat with no central server.

The app lives in [`turbo_honda/`](turbo_honda/) (Tauri v2 + Rust + React/TypeScript).
Earlier prototypes in Go/Wails (`e_honda`), Python (`gas_honda`), and Electron
(`hybrid-honda`) have been removed and remain in git history.

**Status:** pre-alpha. The UI is substantial, but text messages and voice do not
yet travel between peers. See [`docs/PLAN.md`](docs/PLAN.md) for the review of the
current code and the full rework plan.
