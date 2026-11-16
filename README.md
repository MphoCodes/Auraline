# Auraline

A macOS-inspired desktop launcher for Windows, built with Electron, React and TypeScript. Auraline combines a dock, menu bar and searchable application launcher with an optional desktop shell mode.

## Features

- Pin local applications and shortcuts to the dock, launch them, remove pins or restore the default dock.
- Discover applications from the current user's and shared Windows Start Menu folders.
- Switch between a normal window and transparent menu-bar/dock surfaces.
- Show connectivity, Wi-Fi and battery status; optionally start at login in packaged builds.

## Development

Use Node.js 22.18 or newer within the Node 22 release line, and npm. Windows is the target platform.

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm test
npm run build
# Run the compiled application:
npm start
```

`npm run check` runs the type checker, regression tests and production build. Tests use Node's built-in runner and TypeScript stripping; they cover launch selection, navigation policy and settings persistence without starting Electron.

## Windows installer

Download the [Windows preview installer](https://github.com/MphoCodes/Auraline/releases/tag/v0.1.0-preview.1), or build it yourself below.

On Windows, run:

```sh
npm ci
npm run package:win
```

Electron Builder produces an x64 NSIS installer at `dist/Auraline-0.1.0-x64-Setup.exe`. Packaging runs all checks first and never publishes a release. The GitHub Actions workflow runs the same command on Windows and uploads the installer as a workflow artifact.

The installer is unsigned unless a maintainer configures code-signing credentials. Windows may show publisher/SmartScreen warnings. A successful package build does not verify application behavior; test the installed application on Windows before distributing it.

## Architecture

| Path | Responsibility |
| --- | --- |
| `src/main/index.ts` | Electron startup and shutdown |
| `src/main/windows.ts` | Native windows, shell surfaces and IPC handlers |
| `src/main/windows-platform.ts` | Windows taskbar, PowerShell launch fallback and system status |
| `src/main/app-catalog.ts` | Start Menu discovery and application icons |
| `src/main/navigation-policy.ts` | Restrict navigation to the local renderer |
| `src/main/launch-selection.ts` | Resolve pinned or discovered application IDs |
| `src/main/settings.ts`, `settings-store.ts` | Defaults and serialized, atomic settings updates |
| `src/shared/contracts.ts` | Shared renderer/preload API and data types |
| `src/preload/index.ts` | Context-isolated bridge; no Node API exposed to React |
| `src/renderer/` | React interface and styling |

Settings are stored in `settings.json` under Electron's per-user application data directory. Launch requests resolve IDs against saved pins or the discovered catalog; renderer code does not submit arbitrary executable paths.

## Platform notes

Auraline is an early-stage launcher, not a replacement Windows shell. Shell mode hides the Windows taskbar and creates always-on-top surfaces on the selected display. Exit or disable shell mode to restore it. A detached PowerShell watchdog attempts to restore the taskbar after process exit; this is best effort. If restoration fails, restart Windows Explorer through Task Manager.

- Windows taskbar operations, Start Menu discovery and the launch fallback depend on Windows and PowerShell.
- Wi-Fi parsing currently expects English `netsh` output. Localized installations may report incomplete Wi-Fi details.
- macOS/Linux can be used for source checks and UI development; Windows integration is not supported there.
- Multi-monitor shell behavior, display reconfiguration, startup registration and installer/runtime behavior require manual Windows validation.
- No Windows runtime validation is implied by the automated unit tests.

## License

[MIT](LICENSE)
