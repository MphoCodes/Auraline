# Auraline

A macOS-inspired desktop launcher for Windows with a dock, menu bar, and widgets.

## Getting started

1. Install dependencies with `npm install`.
2. Start the desktop app with `npm run dev`.

## Project structure

- `src/main/` — Electron's main process: creates and manages native windows.
- `src/preload/` — the secure bridge between Electron and the user interface.
- `src/renderer/` — the React interface that users see and interact with.

## Useful Electron documentation

- [Prerequisites](https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites)
- [Build your first app](https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app)
- [Process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Inter-process communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
