# Changes from Wave Terminal

Clusterdeck is a derivative work of [Wave Terminal](https://github.com/wavetermdev/waveterm)
(Apache License 2.0, © Command Line Inc.). Wave's original `LICENSE` and `NOTICE` files are
preserved unmodified at the repo root.

Fork point: commit `c99022c15bd1f17273728e728a61743e690d6423` (upstream `main`, July 2026).

## Summary of modifications

This file records every substantive change made to the Wave Terminal codebase, per
Apache-2.0 §4(b). It is updated as changes land.

### Project scaffolding (2026-07-02)

- Moved Wave's root `CLAUDE.md` to `docs/wave/CLAUDE.md` (preserved for build reference).
- Added Clusterdeck's own `CLAUDE.md` (project behavioral contract) at the repo root.
- Added `docs/clusterdeck/` containing the Clusterdeck design spec, fork plan, and UI mockup.
- Added this `CHANGES.md`.

### feat/ssh-config-workspaces (2026-07-02)

- Added `pkg/clusterdeck/` (new package): `sshsync.go` reconciles the hosts in
  `~/.ssh/config` / `/etc/ssh/config` into auto-saved connection workspaces
  (name = bare host, icon `server-2`, Clusterdeck blue, workspace meta
  `clusterdeck:connection` = normalized connection). Add-only; reuses Wave's
  existing ssh-config resolution (`conncontroller.GetConnectionsFromConfig`).
- `cmd/server/main-server.go`: one hook line + import to run the sync at startup.
### feat/connections-rail (2026-07-02)

- Added `frontend/app/clusterdeck/` (new dir): `connectionsrail.tsx/.scss` — the
  SHELL CONNECTIONS rail (full-height, collapsible; status dots, Cmd+1..9 hotkey
  labels, active-row terminal-count subline, connected-count footer). Defines the
  single Clusterdeck accent token `--cd-accent`.
- `frontend/app/workspace/workspace.tsx`: mount the rail (2 lines).
- `frontend/app/store/keymodel.ts`: Cmd+1..9 switches workspaces in rail order
  (was: tab switching; tabs remain on Cmd+[ / Cmd+]).

### feat/ide-layout-template (2026-07-03)

- `pkg/wcore/clusterdeck.go`: added `GetClusterdeckLayout()` — the default IDE
  layout (§3.4) as a `PortableLayout`: narrow full-height explorer (`preview` at
  `~`), a file editor (`preview`, tagged `clusterdeck:zone=editor`), and a shell
  terminal, all inheriting the workspace connection. Added `clusterdeck:zone`
  block tags (`explorer`/`editor`) for §3.5 routing, and
  `SeedClusterdeckLayoutForTab` (reuses `ApplyPortableLayout`, which clears the
  tab first — also serves "reset layout to default").
- `pkg/wcore/workspace.go`: `CreateTab` seeds the Clusterdeck layout instead of a
  bare terminal when the tab's workspace is a connection workspace.
- `pkg/clusterdeck/sshsync.go`: after tagging a new connection workspace, seed its
  initial tab with the IDE layout (blocks don't connect until mounted, so no SSH
  connection is opened at startup).
- "Reset layout to default": added `ClusterdeckResetLayoutCommand(tabId)` to the
  wshrpc interface (`pkg/wshrpc/wshrpctypes.go`) + handler
  (`pkg/wshrpc/wshserver/wshserver.go`); regenerated bindings
  (`wshclientapi.ts`, `wshclient.go`). Added a "Reset Layout to Default" item to
  the tab context menu (`frontend/app/tab/tabcontextmenu.ts`), shown only for
  connection workspaces.



The fork will reshape Wave into a multi-cluster SSH workspace ("connection = workspace"):

1. Workspace Switcher → vertical, collapsible SHELL CONNECTIONS rail.
2. Auto-seed saved workspaces from `~/.ssh/config` hosts.
3. Lock block connections to the workspace connection (hide per-block picker).
4. Default IDE layout template (explorer + editor + terminals) seeded per connection.
5. Explorer file-click routing into the designated editor block.

Wave subsystems (durable sessions, `wsh`, connection controller, Monaco editor, terminal
blocks, secret storage, AI/web blocks, themes) are preserved.
