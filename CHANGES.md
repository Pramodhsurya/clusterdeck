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

### feat/explorer-editor-routing (2026-07-03)

- `frontend/app/clusterdeck/connlock.ts`: exported the `clusterdeck:zone` tag
  constants (explorer/editor) shared by the layout seed and the routing.
- `frontend/app/view/preview/preview-model.tsx`: added `handleFileActivate(path,
  isDir)` + `findClusterdeckEditorBlockId()`. In the seeded explorer block, a
  file activation sets the `file` meta on the sibling editor-zone block (and
  focuses it) instead of navigating in-place. Directories still navigate the
  explorer; non-explorer blocks and the no-editor-block case fall back to the
  upstream in-place behavior.
- `frontend/app/view/preview/preview-directory.tsx`: route the double-click and
  Enter file-open handlers through `handleFileActivate`.

### feat/ssh-config-workspaces — Local connection (2026-07-03)

- `pkg/clusterdeck/sshsync.go`: also seed a **Local** connection workspace
  (`clusterdeck:connection = "local"`, laptop icon) matching the mockup's
  "Local · zsh". Wave's `IsLocalConnName("local")` resolves it to the local
  shell/filesystem, so the IDE layout (§3.4) and explorer→editor routing (§3.5)
  work fully locally without any SSH host. Refactored creation into
  `ensureConnectionWorkspace`; the sync no longer early-returns on an empty ssh
  config, so the Local workspace is always ensured.

### feat/connection-workspaces — all connections + rail picker (2026-07-03)

- `pkg/wcore/clusterdeck.go`: added `EnsureConnectionWorkspace` /
  `FindConnectionWorkspace` — the single primitive that returns (creating +
  seeding the IDE layout if needed) the workspace bound to a connection. Shared
  by startup sync and the rail's add action.
- `pkg/clusterdeck/sshsync.go`: `SyncConnectionWorkspaces` now seeds a workspace
  for **every** connection Wave knows (`conncontroller.GetConnectionsList()` —
  active + saved-internal + ssh config) plus Local, not just ssh-config hosts.
  Added `WorkspaceNameForConn` / `WorkspaceIconForConn` / `DisplayName` helpers.
  Renamed the startup entrypoint to `GoSyncConnectionWorkspaces`
  (`cmd/server/main-server.go` updated).
- `ClusterdeckEnsureConnWorkspaceCommand(connName) -> workspaceId`: new wshrpc
  command (interface + handler + regenerated bindings) so the rail can open any
  connection's workspace on demand.
- `frontend/app/clusterdeck/connectionsrail.tsx`: the rail "+" now opens a
  connection picker (Local + every known connection via `ConnListCommand`);
  choosing one ensures its connection workspace and switches to it (was:
  `createWorkspace()`, which made a plain untagged workspace). The picker also
  offers **"New connection…"**, which opens a small modal (`WaveModal` + `Input`)
  to type a new `user@host`; its connection workspace is created and opened
  (Wave's normal connect/auth flow runs when the blocks mount).

### feat/folder-workspaces — workspace = folder on a connection (2026-07-03)

Reshaped the model so a workspace is a **root folder on a connection**, added
free-form via the rail "+", with nothing auto-seeded.

- `pkg/wcore/clusterdeck.go`: added `clusterdeck:rootdir` workspace meta +
  `GetWorkspaceRootDirForTab`. `GetClusterdeckLayout(rootDir)` roots the explorer
  (`file`) and terminal (`cmd:cwd`) at the folder. `EnsureConnectionWorkspace` /
  `FindConnectionWorkspace` now key on (connection, rootDir), so one connection
  (e.g. `local`) can back many folder workspaces.
- `pkg/clusterdeck/sshsync.go`: replaced startup auto-seed with `ClassifyTarget`
  — interprets a free-form target as a local folder path (leading `/`, `~`, `.`,
  or an existing dir) rooted on `local`, else a remote connection. Removed the
  startup sync (`cmd/server/main-server.go` no longer seeds anything).
- `ClusterdeckOpenTargetCommand(target) -> workspaceId` (replaces
  `ClusterdeckEnsureConnWorkspaceCommand`): opens the workspace for a folder or
  connection.
- `frontend/app/clusterdeck/connectionsrail.tsx`: the rail "+" now opens one
  free-form modal ("Open Folder or Connection") — type a local path or
  `user@host`; it opens as a workspace rooted there. Dropped the connection
  context-menu picker.

### feat/rail-add-menu — Open Folder picker, New Connection, gear (2026-07-03)

- Native folder picker: `emain/emain-ipc.ts` `get-directory` IPC
  (`dialog.showOpenDialog` openDirectory) + `emain/preload.ts` `selectDirectory`
  + `frontend/types/custom.d.ts` type.
- `frontend/app/clusterdeck/connectionsrail.tsx`: the rail "+" is now a two-item
  menu — **Open Folder…** (native picker → open that folder as a workspace) and
  **New Connection…** (ssh `user@host` modal). Added a **gear** icon next to "+"
  that opens `connections.json` (via `getConfigDir()` + `openNativePath`).

### feat/rail-connections — rail lists connections.json (2026-07-03)

- `frontend/app/clusterdeck/connectionsrail.tsx`: the rail is now
  connection-based, not workspace-based. It lists Local + every connection from
  `connections.json` (`fullConfig.connections`); clicking a connection opens its
  workspace (`ClusterdeckOpenTargetCommand`). Removed the workspace-list
  plumbing. Exported `openRailConnectionByIndex` for the Cmd+1..9 hotkeys.
- `frontend/app/store/keymodel.ts`: Cmd+1..9 opens the nth rail connection.

### feat/tree-explorer — change #6 Phase 1 (2026-07-03)

- Added an isolated Clusterdeck explorer block view (`cdexplorer`), leaving
  Wave's directory view untouched:
  - `frontend/app/clusterdeck/explorer.tsx` (+ `.scss`): `ClusterdeckExplorerModel`
    (a `ViewModel`) + a VS Code–style tree built on Wave's `TreeView`. Lists the
    workspace folder over SFTP (`FileListCommand`), lazy-loads subfolders on
    expand, file-type icons, a folder header + refresh (T1–T8). File clicks route
    into the editor-zone block (§3.5); folders expand/collapse.
  - `frontend/app/block/blockregistry.ts`: registered `cdexplorer`.
  - `pkg/wcore/clusterdeck.go`: the seeded explorer block now uses the
    `cdexplorer` view instead of `preview`.
- OPEN EDITORS + editor tabs (E#/X#) and git decorations (G#) remain later phases.

### feat/rail-single-switcher (2026-07-03)

- `frontend/app/clusterdeck/connectionsrail.tsx`: the rail now lists **all
  Clusterdeck workspaces** the user has opened (local folders + ssh connections),
  from `WorkspaceService.ListWorkspaces` (filtered to workspaces tagged with a
  connection), refreshed on `workspace:update`. Clicking switches to that
  workspace. Cmd+1..9 switches to the nth.
- `frontend/app/tab/tabbar.tsx` + `vtabbar.tsx`: hid Wave's native workspace
  switcher — the connections rail is now the single switcher (no duplicate).

### Dev experience (2026-07-03)

- `emain/emain-window.ts`: raised `DevInitTimeoutMs` 5000 → 30000. On a cold
  first Vite dev-compile (>5s), the 5s init timeout rejected `initPromise`
  before `wave-init` was sent, leaving the window blank until a restart. Not a
  feature change; dev-only.

### Planned reshaping (not yet implemented)

The fork will reshape Wave into a multi-cluster SSH workspace ("connection = workspace"):

1. Workspace Switcher → vertical, collapsible SHELL CONNECTIONS rail.
2. Auto-seed saved workspaces from `~/.ssh/config` hosts.
3. Lock block connections to the workspace connection (hide per-block picker).
4. Default IDE layout template (explorer + editor + terminals) seeded per connection.
5. Explorer file-click routing into the designated editor block.

Wave subsystems (durable sessions, `wsh`, connection controller, Monaco editor, terminal
blocks, secret storage, AI/web blocks, themes) are preserved.
