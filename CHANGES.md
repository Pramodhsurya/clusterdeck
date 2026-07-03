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

### Planned reshaping (not yet implemented)

The fork will reshape Wave into a multi-cluster SSH workspace ("connection = workspace"):

1. Workspace Switcher → vertical, collapsible SHELL CONNECTIONS rail.
2. Auto-seed saved workspaces from `~/.ssh/config` hosts.
3. Lock block connections to the workspace connection (hide per-block picker).
4. Default IDE layout template (explorer + editor + terminals) seeded per connection.
5. Explorer file-click routing into the designated editor block.

Wave subsystems (durable sessions, `wsh`, connection controller, Monaco editor, terminal
blocks, secret storage, AI/web blocks, themes) are preserved.
