# Spike report — §6 pre-fork questions (fork plan)

Date: 2026-07-02. Verified against fork point `c99022c1` (Wave v0.14.5 line).

**Verdict: GO.** All three load-bearing questions are feasible without deep surgery.
No Wave subsystem needs to be removed or fought.

> **Post-fork note (2026-08-05):** the verdict held for the IDE-layout work in
> 0.1.0–0.1.2. In 0.1.3 two Wave subsystems *were* removed — Wave-AI
> (`pkg/aiusechat/` ~21k lines) and the k9s/lazygit/htop widget launcher —
> because they didn't fit Clusterdeck's lean shell+editor identity. See
> [`../../CHANGES.md`](../../CHANGES.md) for the full list and reasoning.

---

## 1. Layout templating — YES (mechanism already exists)

Wave has a first-class portable-layout mechanism, used for its own starter layout:

- `pkg/wcore/layout.go:28` — `PortableLayout`: list of `{IndexArr, Size, BlockDef, Focused}`
  describing a block tree by index path (e.g. `[1,2]` = second child of node 1).
- `pkg/wcore/layout.go:116` — `ApplyPortableLayout(ctx, tabId, layout)`: creates the blocks
  and queues `insertatindex` layout actions; the frontend layout engine applies them.
- `pkg/wcore/workspace.go:253` — `CreateTab` already calls
  `ApplyPortableLayout(tab.OID, GetNewTabLayout(), true)`.

**Clusterdeck change (§3.4):** add a `GetClusterdeckLayout(conn string)` PortableLayout
(explorer preview + editor + terminals) and call it from `CreateTab` for connection
workspaces. "Reset layout to default" = re-run `ApplyPortableLayout` (its first action is
`ClearTree`). Effort: **small** (doc estimated medium-high; it's less).

## 2. Workspace-level connection — YES (via Workspace.Meta + one choke point)

- The frontend config cascade (`getOverrideConfigAtom`, `frontend/app/store/global.ts:177`)
  is **block meta → connection config → global settings** — there is *no workspace layer*
  today.
- But the binding that matters is just `block.meta.connection`, read by
  `pkg/blockcontroller/*.go` when starting shells.
- `waveobj.Workspace` already has a `Meta MetaMapType` field (`pkg/waveobj/wtype.go:182`) —
  a natural home for `clusterdeck:connection`.
- All block creation paths (Cmd+N, splits, widgets, portable layout seeding, wsh) flow
  through `CreateBlockWithTelemetry` (`pkg/wcore/block.go:65`).

**Clusterdeck change (§3.3):** in `CreateBlock`, when the blockDef has no `connection`,
resolve tab → workspace → `workspace.Meta["clusterdeck:connection"]` and inject it.
Today's frontend behavior (inherit from *focused block*, `keymodel.ts:371`) becomes
irrelevant/consistent since every block in the workspace carries the same connection.
Hide the per-block picker at its single render site:
`frontend/app/block/blockframe-header.tsx:266` (`ConnectionButton`). Effort: **small-medium**.

## 3. Explorer → top-editor routing — YES (existing RPC)

- File activation in the directory view is `model.goHistory(path)` — in-place — at
  `frontend/app/view/preview/preview-directory.tsx:531` (double-click) and `:665` (Enter).
- Cross-block meta writes are an established pattern:
  `RpcApi.SetMetaCommand(TabRpcClient, {oref, meta})` (used in `conntypeahead.tsx:360`,
  `workspace-layout-model.ts`, tab context menu).

**Clusterdeck change (§3.5):** mark the seeded editor block (e.g. meta
`clusterdeck:zone: "editor"`); on file activation in the explorer block, if the file is
not a directory, resolve the tab's editor block and `SetMetaCommand({oref: block:<id>,
meta: {file: path}})` instead of `goHistory`. Fallback to in-place when no editor block
exists. Effort: **small**.

## 4. Workspace Switcher — rebuild as rail, plumbing is all there

- Current switcher is a **Popover dropdown**, not a rail:
  `frontend/app/tab/workspaceswitcher.tsx` (264 lines, ExpandableMenu inside a Popover).
  So §3.1 is "replace the presentation," not "restyle" — slightly more work than the doc
  implies, but the component is small and self-contained.
- Data/actions needed by the rail already exist:
  - workspace list: `WorkspaceService.ListWorkspaces` (`pkg/service/workspaceservice`)
  - switching: `SwitchWorkspace` (`pkg/wcore/window.go:21`)
  - status dots: `getConnStatusAtom(conn)` (`frontend/app/store/global.ts:648`)
- Caveat found: `SwitchWorkspace` focuses another window if the target workspace is open
  there (multi-window case). Fine for the single-window model; keep in mind.

Effort: **medium** (pure frontend).

## 5. Path / schema corrections vs the docs

| Doc says | Actual |
|---|---|
| `preview-model.ts` | `frontend/app/view/preview/preview-model.tsx` (and the click lives in `preview-directory.tsx`) |
| switcher "near tabbar.tsx" | own file: `frontend/app/tab/workspaceswitcher.tsx` |
| `term-model.ts` `manageConnection` | connection UI actually in `frontend/app/block/blockframe-header.tsx` (`ConnectionButton`) + `frontend/app/modals/conntypeahead.tsx` |
| object model `Client → Window → Workspace → Tab → Block` | confirmed (`pkg/waveobj/wtype.go`) |
| workspaces ephemeral unless saved (C4) | confirmed: `DeleteWorkspace` (`pkg/wcore/workspace.go:132`) skips workspaces with **Name and Icon set** and ≥1 tab — auto-created connection workspaces must set name+icon to persist |

## Recommended feature-branch order (unchanged from fork plan §7)

1. `feat/ssh-config-workspaces` — ssh-config → auto-saved workspaces (§3.2)
2. `feat/connections-rail` — switcher → rail (§3.1)
3. `feat/workspace-connection-lock` — CreateBlock injection + hide picker (§3.3)
4. `feat/ide-layout-template` — PortableLayout seed + reset action (§3.4)
5. `feat/explorer-editor-routing` — SetMetaCommand routing (§3.5)
