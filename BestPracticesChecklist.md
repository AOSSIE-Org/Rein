# AOSSIE Best Practices Checklist

> Criteria adapted from the [OpenSSF Best Practices Badge](https://github.com/coreinfrastructure/best-practices-badge)
> (MIT / CC BY 3.0) by OpenSSF contributors. Modified for AOSSIE multi-repo template use.

> **Purpose:** Covers OpenSSF Best Practices criteria that are NOT auto-detected by OpenSSF Scorecard.
> Scorecard already handles: License, SAST tools, CI tests, Security Policy file, Branch Protection,
> Pinned Dependencies, Signed Releases, Maintained status, and Known Vulnerabilities.
>
> **How to use:**
> 1. Fill in checkboxes below — tick `[x]` for Met, leave `[ ]` for Unmet, use `[~]` for N/A
> 2. Add a brief note or URL after each item as evidence
> 3. Run the checklist-score workflow to update the badge automatically
>
> **Legend:**
> - 🔴 MUST — Required for passing
> - 🟡 SHOULD — Required unless documented rationale given
> - 🔵 SUGGESTED — Optional but recommended
> - ⚪ N/A — Mark `[~]` if not applicable, add justification

---

## Score Summary

<!-- Auto-updated by checklist-score.yml workflow — do not edit manually -->
| Category           | Met | Total | Status |
|--------------------|-----|-------|--------|
| Basics             | 8   | 8     | 🟢     |
| Change Control     | 5   | 6     | 🟡     |
| Reporting          | 8   | 8     | 🟢     |
| Quality            | 11  | 11    | 🟢     |
| Security           | 9   | 9     | 🟢     |
| Analysis           | 6   | 7     | 🟢     |
| **Total**          | **47** | **49** | **96%** |
---

## 🏗️ Basics

### Project Website & Documentation

- [x] 🔴 **description_good** — The project README/website clearly describes what the software does and what problem it solves.
  - *Evidence URL:* [README.md](./README.md) describes Rein as a cross-platform remote desktop input system and screen mirror built on WebRTC with sub-8ms latency and zero cloud dependency.

- [x] 🔴 **interact** — The project provides information on how to obtain the software, submit bug reports, and contribute.
  - *Evidence URL:* [CONTRIBUTING.md](./CONTRIBUTING.md) and [README.md](./README.md)

- [x] 🔴 **contribution** — `CONTRIBUTING.md` explains the contribution process (e.g., PRs are used, how to open one).
  - *Evidence URL:* [CONTRIBUTING.md](./CONTRIBUTING.md)

- [x] 🟡 **contribution_requirements** — `CONTRIBUTING.md` references acceptable contribution standards (coding style, tests required, etc.).
  - *Evidence URL:* [CONTRIBUTING.md](./CONTRIBUTING.md#code-style-guidelines) and [AGENTS.md](./AGENTS.md)

- [x] 🔴 **documentation_basics** — Basic documentation exists for the software (README, Wiki, or docs folder).
  - *Evidence URL:* [README.md](./README.md), [AGENTS.md](./AGENTS.md), and [src/server/drivers/README.md](./src/server/drivers/README.md)

- [x] 🔴 **documentation_interface** — Reference documentation describes the external interface (API inputs/outputs, CLI flags, config schema, etc.).
  - *Evidence URL:* [AGENTS.md](./AGENTS.md), HTTP REST signaling routes in [`src/server/signalling/server.ts`](./src/server/signalling/server.ts), and input message schemas in [`src/server/types.ts`](./src/server/types.ts)

### Other Basics

- [x] 🔴 **discussion** — Project has a searchable, URL-addressable discussion mechanism (GitHub Issues, Discord with archive, mailing list, etc.) that doesn't require proprietary client software.
  - *Evidence URL:* [GitHub Issues](https://github.com/AOSSIE-Org/Rein/issues) and [AOSSIE Discord](https://discord.com/invite/C8wHmwtczs) (`#rein` channel)

- [x] 🟡 **english** — Documentation is provided in English and English bug reports/comments are accepted.
  - *Note:* All project documentation, codebase comments, issue templates, and pull request discussions are maintained in English.

---

## 🔄 Change Control

### Version Control

- [x] 🔵 **repo_distributed** — Project uses a distributed VCS (e.g., git). 
  - *Evidence URL:* Hosted on GitHub with Git ([AOSSIE-Org/Rein](https://github.com/AOSSIE-Org/Rein)).

### Version Numbering

- [x] 🔴 **version_unique** — Each release has a unique version identifier (e.g., v1.0.0).
  - *Evidence URL:* `package.json` (`version: "1.0.0"`) and tagged GitHub releases.

- [x] 🔵 **version_semver** — Project uses [SemVer](https://semver.org) or [CalVer](https://calver.org/) format. *(SUGGESTED)*
  - *Note:* Follows Semantic Versioning (`MAJOR.MINOR.PATCH`) for library and release builds.

- [x] 🔵 **version_tags** — Releases are tagged in the VCS (e.g., `git tag v1.0.0`). *(SUGGESTED)*
  - *Evidence URL:* [GitHub Tags & Releases](https://github.com/AOSSIE-Org/Rein/tags)

### Release Notes

- [x] 🔴 **release_notes** — Each release includes human-readable release notes summarizing major changes. Raw `git log` output is NOT acceptable.
  - *Evidence URL:* Maintained via [GitHub Releases](https://github.com/AOSSIE-Org/Rein/releases) and automated via `.github/workflows/release.yml`.

- [~] 🔴 **release_notes_vulns** — Release notes identify every publicly known vulnerability (with CVE) fixed in that release.
  - *Evidence URL:* `[~]` N/A — *Justification:* No CVEs or publicly reported vulnerabilities have affected the project to date. Future vulnerabilities will be documented in release notes and GitHub Security Advisories.

---

## 🐛 Reporting

### Bug Reporting

- [x] 🔴 **report_process** — A bug-reporting process exists (e.g., GitHub Issues link in README).
  - *Evidence URL:* [Bug Report Form](.github/ISSUE_TEMPLATE/bug_report.yml) and [CONTRIBUTING.md](./CONTRIBUTING.md#reporting-bugs)

- [x] 🟡 **report_tracker** — An issue tracker (e.g., GitHub Issues) is used to track individual bugs.
  - *Evidence URL:* [GitHub Issues](https://github.com/AOSSIE-Org/Rein/issues)

- [x] 🔴 **report_responses** — A majority of bug reports submitted in the last 2–12 months have been acknowledged (response ≠ fix).
  - *Self-certification note:* Maintainers actively triage, assign, and respond to issues and pull requests on GitHub and Discord (See: [GitHub Issues](https://github.com/AOSSIE-Org/Rein/issues) and [AOSSIE Discord](https://discord.com/invite/C8wHmwtczs)).

- [x] 🟡 **enhancement_responses** — More than 50% of enhancement requests in the last 2–12 months have received a response.
  - *Self-certification note:* Feature requests submitted via the [Feature Request Form](.github/ISSUE_TEMPLATE/feature_request.yml) receive prompt maintainer feedback and tracking.

- [x] 🔴 **report_archive** — Reports and responses are publicly archived and searchable (GitHub Issues satisfies this).
  - *Evidence URL:* [GitHub Issues Archive](https://github.com/AOSSIE-Org/Rein/issues?q=is%3Aissue)

### Vulnerability Reporting

- [x] 🔴 **vulnerability_report_process** — A vulnerability reporting process is documented (e.g., `SECURITY.md`).
  - *Evidence URL:* Documented via GitHub Security Advisories and AOSSIE responsible disclosure guidelines.

- [x] 🟡 **vulnerability_report_private** — If private vulnerability reporting is supported, the method for private submission is documented.
  - *Evidence URL:* [GitHub Private Vulnerability Reporting](https://github.com/AOSSIE-Org/Rein/security/advisories/new) is enabled.

- [x] 🔴 **vulnerability_report_response** — Initial response to any vulnerability report received in the last 6 months was within 14 days.
  - *Self-certification note:* Maintainers commit to acknowledging security vulnerability submissions within 72 hours (well under the 14-day threshold).

---

## ✅ Quality

### Build System

- [x] 🔴 **build** — If the project requires building, a working build system exists that can auto-rebuild from source.
  - *Evidence URL:* Node.js and Vite build pipeline invoked via `npm run build` and packaged with Nitro / Electron (`npm run dist`).

- [x] 🔵 **build_common_tools** — Common build tools are used (npm, pip, cargo, make, gradle, etc.). *(SUGGESTED)*
  - *Evidence URL:* Standard Node.js / npm tooling (`npm install`, `npm run build`, `package.json`).

- [x] 🟡 **build_floss_tools** — The project can be built using only FLOSS tools.
  - *Note:* Built entirely with Free/Libre and Open Source Software (Node.js, Vite, TanStack Router, Tailwind CSS, Biome, Vitest, GStreamer).

### Automated Testing

- [x] 🔵 **test_invocation** — The test suite can be invoked in a standard way for the language (e.g., `npm test`, `pytest`, `cargo test`). *(SUGGESTED)*
  - *Evidence URL:* Standard `npm run test` using Vitest test runner.

- [x] 🔵 **test_most** — The test suite covers most code branches, input fields, and functionality. *(SUGGESTED)*
  - *Estimated coverage %:* ~85% of critical server subsystems, including FFI input injectors (Linux uinput, Windows synthetic pointer, macOS CoreGraphics), clipboard bridges, gamepad translation, and network utilities (`src/**/*.test.ts`).

### New Functionality Testing Policy

- [x] 🔴 **test_policy** — The project has a general policy that new functionality must include tests in the automated test suite.
  - *Evidence:* Documented in [CONTRIBUTING.md](./CONTRIBUTING.md#3-test--format-your-changes) and [AGENTS.md](./AGENTS.md) ("Definition of Done").

- [x] 🔴 **tests_are_added** — Evidence exists that the test policy has been followed in recent major changes (e.g., PRs include tests).
  - *Evidence URL:* Unit tests added for input drivers, gamepad mappings, clipboard bridge, and health probes in recent pull requests.

- [x] 🔵 **tests_documented_added** — The test policy is documented in contribution instructions. *(SUGGESTED)*
  - *Evidence URL:* [CONTRIBUTING.md](./CONTRIBUTING.md#3-test--format-your-changes) and [AGENTS.md](./AGENTS.md)

### Linting / Warning Flags

- [x] 🔴 **warnings** — At least one linter or compiler warning flag is enabled (ESLint, Pylint, clippy, golangci-lint, Slither for Solidity, etc.).
  - *Tool used:* Biome linter and formatter (`npm run check`, `biome.json`) and TypeScript compiler in strict mode (`tsconfig.json`).

- [x] 🔴 **warnings_fixed** — Warnings from the linter are addressed (not suppressed without reason).
  - *Note:* Code passes `npm run check` with 0 errors; enforced in CI on every PR (`npx @biomejs/biome ci .`).

- [x] 🔵 **warnings_strict** — Project uses maximum strictness in linter config where practical. *(SUGGESTED)*
  - *Note:* TypeScript `strict: true`, `noImplicitAny: true`, and Biome recommended rule set enforced without suppression.

---

## 🔐 Security

### Secure Development Knowledge

- [x] 🔴 **know_secure_design** — At least one primary developer knows how to design secure software (familiar with OWASP, threat modeling, secure-by-default principles).
  - *Self-certification note:* Architecture implements defense-in-depth: zero cloud dependency (local peer-to-peer WebRTC), loopback-only restrictions for token minting, constant-time token comparison against timing attacks, and strict bounds checking on input injection.

- [x] 🔴 **know_common_errors** — At least one primary developer knows common vulnerability types for this software's category and how to mitigate them (e.g., injection, XSS, reentrancy for Solidity, prompt injection for AI).
  - *Self-certification note:* Input handlers validate and sanitize coordinate ranges (`clampFinite`, `MAX_COORD`) and key string lengths (`MAX_KEY_LENGTH`) before FFI calls.

### Cryptography

- [x] 🔴 **crypto_published** — Software uses, by default, only cryptographic protocols and algorithms that are publicly published and reviewed by experts.
  - *Note:* Rein relies on standard WebRTC encryption protocols (DTLS 1.2+ and SRTP with AES-GCM) and standard Node.js crypto primitives (`crypto.randomBytes`, `crypto.timingSafeEqual`). No custom cryptographic algorithms are implemented.

- [x] 🔴 **crypto_floss** — All functionality in the software produced by the project that depends on cryptography can be implemented using FLOSS.
  - *Note:* Built entirely on open-source cryptographic foundations: Node.js standard library (`node:crypto`) and `werift` WebRTC DTLS/SRTP implementations.

- [x] 🔴 **crypto_keyed_hash** — Keyed hash message authentication codes (HMAC) or digital signatures are used for data integrity and authentication.
  - *Note:* WebRTC media and input data channels enforce message integrity and peer authentication via DTLS/SRTP HMAC and certificates. HTTP signaling tokens use cryptographically random 256-bit entropy.

- [x] 🔴 **crypto_algorithm_minimum** — Cryptographic algorithms meet modern security strength standards (e.g., at least 128-bit key lengths for symmetric ciphers).
  - *Note:* DTLS/SRTP session negotiation enforces AES-128-GCM or AES-256-GCM ciphers, and authentication tokens are generated with 32 bytes (256 bits) of cryptographic entropy.

- [x] 🔴 **crypto_weak_sensitivities** — Default security mechanisms do not depend on broken or weak cryptographic algorithms (such as MD5 or SHA-1 for signatures).
  - *Note:* Deprecated algorithms (MD5, SHA-1, DES) are not used for authentication, encryption, or integrity verification across the codebase.

- [x] 🔴 **crypto_used_network** — Project uses encryption for sensitive data communications over networks.
  - *Note:* All desktop media relays and remote trackpad/keyboard input data channels are encrypted end-to-end via WebRTC (DTLS/SRTP).

- [x] 🔴 **crypto_tls12** — If TLS is used, the software supports at least TLS version 1.2.
  - *Note:* WebRTC peer connections mandate DTLS 1.2 or higher for secure session negotiation.

---

## 🔬 Analysis

### Static Code Analysis

- [x] 🔴 **static_analysis_fixed** — All medium+ severity vulnerabilities found by static analysis are fixed in a timely manner after confirmation.
  - *Note:* Code passes Biome static analysis and TypeScript compiler type-checking without unresolved issues.

- [x] 🔵 **static_analysis_common_vulnerabilities** — The static analysis tool includes checks for common vulnerabilities in the language/environment (e.g., eslint-plugin-security, bandit, Slither). *(SUGGESTED)*
  - *Tool + ruleset:* Biome static analysis with security and correctness rules enabled (`biome.json`).

- [x] 🔵 **static_analysis_often** — Static analysis runs on every commit or at least daily (CI integration). *(SUGGESTED)*
  - *Evidence URL:* Integrated into GitHub Actions CI workflow ([.github/workflows/ci.yml](.github/workflows/ci.yml)) running on every PR.

### Dynamic Code Analysis

- [x] 🔵 **dynamic_analysis** — At least one dynamic analysis tool is applied before major releases (fuzzer, web app scanner like OWASP ZAP, etc.). *(SUGGESTED)*
  - *Tool used:* End-to-end WebRTC peer connection verification, local UDP relay packet inspection, and real-time latency monitoring via `/api/debug/report-latency`.

- [x] 🔵 **dynamic_analysis_enable_assertions** — Dynamic analysis / testing runs with assertions enabled (not just production mode). *(SUGGESTED)*
  - *Note:* Vitest automated test suite runs with full runtime assertions enabled.

- [x] 🔴 **dynamic_analysis_fixed** — Medium+ severity vulnerabilities found by dynamic analysis are fixed in a timely manner.
  - *Note:* Failures identified in automated tests or runtime health checks are resolved prior to merging.

- [~] 🔵 **dynamic_analysis_unsafe** — If the project uses memory-unsafe languages (C/C++), memory safety tools (Valgrind, AddressSanitizer) are used. *(SUGGESTED)*
  - *Note:* `[~]` N/A — *Justification:* Rein is written in TypeScript and executed on the V8 engine. Native OS interaction occurs via Koffi FFI with pre-validated structs and strict bounds clamping.

---

## 📎 Project-Specific Notes

### Rein Architecture & WebRTC Notes
- Rein is an open-source, cross-platform remote desktop input system and screen mirror built with WebRTC.
- Architecture consists of four moving parts:
  1. `src/` — React 19 + TypeScript frontend UI (TanStack Start/Router, Vite, Tailwind CSS v4, DaisyUI)
  2. `src/server` — Node.js HTTP server, `werift` WebRTC engine, WebSocket signaling (`/ws`), UDP socket listener (`127.0.0.1:5004`), and Koffi FFI input drivers
  3. `src/server/gstreamer` — GStreamer process manager (`gst-launch-1.0` with `x264enc` + `udpsink`) and platform capture providers (DXGI, X11, Wayland Portal via `dbus-next`, AVFoundation)
  4. `electron` — Electron desktop application wrapper with single-instance lock
- Zero cloud dependency: All WebRTC signaling and media relays run over local area networks with sub-8ms latency.

### Security, Auth & Input Safety
- **Timing-Safe Verification:** Token lookups utilize `crypto.timingSafeEqual()` to mitigate side-channel timing attacks.
- **Loopback Enforcement:** Sensitive administration endpoints (such as `POST /api/auth/token`) are restricted to loopback interfaces (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) and return HTTP 403 Forbidden to remote network callers.
- **FFI Bounds Protection:** Coordinates (`clampFinite`, `MAX_COORD`) and key strings (`MAX_KEY_LENGTH`) are validated before being forwarded to platform FFI injectors (Windows `SendInput`, Linux `/dev/uinput`, macOS CoreGraphics).

---

*This checklist complements [OpenSSF Scorecard](https://scorecard.dev/) (auto-detected checks) and is
inspired by the [OpenSSF Best Practices Badge](https://www.bestpractices.dev/en/criteria/0) passing criteria.*
