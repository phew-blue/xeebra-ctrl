# xeebra-ctrl

A monitoring and control panel for EVS Xeebra video-referee servers.

Xeebra is the multi-camera review system officials use for VAR. Once a venue
runs several units, managing each one through its own browser tab gets tedious.
xeebra-ctrl puts the whole fleet in a single window: monitoring tiles per
source, the settings you would otherwise reach device by device, and a shutdown
that works through the room in order at the end of the day.

It ships as one Windows `.exe` with a system tray icon. A Go HTTP server
(default port `3200`) serves an embedded React SPA, so there is nothing else to
install and no separate web server to keep running.

## Install

Download the installer from the
[latest release](https://github.com/phew-blue/xeebra-ctrl/releases/latest) and
run it.

Configuration lives in `xeebra-ctrl.config.json` next to the exe. See
[`xeebra-ctrl.config.example.json`](xeebra-ctrl.config.example.json):

```json
{
  "port": 3200,
  "groups": [
    {
      "name": "Studio A",
      "apiServerIp": "192.168.1.20",
      "sshUser": "evs",
      "sshPassword": "evs123"
    }
  ]
}
```

SSH credentials default to `evs` / `evs123` when omitted.

## Features

- **Monitoring grid** that rearranges itself for split-view orientation. Each
  tile keeps the last good SDI frame, so a brief signal drop shows the previous
  frame rather than going black.
- **Health checks** that raise alerts in the sidebar.
- **Group and server management** for venues running several units.
- **Metrics tab**, and UI state that persists between sessions.
- **Shutdown and restart** per server, with confirmation modals.

## How it reaches a unit

Each Xeebra is reached through two separate routes:

| Endpoint | Target | Purpose |
|---|---|---|
| `/api/proxy` | haproxy on `:80` | the cluster REST API |
| `/api/platform` | platform-console on `:9081` | platform-level operations |

These are deliberately kept apart: the platform-console stays reachable when
haproxy or docker is broken, which is a failure mode that happens in practice.

Shutdown and restart do not go through either. The flow reads the server's
configuration status, sends `_stop` if it is `RUNNING`, waits ten seconds, then
issues `sudo shutdown now` or `sudo reboot` over SSH.

## Development

```bash
make build   # build the frontend, then the Windows exe
make dev     # Vite dev server + HEADLESS=1 go run . in parallel
make clean
```

`HEADLESS=1` skips the system tray and runs the server only, which works on
Linux and macOS.

The Go build targets `GOOS=windows` with `-ldflags="-H windowsgui"` and uses
`go:embed` to bake in `frontend/dist` and the tray icons. **The frontend must be
built first** or `go build` fails on the embed.

There is no test suite. CI's check is the frontend `pnpm build`, which runs
`tsc -b` type checking.

### Stack

- **Go** — stdlib `net/http` with method+path route patterns,
  `getlantern/systray`, `golang.org/x/crypto/ssh`
- **Frontend** — React 19, TypeScript, Vite 6, Tailwind CSS 4, built with pnpm

### Preview mode

The `Dockerfile` builds a frontend-only image where nginx serves the SPA, mocks
`/api/config` and returns 502 for every other `/api/*` route. It runs in the
`dev` namespace of the home-ops cluster and is UI-only, with no Xeebra
connectivity or SSH.

The frontend also treats `apiServerIp: "0.0.0.0"` as preview mode and shows
demo servers.

## Releases

Run the **Prepare Release** workflow with a version such as `v0.3.0`. It bumps
the version, checks the tree still builds, and opens a `release/v0.3.0` → `main`
pull request.

Merge that PR **with a merge commit, not a squash**. `auto-tag` matches either
`chore(release): v0.3.0` exactly or `from <org>/release/v0.3.0` in a merge
commit; squashing rewrites the message to `chore(release): v0.3.0 (#N)`, which
matches neither, and the tag is silently skipped.

Once the tag lands, CI builds the Inno Setup installer and attaches it to the
GitHub Release, and `create-release` writes the release notes.

## Related

- **lexi monorepo `packages/xeebra`** — the maintained Go client for the EVS
  Xeebra REST API
- **[phew-blue/xeebra-client](https://github.com/phew-blue/xeebra-client)** —
  a preserved, unmaintained TypeScript client extracted from lexi

xeebra-ctrl depends on neither; it talks to Xeebra through its own proxy
handlers in `server.go`.
