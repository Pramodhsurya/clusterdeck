# Clusterdeck — Building on Wave Terminal

Implementation plan for delivering the Clusterdeck design (see `clusterdeck-design-considerations.md`) as a **fork of Wave Terminal** — layering the *connection-as-workspace* model on top while preserving Wave's existing features wherever they don't conflict.

> License: Wave is **Apache-2.0** — forking and reshaping is permitted, no copyleft trap.

---

## 1. Why Wave fits — concept mapping

Wave's object model is `Client → Window → Workspace → Tab → Block`, all persisted in SQLite. Our concepts map onto it cleanly:

| Clusterdeck concept | Wave primitive | Fit |
|---|---|---|
| Connection **is** the workspace | Wave **Workspace** (own tabs, layout, settings; persisted) | Near-perfect |
| SHELL CONNECTIONS rail (left, collapsible) | Wave **Workspace Switcher** (already left of the tab bar, has icon/color/name) | Repurpose + restyle |
| Per-connection persisted layout | Workspace auto-persistence | **Free** |
| All terminals bound to one connection | Workspace default connection + config cascade (`connection settings` layer) | Hook existing layer |
| Explorer + editor + terminals | Blocks in a tab's tiled layout, seeded from a template | Custom seed template |
| Add / remove / split terminals | Native block add/remove/split | **Free** |
| Explorer click → opens in top editor | Preview (directory) block → editor block | Custom routing |
| Collapsible connections rail | Workspace Switcher UI | Extend |

The architectural risk from the "build vs fork" decision — Wave's *free-floating block* model vs our *fixed IDE layout* — turns out to be small: we don't remove block flexibility, we just **seed a default template** and **lock the per-block connection to the workspace**.

---

## 2. Keep as-is (do not touch)

These Wave subsystems are orthogonal to our needs and are preserved untouched:

| Feature | Why keep |
|---|---|
| **Durable SSH sessions** (v0.14+) | Solves our hard §8.2 reconnect problem for free — sessions survive network drops, sleep, restarts |
| **Connection controller** (`conncontroller`, SSH + WSL, auto `wsh` agent) | Battle-tested remote layer; do not reinvent |
| **Terminal block** (`frontend/app/view/term/`, xterm.js via `termwrap.ts`) | Our terminals, already done |
| **Monaco editor / preview block** (`frontend/app/view/preview/`) | Our editor, already done |
| **SQLite `wstore` persistence** | Our per-connection layout persistence, already done |
| **`wsh` command system** | Bonus power; keep |
| **Secret storage** (native keychain) | Our credential storage requirement, already done |
| **AI blocks, web blocks, themes, block splitting** | Bonus features; keep available, just not in the default template |

Net: Phases 1–3 and 6 of the original design doc are **largely pre-built** by Wave.

---

## 3. Reshape (modify Wave)

Ordered by how load-bearing each change is. File paths are from Wave's published architecture docs and **must be re-confirmed against the current repo** at fork time (see §6 spike).

### 3.1 Workspace Switcher → SHELL CONNECTIONS rail
- **What:** Restyle the Workspace Switcher into the vertical, collapsible connections rail: status dots (green/gray), `⌘1–⌘n` hotkeys, active-connection secondary line ("3 terminals · custom layout"), footer count.
- **Where:** Workspace Switcher component (left of `frontend/app/tab/tabbar.tsx`).
- **Effort:** Medium. UI restyle + collapse toggle; the underlying switch-workspace machinery stays.

### 3.2 Connections seeded from `~/.ssh/config`
- **What:** On startup, parse `~/.ssh/config`, and for each host ensure a **saved** workspace exists (name = host, connection = host). This is the source of truth per design §8.1; Wave's own connection config layers on top.
- **Where:** Backend, alongside `conncontroller` / connection config loading (Go). Persist workspaces via `wstore`.
- **Effort:** Medium. Wave already has a connections config system — extend it to auto-generate workspaces from ssh config.
- **Note:** Wave workspaces are *ephemeral unless saved* — connection workspaces must be **auto-saved** so they persist across restarts (see §5 conflict C4).

### 3.3 Lock block connection to the workspace connection
- **What:** New blocks default to the workspace's connection; the per-block connection picker in the block header is **hidden/disabled**. This enforces "all terminals = one session, no per-terminal selection."
- **Where:** Block frame connection management (`BlockFrame` / `manageConnection` atom in `frontend/app/view/term/term-model.ts`) + the config cascade (`getOverrideConfigAtom`): set a **workspace-level connection** that blocks inherit.
- **Effort:** Medium. Leverages the existing `connection settings` cascade layer rather than fighting it.

### 3.4 Default IDE layout template
- **What:** When a connection workspace is first opened, seed one tab with the fixed default: full-height directory/preview block (explorer) + editor block (top) + terminal block(s) (bottom), pre-arranged. After first open, Wave's normal persistence remembers any user changes.
- **Where:** Layout / tile system (NodeModel) + block creation on workspace init.
- **Effort:** Medium-high. Needs a layout-template mechanism seeded at workspace creation.

### 3.5 Explorer → top-editor click routing
- **What:** Clicking a file in the explorer (directory preview) block opens it in the **designated top editor block**, not in-place and not a new floating block.
- **Where:** Preview block model (`frontend/app/view/preview/preview-model.ts`) — on file activate, resolve the tab's editor block and load the file there.
- **Effort:** Medium. Custom target resolution; the "open file in Monaco" path already exists.

---

## 4. Add (new code)

| Addition | Notes |
|---|---|
| ssh-config → workspace sync service | Parse `~/.ssh/config` (handle `ProxyJump`, `Match`, `Include`); reconcile to saved workspaces. Use a proven parser, not hand-rolled. |
| Connection status polling → rail dots | May partly exist via Wave connection monitoring; surface it in the rail. |
| Layout-template definition | The default three-zone seed (§3.4) as data, plus a "reset layout to default" action per connection. |
| Hotkey map `⌘1–⌘n` → switch connection workspace | Bind to Wave's workspace-switch action. |

---

## 5. Conflict register (Clusterdeck need vs Wave default)

| # | Conflict | Resolution |
|---|---|---|
| C1 | Per-block connection selection vs *connection = workspace* | Lock block connection to workspace connection (§3.3); hide per-block picker |
| C2 | Free block placement vs fixed default layout | Seed default template (§3.4); **keep** Wave's resize/add/remove/split (we want those too) — only the *default* and the *connection binding* are constrained |
| C3 | Explorer opens in-place / new block vs *open in top editor* | Custom routing (§3.5) |
| C4 | Workspaces ephemeral unless saved vs connections must persist | Auto-save connection workspaces (§3.2) |
| C5 | Wave AI / extra blocks in default view | Keep them **available** but not in the seeded template — no conflict, just curation |

No conflict requires ripping out a Wave subsystem. All are additive constraints or UI reshaping.

---

## 6. Pre-fork spike (half a day, do this first)

Before committing, clone the repo and confirm the load-bearing assumptions:

1. **Layout templating** — can a tab be seeded with a fixed block arrangement programmatically at workspace creation? (§3.4 is the highest-risk item.)
2. **Workspace-level connection** — does the config cascade let us set a connection at the *workspace* level that blocks inherit, or only global/per-block? (§3.3)
3. **Explorer target routing** — can a directory-block file activation be redirected to a specific editor block? (§3.5)
4. **Workspace Switcher extensibility** — how coupled is it to workspace semantics; can it carry status dots + a collapse state? (§3.1)
5. **Confirm current file paths / object schema** vs the paths in this doc.

If 1–3 are feasible without deep surgery → **fork Wave** and proceed. If any is load-bearing-everywhere and unbendable → fall back to the fresh Tauri build (design doc §7).

---

## 7. Revised build phases (fork path)

| Phase | Deliverable | Notes |
|---|---|---|
| 0 | Fork, build Wave locally, run from `~/Applications` (MDM check) | Confirms build + no-admin launch |
| 1 | Spike (§6) | Go/no-go on the fork |
| 2 | ssh-config → auto-saved connection workspaces (§3.2) | Backend |
| 3 | Rail restyle + collapse + status/hotkeys (§3.1) | Frontend |
| 4 | Lock block connection to workspace (§3.3) | Enforces the core model |
| 5 | Default IDE layout template + reset action (§3.4) | Seeds the three-zone layout |
| 6 | Explorer → top-editor routing (§3.5) | Completes the click behavior |
| 7 | Polish vs approved mockup; keep durable sessions, wsh, secrets intact | Ship |

Durable sessions (original design §8.2, the "hard part") come **free** from Wave — a major reason this fork wins over the fresh build.

---

## 8. Upstream hygiene

- Keep changes in cohesive modules to ease rebasing against upstream Wave.
- Track the fork point commit; periodically rebase for durable-session / connection fixes.
- Avoid editing files unrelated to §3 changes — reduces merge conflict surface.
- Consider whether any change (e.g. ssh-config sync) is worth contributing upstream rather than carrying in the fork.
