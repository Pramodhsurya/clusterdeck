# Clusterdeck Roadmap

Clusterdeck is a fork of [Wave Terminal](https://github.com/wavetermdev/waveterm)
focused on a connection-as-workspace IDE experience. This roadmap outlines the
specific Clusterdeck features and improvements that are planned beyond what
upstream Wave already provides.

Legend: ✅ Done | 🔧 In Progress | 🔷 Planned | 🤞 Stretch Goal

## Current Clusterdeck identity

Clusterdeck is **macOS-first** (Apple Silicon), and is intentionally a leaner
shell + editor + explorer. Several Wave subsystems that don't fit that
identity have been **removed** rather than kept-around-in-a-disabled-state:

- ❌ Wave AI chat (the `pkg/aiusechat/` subsystem, including the
  `waveai.json` schema and the in-app AI toggle).
- ❌ `k9s` / `lazygit` / `htop` app widgets (the `tsunami` widget launcher
  that backed them).

Both removals happened in v0.1.3. The replacement for the AI panel is the
`pi-agent` side panel and widget-rail button — see "Coding agent" below.

## Coding agent

### pi-agent (auto-install + auto-update)

- ✅ `pi-agent` widget-rail button auto-installs
  `@earendil-works/pi-coding-agent` (via `npm install -g`) on first click
  if missing.
- ✅ On every widget-rail click, the IPC bridge checks the npm registry
  for the latest version and runs `npm install -g …@latest` if newer
  (no-op when current, so the per-click cost is one `npm view` query).
- ✅ Side-panel controls for **Install pi** / **Update to vX.Y.Z** /
  **Uninstall** with in-progress feedback and error surfacing.
- ✅ `pi` is launched via `controller: "cmd"` so it owns the block — when
  pi exits, the block stays open showing the exit code.
- ✅ `cmd:cwd` is set to the workspace's `clusterdeck:rootdir` so pi
  sees the project.
- 🔷 Streaming pi output to the panel rather than only the terminal block.
- 🔷 Keyboard shortcut (⌘⇧P) to open pi on the active workspace.
- 🔷 Per-project `.pi/` config (auth, model) that travels with the workspace.
- 🤞 pi-agent multi-agent: spawn separate `pi` processes per connection.

## IDE layout

### Editor

- ✅ Editor-at-top restructure: the Monaco editor is pinned at the top
  of the workspace, never a side panel.
- ✅ Autosave (600ms debounced) via Wave's `handleFileSave()`.
- ✅ Stale-content flash on file switch eliminated.
- ✅ Pending-edit flush on file close / tab switch.
- 🔷 LSP integration for Monaco (typescript-language-server, gopls, pyright).
- 🔷 Multi-cursor + selection persistence across sessions.
- 🤞 Diff view (two-pane Monaco diff editor for git/PR review).

### Explorer

- ✅ VS Code–style tree over SFTP with open-editors list, git
  decorations, single-click open.
- ✅ New File / New Folder / Rename / Delete operations.
- 🔷 Drag-and-drop into the editor zone and into terminals.
- 🔷 Search-in-folder with results highlighted in the tree.
- 🤞 Workspace trust prompt (per-folder opt-in for remote SSH roots).

## Connections

- ✅ Shell connections rail (vertical, collapsible; status dots;
  `⌘1–⌘n` hotkeys; per-connection workspace).
- ✅ SSH-config auto-discovery into connection workspaces
  (`pkg/clusterdeck/sshsync.go`).
- ✅ Per-terminal connection override (a block can opt out of the
  rail-bound connection).
- ✅ Remember-password race fix.
- 🔷 WireGuard / Tailscale connection types (in addition to SSH/local).
- 🔷 Connection health probe (active ping) before opening terminals.
- 🤞 Connection bundles — a saved set of connections that all open
  together when you switch to a project.

## Kubernetes integration (post-removal)

The k9s/lazygit app widgets were removed in 0.1.3 because they were
Waves-era app-launcher wrappers that didn't fit Clusterdeck's leaner
identity. If we add Kubernetes support later, it will be native
(in-cluster via `kubectl` exec) rather than a launcher widget.

- 🔷 Read-only `kubectl get` output pane (per-namespace) bound to the
  active connection.
- 🤞 Native k9s-style dashboard via a Wave block view (no external
  launcher).

## Wave subsystems preserved

These upstream Wave subsystems are kept as-is in Clusterdeck — they're
load-bearing for the shell + editor + explorer experience:

- ✅ Durable SSH sessions
- ✅ `wsh` command system
- ✅ Connection controller
- ✅ Monaco editor
- ✅ Terminal blocks (including local and remote)
- ✅ Secret storage
- ✅ Themes (with the CSS accent token moved to a single source of truth
  in `frontend/app/theme.scss`)

## Non-features

Clusterdeck will **not** add:

- ❌ A second AI assistant beyond `pi-agent` (use the npm ecosystem).
- ❌ A plugin marketplace (Wave's app builder is preserved but no
  third-party store is planned).
- ❌ Mobile clients (macOS-first; Linux/Windows are stretch).