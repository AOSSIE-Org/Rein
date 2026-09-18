Instructions for AI coding agents working on Rein. Read this before making changes.

This file is the project's rules and architecture guide. Read this before modifying code or submitting pull requests.

Project overview
Rein is an open-source, cross-platform remote desktop input system and screen mirror built on WebRTC (GSoC 2026 under AOSSIE). It turns any phone, tablet, or browser into a trackpad, keyboard, and desktop screen mirror over local networks with sub-8ms latency and zero cloud dependency.

Four moving parts:

- `src/` — React 19 + TypeScript frontend UI (TanStack Start/Router, Vite 8, Tailwind CSS v4, DaisyUI, Lucide React)
- `src/server` — Node.js HTTP server & `werift` WebRTC engine (`src/server/webRTC.ts`), WebSocket signaling (`/ws`), UDP socket listener (`127.0.0.1:5004`), Koffi FFI input drivers
- `src/server/gstreamer` — GStreamer process manager (`gst-launch-1.0` with `x264enc` + `udpsink`) and platform capture providers (DXGI, X11, Wayland Portal via `dbus-next`, AVFoundation)
- `electron` — Electron main process wrapper (`electron/main.cjs`), single-instance lock (`app.requestSingleInstanceLock()`), Nitro production server launcher

Commands
Run the ones for the areas you touched. CI runs the check column; use the fix column locally so the check passes.

| Task | Check (what CI runs) | Fix |
|---|---|---|
| Biome lint & format | `npm run check` | `npm run check:fix` |
| Pre-dev auto-format | — | `npm run predev` |
| Unit tests | `npm run test` | — |
| Web production build | `npm run build` | — |
| Electron development | `npm run electron-dev` | — |
| Desktop package | `npm run dist` | — |

Code quality

Match the codebase before anything else
Before writing a new file, read the nearest existing file that does the same job and follow its structure, naming, and idioms. Consistency with existing code beats general preferences. Extend existing patterns instead of introducing new frameworks or alternative utilities.

Reuse before adding
Search before you create. Avoid creating duplicate components, drivers, or utility functions.

| Before adding a… | Search here first |
|---|---|
| Trackpad UI component / Modal | `src/components/Trackpad/`, `src/routes/settings.tsx` |
| Gesture / Touch Hook | `src/hooks/useTrackpadGesture.ts` |
| WebRTC / Connection Hook | `src/hooks/useWebRtcStream.ts`, `src/contexts/ConnectionProvider.tsx` |
| Debug & Log Context | `src/contexts/DebugContext.tsx`, `src/routes/debug.tsx` |
| Platform Input Driver | `src/server/drivers/` (`linux/`, `mac/`, `windows/`) |
| Key map translation | `src/server/drivers/keyMap.ts` |
| Screen Capture Provider | `src/server/gstreamer/captureProvider.ts` |
| HTTP Route Handler | `src/server/server.ts`, `src/server/api/apiHandlers.ts` |

Keep modules focused
One module, one job. Gesture processing belongs in `useTrackpadGesture`; WebRTC peer connection and WebSocket signaling live in `WebRTCManager` and `useWebRtcStream`; input message sanitization and 8ms throttling belong in `InputHandler`; platform FFI bindings live in `src/server/drivers/`.

Types are not optional
TypeScript strict mode is enabled. Type every export, input message payload (`InputMessage`), IPC interface, driver abstraction (`PlatformInjector`), and API contract. Do not introduce `any` types, and do not use `as` to suppress real type errors.

Comments explain why
Use brief comments to explain non-obvious implementation reasons (e.g. FFI struct layouts, SCTP `delayedSackTime: 0` tuning, or mobile keyboard sentinel characters). Do not leave commented-out code or multi-paragraph docstrings.

Rules that are not obvious from the code
These are the mistakes agents make most often in this repository:

- Never revert to dual peer connections or HTTP SSE signaling: Rein uses **`werift`** on the server with a **single `RTCPeerConnection`** per viewer session and **WebSocket signaling (`/ws`)**. Do not re-introduce dual peer connections (`videoPc`/`inputPc`) or HTTP SSE signaling.
- Touch motion must use `input-unordered`: `move`, `scroll`, `zoom`, and `touch` events MUST be sent via `input-unordered` (`maxRetransmits: 0`). Routing motion events to `input-ordered` causes head-of-line blocking and latency spikes.
- Do not modify local UDP relay port `5004`: GStreamer outputs RTP to `127.0.0.1:5004` (`RTP_HOST`, `RTP_PORT`). Changing this port requires updating `src/server/constants.ts` and `GstManager`.
- Update runtime state on config changes: API updates to `POST /api/config` MUST call `WebRTCManager.updateConfig()` so active `InputHandler` instances receive updated sensitivity/scroll inversion without restarting the server. Never write directly to `src/server-config.json` in dev mode.
- Complete loopback checks: `isLoopbackAddress()` checks for IPv4 (`127.0.0.1`), IPv6 (`::1`), and IPv4-mapped IPv6 (`::ffff:127.0.0.1`). Sensitive administration endpoints (`POST /api/auth/token`) are restricted to localhost only and return `403` to remote callers.
- Timing-safe token verification: All token lookups call `crypto.timingSafeEqual()`. Tokens persist to `tokens.json` with file permissions `0o600` (owner read/write only).
- Mobile keyboard sentinel requirement: The hidden mobile keyboard `<input>` requires `defaultValue=" "` (space sentinel) to reliably detect backspaces (`deleteContentBackward`) on mobile WebViews.
- Platform driver permissions: Linux uinput requires udev group permissions (`/etc/udev/rules.d/99-rein.rules`); macOS requires Accessibility permissions under System Settings.

Contribution workflow
- Joining the AOSSIE Discord server (`Project -> Rein` channel) is mandatory before contributing.
- Target `main` (or default branch).
- Keep pull requests tightly focused on a single feature or fix. Avoid bundling unrelated formatting changes.
- Reference issues using `#<number>` in PR titles and descriptions.

Definition of done
## Definition of done

A change is not finished until the relevant checks pass locally. At minimum, run `npm run check` and `npm run test`. If you changed the web application or production build configuration, also run `npm run build`. If you touched input drivers, gestures, or WebRTC signaling, test end-to-end via QR code scan on a mobile device or VM.
