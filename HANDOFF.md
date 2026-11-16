# Maintainer handoff

The main process is separated into lifecycle, windows/IPC, application catalog, Windows integration and settings modules. Preload and renderer share a typed API contract. Existing interface and styling are retained.

Fixed installed application launch after catalog listing (the cached path previously had no matching name), serialized settings mutations with atomic replacement, and handled taskbar child-process spawn errors. External navigation and new windows are blocked; the local renderer and development URL remain allowed. Application paths stay in the main process instead of being included in public dock objects.

Validation: Node 22; clean dependency installation, TypeScript check, five regression tests and production build. The cached-launch regression was observed failing before the correction. Windows x64 NSIS packaging and a Windows CI artifact workflow are configured; installer/runtime validation remains separate from source checks.

Manual Windows acceptance: launch pinned and discovered apps, add/remove/reset pins, toggle shell mode and restore taskbar on exit, verify crash watchdog, restart persistence, multi-monitor positions, Wi-Fi/battery status and installed startup registration. Wi-Fi currently expects English netsh output. Signing and release publication are not configured.

Dependency maintenance: existing high-severity Electron/Vite/transitive advisories were resolved within declared version ranges. Electron Builder still brings six moderate development-only audit findings through minimatch; npm's suggested forced fix downgrades Builder, so it was not applied. Reassess upstream updates before release.

Windows GitHub CI run 43833856751 passed at 4f34202. Its unsigned x64 installer and checksum are published as v0.1.0-preview.1. Independent source review found no material issue. Interactive Windows validation remains outstanding.
