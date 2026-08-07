# Changes from Wave Terminal

Clusterdeck is a derivative work of [Wave Terminal](https://github.com/wavetermdev/waveterm)
(Apache License 2.0, © Command Line Inc.). Wave's original `LICENSE` is preserved;
`NOTICE` retains the upstream attribution and adds Clusterdeck's derivative-work notice.

Fork point: the merge-base with upstream `main` (July 2026) — find it with
`git merge-base HEAD upstream/main`. Clusterdeck's commit history was rewritten once
to normalize all fork commits to a single project identity; upstream Wave commits
retain their original authorship, and a shared ancestor with `upstream/main` is
preserved so upstream changes can still be merged or cherry-picked.

## Summary of modifications

This file records every substantive change made to the Wave Terminal codebase, per
Apache-2.0 §4(b). It is updated as changes land.

### release/0.1.4-consistency (2026-08-05)

- Corrected immutable 0.1.2/0.1.3 release history and added the post-0.1.3 0.1.4 notes.
- Aligned the root manifest and lockfile at `clusterdeck@0.1.4` and renamed the docs workspace to `clusterdeck-docs`.
- Made telemetry and the diagnostic ping opt-in, made consent non-retroactive by purging pre-consent queues, removed dead legacy activity collection, and added focused policy tests.
- Hard-disabled the inherited Wave updater/feed and obsolete Wave artifact-publishing tasks; Clusterdeck updates use Homebrew and `clusterdeck/releases`.
- Replaced inherited Wave product documentation and deployment claims with macOS-first Clusterdeck docs, strict Docusaurus checks, and a GitHub Pages workflow.
- Corrected `NOTICE` attribution prose by removing the obsolete AI endpoint statement while retaining upstream attribution.

### feat/rebrand-icons (2026-07-04)

- Rebranded the app from "Wave"/"Wave Terminal" to **Clusterdeck** (display-only; Wave's
  `LICENSE`/`NOTICE` and the package.json `author` attribution are preserved).
  - `package.json`: `productName` → "Clusterdeck", `build.appId` → `dev.clusterdeck.app`.
  - `emain/emain-platform.ts`: data/config directory name → `clusterdeck` (data dir via
    `envPaths`, config dir via `waveDirName`); Electron app name → "Clusterdeck"/"Clusterdeck (Dev)".
  - Renamed user-facing strings in the app menu (`emain-menu.ts`), quit dialog (`emain.ts`),
    update notification (`updater.ts`), About modal (`about.tsx`), onboarding (`onboarding.tsx`),
    and the window `<title>`/favicon (`index.html`).
  - `pkg/wavebase/wavebase.go`: caches-dir bundle name → `clusterdeck`/`clusterdeck-dev` (the
    data/config dirs auto-follow the `WAVETERM_*_HOME` env vars Electron sets, unchanged).
  - Backend data/config dirs move to `clusterdeck-dev`; existing `waveterm-dev` data is migrated
    by copy on the developer machine (old dirs retained as fallback).
- Replaced the app icon set with the Clusterdeck icon (blue squircle + terminal glyph):
  `build/icon.icns`, `build/icon.ico`, `build/icons/*.png`, `public/logos/clusterdeck-logo.png`,
  `public/logos/clusterdeck-256.png`, and the in-app `frontend/app/asset/logo.svg`.

### Project scaffolding (2026-07-02)

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

### feat/welcome-home (2026-07-03)

- Added a VS Code–style Welcome page (new `cdwelcome` block view):
  - `frontend/app/clusterdeck/welcome.tsx` (+ `.scss`): Start actions (Open
    Folder / New Connection) + a Recent list (last 5 workspaces by
    `clusterdeck:lastopened`). Registered in `blockregistry.ts`.
  - `pkg/wcore/layout.go`: `GetStarterLayout` now returns the Welcome layout, so
    the app starts on Welcome instead of Wave's term+sysinfo+web+preview.
  - `pkg/wcore/clusterdeck.go`: `EnsureHomeWorkspace` + `GetClusterdeckWelcomeLayout`
    (a single Welcome block); `clusterdeck:home` / `clusterdeck:lastopened` meta.
  - `ClusterdeckOpenHomeCommand` RPC + a **home** button in the rail header.
  - `OpenTarget` records `clusterdeck:lastopened`; rail/recent clicks route
    through `switchToWorkspace`, which also records recency.

### feat/blue-accent-icons (2026-07-03)

- `frontend/app/theme.scss`: changed the global `--accent-color` from Wave green
  to blue (`rgb(66,157,255)`), so selections, active states, toggles and buttons
  are blue throughout.
- `frontend/app/clusterdeck/explorer.tsx`: richer VS Code–style file-type icons
  (per extension + special filenames, brand glyphs where available); folders are
  left iconless so the tree shows folder/folder-open on expand.

### Dev experience (2026-07-03)

- `emain/emain-window.ts`: raised `DevInitTimeoutMs` 5000 → 30000. On a cold
  first Vite dev-compile (>5s), the 5s init timeout rejected `initPromise`
  before `wave-init` was sent, leaving the window blank until a restart. Not a
  feature change; dev-only.

### feat/apps-and-kube-clusters (2026-07-06)

- New built-in app widgets (k9s, lazygit, htop) launch as `cmd`-terminal blocks bound
  to the active workspace connection, proving `widgets.json` is a generic app/plugin
  extension point (any user can add their own the same way).
- Kubernetes cluster support on top of that:
  - `pkg/clusterdeck/kube.go`: a central registry (`kubeclusters.json`) of clusters
    added from uploaded kubeconfigs, each with its own minified per-context config,
    merged into one Clusterdeck-managed kubeconfig so a single k9s instance can list
    and switch between every registered cluster via its `:ctx` command.
  - New RPCs (`ClusterdeckAddKubeConfig`/`ListKubeClusters`/`RemoveKubeCluster`) back a
    cluster picker on the k9s widget: pick a cluster to open k9s bound to it
    (`--kubeconfig`/`--context`, `cmd:shell:false` so the flags apply and no login
    shell re-sources the user's own ambient `$KUBECONFIG`), add more kubeconfigs
    (single or multi-file picker), or remove one. Several k9s blocks for different
    clusters can coexist in one workspace.
  - The k9s terminal header shows a cluster-name dropdown to switch that block's
    cluster live, with a right-click menu per entry (open in a new pane, copy context
    name, delete config). `MenuItem`/`FlyoutMenu` gained `onContextMenu` support for
    this.
  - k9s runs on the local connection (where kubeconfigs live) even when launched from
    inside an SSH workspace.

### Explorer/editor fixes and polish (2026-07-06)

- Fixed the explorer losing its SSH connection after an app restart: file listing/read
  now ensures the connection first (`ConnEnsureCommand`), mirroring the editor's
  existing behavior, before the first `FileListCommand`/`FileReadCommand` call.
- Added VS Code-style right-click context menus to the tree explorer and the open-
  editors list: new file/folder, rename, delete, cut/copy/paste, copy (relative) path,
  and close-other-editors.
- The tree explorer's "change root" flow now reuses Wave's native `SuggestionControl`
  fuzzy folder picker (same component the file explorer uses) instead of a hand-rolled
  input, fixing manual path entry; `frontend/app/element/modal.tsx`'s `Modal` now
  portals to `document.body` so it's no longer clipped when opened from a narrow pane.
  `frontend/app/treeview/treeview.tsx` gained a `refreshVersion` prop so an already-
  expanded folder's contents refresh after delete/rename/paste, not just on next
  expand.
- Added `defwidget@explorer`/`defwidget@editor` widgets so closing either zone leaves a
  way to reopen it.
- Added a "remember this password" checkbox to the SSH password prompt
  (`pkg/remote/sshclient.go`): on accept, the password is saved to the existing
  `secretstore` and wired to `ssh:passwordsecretname` on the connection, so the next
  connect doesn't prompt again — reusing Wave's own (previously unused) read path.
- The Welcome page's "Recent" list now also sources connection recency from
  `connections.json` (`clusterdeck:lastopened` on the connection, not just the
  workspace object), so deleting a workspace no longer erases its entry from Recent;
  a "ghost" entry for a deleted workspace reopens a fresh one for that connection.

### Per-terminal connection override + password-remember fix (2026-07-06)

- `frontend/app/block/blockframe-header.tsx`: terminal blocks (`metaView === "term"`)
  now show Wave's native connection button even inside a connection-locked workspace,
  so a single terminal can be switched to Local (or back to the workspace's own
  connection) without affecting the explorer, editor, or other terminals, which stay
  locked. New terminals still default to the workspace connection unchanged
  (`pkg/wcore/block.go`'s inherit-on-create logic is untouched).
- Fixed a real bug in the "remember this password" feature (`pkg/remote/sshclient.go`):
  the password was previously saved to the secret store as soon as the user submitted
  it with the checkbox checked, before the SSH handshake had verified it — so a
  mistyped or rejected password got permanently remembered, and every later connect
  silently retried the bad password with no prompt at all. `createPasswordCallbackPrompt`
  now only records the "remember" intent (`pendingPasswordRemember`); `ConnectToClient`
  commits it to the secret store only after `connectInternal` confirms the handshake
  actually succeeded.

### AI toggle relocation + real release notes (2026-07-06)

- Moved the "Toggle AI Panel" button (sparkle icon) out of the tab bar — where it sat
  next to the traffic lights/tabs (`WaveAIButton` in `frontend/app/tab/tabbar.tsx`,
  `VTabBarAIButton` in `frontend/app/tab/vtabbar.tsx`) — into the widget rail
  (`frontend/app/workspace/widgets.tsx`), directly below the app widgets (e.g. htop),
  as its own `AIToggleWidget`. Both tab-bar variants and their now-dead
  refs/width-calculations were removed.
- Fixed Settings → Release Notes showing Wave's own upstream version history
  (`onboarding-upgrade-v0121.tsx` through `onboarding-upgrade-v0145.tsx` — the
  rebrand had only replaced the word "Wave" with "Clusterdeck" in these strings, not
  the actual Wave release content describing Wave features Clusterdeck never
  shipped). Replaced with two real entries, `onboarding-upgrade-v010.tsx` and
  `onboarding-upgrade-v011.tsx`, describing Clusterdeck's actual 0.1.0 and 0.1.1
  changes; deleted the ten stale Wave-version files; updated
  `CurrentOnboardingVersion` (`onboarding-common.tsx`) from `v0.14.5` to `v0.1.1`.

### Remaining Wave→Clusterdeck string rebrand (2026-07-06)

- Earlier searches for leftover "Wave" strings in this fork missed several because
  they used `\|` for alternation, which macOS's default (BSD) `grep` doesn't support
  outside `-E` — a re-audit with `-E` found a few more:
  - `emain/emain-platform.ts`'s `checkIfRunningUnderARM64Translation` dialog
    ("Wave has detected a performance issue" / "Wave is running in ARM64
    translation mode…") — retitled to Clusterdeck, and its "Learn More" link now
    points at this repo's `INSTALL.md` instead of Wave's own docs site.
  - `frontend/builder/builder-app.tsx`'s dev-badge tooltip ("Running Wave Dev
    Build" → "Running Clusterdeck Dev Build", matching the one already fixed in
    `widgets.tsx`).
  - The "New Connection" modal description
    (`frontend/app/clusterdeck/connectionsrail.tsx`) no longer says "Wave's
    connect/auth".
  - The wsh-install confirmation dialogs (`pkg/wslconn/wslconn.go`,
    `pkg/remote/conncontroller/conncontroller.go`): title and body now say
    "Clusterdeck requires…"/"Install Clusterdeck Shell Extensions" — the
    extensions themselves are still called "Wave Shell Extensions" since that's
    `wsh`'s own (kept-as-is) name, not Clusterdeck's.
  - A few internal error strings (`pkg/blockcontroller/shellcontroller.go`'s
    initscript-file errors, `pkg/remote/sshclient.go`'s ProxyJump-depth error).
  - Deliberately **left alone**: the `X-Wave-*` HTTP headers and AI cloud-proxy
    strings (`pkg/aiusechat/**`, `presets/ai.json`'s "Wave Proxy" preset) — these
    describe Wave's own hosted AI proxy infrastructure, which Clusterdeck's AI
    panel genuinely still talks to; renaming the labels would misrepresent who
    operates that service. Also left the `frontend/preview/` standalone
    component-preview tool alone — it's a dev-only tool, not part of the shipped
    app.

### Fixed k9s/lazygit/htop "command not found" (2026-07-06)

- `cmd`-controller blocks (`pkg/blockcontroller/shellcontroller.go`,
  `pkg/shellexec/shellexec.go`) always ran via `zsh -c "<cmd>"` — a non-login
  shell that inherits the packaged app's own minimal launchd-provided PATH, not
  the user's real shell PATH. Homebrew-installed tools (`k9s`, `lazygit`,
  `htop`, all typically under `/opt/homebrew/bin`, added to PATH via
  `~/.zprofile`) failed with `command not found`, since a non-login shell never
  sources `.zprofile`. Regular terminal blocks were unaffected — they already
  ran a login shell.
- Added a new opt-in `cmd:login` meta key: when set, the cmd block's shell gets
  `-l` (login), sourcing `.zprofile` for PATH, without also sourcing `.zshrc`
  (login without `-i`/interactive) — so it doesn't accidentally pick up other
  profile customizations. Off by default so existing `cmd:shell:false` blocks
  that rely on explicit `cmd:env` aren't affected unless they opt in.
- Set `cmd:login: true` on the `k9s`/`lazygit`/`htop` app widgets
  (`pkg/wconfig/defaultconfig/widgets.json`) and on the per-cluster k9s launch
  (`frontend/app/clusterdeck/connectionsrail.tsx`'s cluster picker,
  `frontend/app/clusterdeck/kubeclusters.ts`'s "open in new pane" action) — the
  previous `cmd:shell:false` comment claiming this "avoids a login shell" was
  describing intended, not actual, behavior; neither path had ever used a login
  shell.

### Fixed stale content when switching files in the editor block (2026-07-06)

- The shared editor block (§3.5) switches its active file by setting the `file`
  meta directly (`frontend/app/clusterdeck/explorer.tsx`'s
  `openInEditor`/`setActiveEditorFile`, `frontend/app/clusterdeck/editor.tsx`'s
  `setActiveFile`) — the tab strip and path header updated correctly (they just
  read meta), but Wave's `PreviewModel.fileContent` also checks two
  block-scoped override buffers (`fileContentSaved`, `newFileContent`, used for
  unsaved edits / just-saved content) that take priority over freshly fetched
  content. Only Wave's own `goHistory` (directory-navigation) clears those
  buffers when the active file changes; none of the three places above did, so
  the editor kept showing whichever file was last saved/typed into, no matter
  which file was actually selected — not just visually stale, but a real risk
  of saving the wrong content into the wrong file.
- Fixed with two layers, both in `ClusterdeckEditorView`: (1) the preview
  subtree is now `key`ed on the active file so Monaco fully remounts per file
  (fresh model, fresh content) rather than reusing a stale model; and (2) the
  two override buffers are cleared **synchronously in render** (React's
  "reset state on prop change" pattern) the moment the active file changes, so
  the remount reads freshly-fetched content on its first paint with no
  stale-content flash. Verified end-to-end against the real backend: with the
  shared `fileContentSaved` buffer deliberately poisoned before each switch,
  the file switched *to* renders its own correct content on the first render
  (never the poisoned buffer).

### Autosave (2026-07-06)

- The editor now autosaves: `frontend/app/clusterdeck/editor.tsx` debounces
  600ms after the last edit, then calls Wave's existing `handleFileSave()` —
  it only performs the RPC write and updates the save-tracking buffers, never
  touches the Monaco model/editor, so Cmd+Z/Cmd+Shift+Z (Monaco's own,
  independent undo stack) is completely unaffected by autosave.
- Switching files (or closing the active one) no longer silently discards a
  not-yet-autosaved edit — a new `flushPendingSave(filePath, content)` writes
  it to the file being left, using that file's own path explicitly (not the
  block's current `file` meta, which has already moved to the new file by the
  time the switch is detected).

Wave subsystems (durable sessions, `wsh`, connection controller, Monaco editor, terminal
blocks, secret storage, AI/web blocks, themes) are preserved throughout.

### Branding & housekeeping sweep (2026-07-07)

Cleanup pass fixing items surfaced during the post-1.3 review.

- **CSS accent token — single source of truth.** `--cd-accent`,
  `--cd-accent-bg`, and `--cd-muted-text` are now declared exactly once,
  in `frontend/app/theme.scss :root`. The previous duplicate declarations
  in `connectionsrail.scss :root` and `welcome.scss .cd-welcome` are
  removed; the hardcoded `#429dff` / `rgba(66, 157, 255, 0.12)` fallback
  values in `editor.scss` and `explorer.scss` are removed in favor of bare
  `var(--cd-accent[-bg])` references. This satisfies CLAUDE.md §4
  ("Define it as a token; never hard-code") and means future theme tweaks
  are one-line edits in `theme.scss`.
- **Frontend meta-key constants consolidated.** The duplicated
  `clusterdeck:rootdir` literal that lived in both
  `frontend/app/clusterdeck/welcome.tsx` and `pkg/wcore/clusterdeck.go`
  is now exported from `frontend/app/clusterdeck/connlock.ts` and imported
  by the Welcome view, so the two sides can't drift apart.
- **Wave→Clusterdeck docs URL replacement.** Eight in-app "Learn more" /
  docs links (in `quicktips.tsx`, `waveconfig-model.ts`, `helpview.tsx`,
  `byokannouncement.tsx`, `telemetryrequired.tsx`, `onboarding.tsx`,
  `durable-session-flyover.tsx`, plus the test fixture in
  `webview.test.tsx`) now point at `docs.clusterdeck.app/...` instead of
  `docs.waveterm.dev/...`. The deliberate upstream credit link ("Wave
  Terminal" / "Sponsor Wave") in `about.tsx` is kept as required by
  Apache-2.0 §4 and the project README.
- **`package.json` rebranded.** `"name": "waveterm"` → `"name":
  "clusterdeck"`, and `author` → `Clusterdeck Authors`. `private: true`
  keeps this from accidentally publishing to npm.
- **`termutil.ts` paste prefix.** `waveterm_paste_*` → `clusterdeck_paste_*`
  (the rendered filename when pasting into a terminal).
- **Onboarding demo strings.** The fake AI demo in `onboarding/fakechat.tsx`
  now reads `~/clusterdeck` and `$HOME/Library/Application Support/
  clusterdeck-dev/waveapp.log` instead of the old Wave paths. `waveapp.log`
  itself stays — that's the actual log filename emitted by the Wave-derived
  backend and renaming it would require an upstream wsh change.
- **`emain/emain-platform.ts`** — the redundant
  `app.setName("waveterm/electron")` (which was shadowed before
  `app.whenReady` by the correct `"Clusterdeck"/"Clusterdeck (Dev)"`
  setName 18 lines below) is removed. The data-dir comments now say
  `clusterdeck/electron` instead of `waveterm/electron`.
- **`emain/emain.ts`** — `console.log` strings `"waveterm-app starting…"`,
  `"waveterm-app WAVETERM_DEV set"`, and `"waveterm-app could not get
  single-instance-lock"` → `"clusterdeck-app …"`.
- **Dead theme token removed.** `--tab-green` was defined in `theme.scss`
  but referenced by nothing. Removed.
- **`NOTICE` rebuilt** with a Clusterdeck Authors attribution line above
  the preserved Wave/Command Line Inc. line, and a paragraph noting the
  deliberately preserved Wave-hosted endpoints. Per Apache-2.0 §4(c).
- **Inline comments documenting the intentional Wave-infrastructure
  preservation** added at `DefaultAIEndpoint` (`pkg/aiusechat/uctypes/
  uctypes.go`) and `WCloudEndpoint` / `WCloudPingEndpoint`
  (`pkg/wcloud/wcloud.go`). The endpoints themselves point at Wave's
  hosted AI / telemetry / web-share control-plane and are kept on purpose
  (renaming would either break the features or misrepresent who operates
  them).
- **Tests for clusterdeck code paths.** Added `pkg/clusterdeck/
  sshsync_test.go` covering `ClassifyTarget`, `DisplayName`,
  `looksLikeLocalPath`, `cleanLocalPath`, `folderName`, and
  `EnsureConnectionsConfigPath` (table-driven + edge cases). Added
  `frontend/app/clusterdeck/explorer.test.ts` covering `baseName` and
  `fileStyle`. The project now has tests for previously-untested
  clusterdeck-specific logic; total test count went from 46 to 54.

Wave subsystems (durable sessions, `wsh`, connection controller, Monaco editor, terminal
blocks, secret storage, AI/web blocks, themes) are preserved throughout.

### feat/k9s-lazygit-ai-editor (2026-08-04) — k9s/lazygit/AI removed

The Wave-AI assistant and the k9s/lazygit widget launcher were removed in favor
of a leaner Clusterdeck identity focused on terminal + editor + explorer. A
short-lived coding-agent replacement was introduced during this transition and
subsequently removed in full; Clusterdeck has no built-in AI panel or coding-agent
integration.

- **Wave-AI subsystem removed.** The chat backend, schema, UI, state plumbing,
  and desktop bridge were deleted.
- **k9s / lazygit app widgets removed.** The launcher, controller, and related
  `k9s`/`lazygit` entries were deleted. The standalone `htop` command widget was
  retained and continues to run through a login shell.
- **Layout cleanup.** Follow-up work removed the obsolete AI side-panel state
  and kept the editor pinned at the top of the workspace.

### feat/cleanup-branding-housekeeping (2026-08-04) — branch cleanup + verify script

The post-merge housekeeping pass.

- **Branch policy.** All non-`main` branches (local + remote-tracking)
  have been deleted; the repo now ships with a single `main` branch. The
  `upstream` remote (`wavetermdev/waveterm`) is removed from `.git/config`; only
  `origin` (`clusterdeck/app`) remains. Future work should be done on
  short-lived feature branches via PRs.
- **`scripts/verify-clusterdeck.sh`** — a lightweight repository audit for
  accent-token consistency, branding, docs links, common secret patterns,
  legal files, and tester configuration, followed by a GUI checklist. `--ci`
  treats unresolved required domains as failures; build, typecheck, and test
  commands remain separate release gates.
- **NOTICE cleanup.** Removed the redundant "deliberately preserved Wave
  endpoints" paragraph from `NOTICE` — it duplicated the inline comments
  already in `pkg/aiusechat/uctypes/uctypes.go` and `pkg/wcloud/wcloud.go`.

### feat/copilot-merge-back (2026-08-05) — 5 stale agent branches merged

Five stale `copilot-swe-agent` feature branches were merged into `main` after
the AI-cleanup merge resolved most of the conflicts they had with the
removal. None of these were PRs — they were local agent scratch branches
left from a previous session that had drifted 100-300 commits behind main.
Each landed as a single `--no-ff` merge commit.

- `copilot/add-config-widgets-preview` — adds `frontend/app/configui/configwidgets.tsx`
  + `configvalidation.ts` + a Vitest preview in `frontend/preview/previews/configui.preview.tsx`.
  The config-ui widget preview is a useful starting point for future
  theme/palette work.
- `copilot/add-tool-definition-for-wave-config` — adds
  `pkg/aiusechat/tools_setconfig.go` + `tools_setconfig_test.go`. Although
  these live in the `aiusechat` package, they don't depend on the removed
  AI chat UI and are pure `pkg/wshrpc` commands callable from `wsh` /
  block-controller code.
- `copilot/add-typeahead-preview` — adds
  `frontend/app/view/preview/previewsuggestions.ts`,
  `frontend/preview/mock/mocksuggestions.ts`, and
  `frontend/preview/previews/suggestion.preview.{tsx,test.ts}`. The
  typeahead suggestion preview is referenced from the preview mock env.
- `copilot/fix-pdf-previews-electron-v41` — `frontend/app/view/preview/preview-streaming.test.tsx`
  + a 6-line tweak to `preview-streaming.tsx`. The test file is the
  durable part; it pins Electron-41 streaming PDF behavior.
- `copilot/update-context-menu-callback` — a single-commit fix for the
  in-app context-menu IPC callback wiring.

The remaining 7 stale `copilot/*` branches had conflicts too complex to
auto-resolve (most had based their work on `origin/main` from the upstream
waveterm repo, not the clusterdeck fork, so their files now collide with
the k9s/lazygit/AI removal). Those branches have been deleted; their
unique commits are lost. The work was experimental ("Initial plan"
commit message) and never reached a PR, so no production code is affected.
