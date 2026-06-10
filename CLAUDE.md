# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

xeebra-ctrl is a monitoring and control panel for EVS Xeebra video-referee servers. It ships as a single Windows `.exe` with a system tray icon: a Go HTTP server (default port `3200`) serves an embedded React SPA and proxies requests to Xeebra devices — the cluster REST API (haproxy on `:80`) and the platform-console (`:9081`) — plus SSH-driven shutdown/restart of the servers themselves.

## Stack

- **Go** (module targets 1.22; mise pins 1.26.2) — stdlib `net/http` with method+path route patterns, `getlantern/systray`, `golang.org/x/crypto/ssh`
- **Frontend** — React 19 + TypeScript + Vite 6 + Tailwind CSS 4, built with pnpm in `frontend/`
- `go:embed` bakes `frontend/dist` and the tray icons (`assets/`) into the binary

## Key Files

- `main.go` — entrypoint + system tray; `HEADLESS=1` skips the tray (server only, works on Linux/Mac)
- `server.go` — config load/save, all `/api/*` handlers, HTTP proxies, SSH shutdown/restart
- `frontend/src/` — `App.tsx`, `components/` (Sidebar, ServerView, Monitoring/Metrics/Config/Settings tabs, Shutdown/Restart modals, VideoCell), `hooks/useHealthAlerts.ts`
- `installer/windows/` — Inno Setup script (`xeebra-ctrl.iss`) + startup PowerShell
- `Dockerfile` + `nginx.conf` — frontend-only **preview mode** image: nginx serves the SPA, mocks `/api/config`, and returns 502 for all other `/api/*`
- `xeebra-ctrl.config.example.json` — config shape; the real `xeebra-ctrl.config.json` lives next to the exe

## Build & Run

```bash
make build   # frontend (pnpm install && pnpm build) then Windows exe
make dev     # Vite dev server + HEADLESS=1 go run . in parallel
make clean
```

- The Go build targets `GOOS=windows` with `-ldflags="-H windowsgui"` and embeds `frontend/dist` — the frontend must be built first or `go build` fails on the embed.
- There is no test suite; CI's check is the frontend `pnpm build` (which runs `tsc -b` type checking).

## Config & Behaviour Notes

- Config: `port` (default 3200) and `groups[]` of `{name, apiServerIp, sshUser, sshPassword}`; SSH credentials default to `evs` / `evs123` when omitted.
- `/api/proxy` hits the Xeebra haproxy frontend on `:80`; `/api/platform` hits the platform-console on `:9081`. Keep them separate — the platform-console stays up when haproxy/docker is broken (a real observed failure mode).
- Shutdown/restart flow: read server configuration status → `_stop` if `RUNNING` → wait 10 s → SSH `sudo shutdown now` / `sudo reboot`.
- The frontend treats `apiServerIp: "0.0.0.0"` as preview mode and shows demo servers.

## CI / Release

- **PRs to `main`** (`ci.yml`): frontend type check, then a full build on `windows-latest`.
- **Push to `dev`** (`dev.yml`): builds and pushes `ghcr.io/phew-blue/xeebra-ctrl:dev` (the nginx preview image), uploads a dev installer artifact, and commits the new image digest to the home-ops repo.
- **Tags `v*`**: full build + Inno Setup installer attached to the GitHub Release. `auto-tag.yml` creates the tag when a `chore(release): vX.Y.Z` commit (or release-branch merge) lands on `main`.

## Deployment

The preview image runs in the `dev` namespace of the home-ops Kubernetes cluster (`kubernetes/apps/dev/xeebra-ctrl/`), reachable at `xeebra-ctrl.dev.<domain>`. It is UI-only — no real Xeebra connectivity or SSH from the cluster.

## Related Projects

- **lexi monorepo `packages/xeebra`** — the actively maintained Go client for the EVS Xeebra REST API.
- **phew-blue/xeebra-client** — the preserved (unmaintained) TypeScript client, extracted from lexi.
- xeebra-ctrl depends on neither; it talks to Xeebra through its own proxy handlers in `server.go`.
