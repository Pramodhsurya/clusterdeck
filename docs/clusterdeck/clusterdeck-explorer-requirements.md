# Clusterdeck — Explorer & Editor Requirements

Design requirements for the file-navigation surface: **OPEN EDITORS**, a **VS Code–style
file tree**, and **editor tabs**. This replaces Wave's default directory view (the
`Name · Perm · Size · Type` table) with a tree-based explorer.

Scope: this is **change #6** in the fork plan (`clusterdeck-building-on-wave.md`) and is
the largest of the reshaping items — Wave's directory *is* the table view, so this
reworks or replaces the directory/preview block.

Requirement IDs (`E#`, `T#`, `X#`, `G#`) are for traceability from code + tests.

---

## 1. Layout

The explorer is a **full-height column** (right of the connections rail), top to bottom:

```
┌─ EXPLORER ─────────────┐
│ ▾ OPEN EDITORS         │   ← section 1
│    × consumer.py       │
│    × pipeline.py       │
│    × payload.json   M  │
│ ▾ NNSERVER             │   ← section 2 (project root = active connection cwd)
│   ▸ .claude          • │
│   ▾ ds-image-tagging • │
│       consumer.py    • │
│       pipeline.py      │
│       payload.json   M │
│   ▸ tests              │
│     Dockerfile         │
│     README.md        • │
└────────────────────────┘
```

Editor tabs live in the **editor pane header**, not the explorer.

---

## 2. OPEN EDITORS (E#)

| ID | Requirement |
|----|-------------|
| E1 | Collapsible section at the top of the explorer listing every file currently open in the editor. |
| E2 | Each entry shows a file-type icon, filename, and an `×` close control (hover or persistent). |
| E3 | Closing an entry closes the corresponding editor tab, and vice versa — the list mirrors open tabs 1:1. |
| E4 | The active file is visually highlighted, in sync with the active editor tab and the tree selection. |
| E5 | Unsaved/modified files show a dirty indicator (`M` marker or dot). |
| E6 | Entries reflect **only** the active connection's open files (per connection = workspace). |

---

## 3. File tree (T#)

| ID | Requirement |
|----|-------------|
| T1 | Render the active connection's remote filesystem as a collapsible tree over SFTP, rooted at the workspace cwd. |
| T2 | Folders show an expand/collapse chevron (`>` collapsed, `v` expanded) and a folder icon; files show a type-specific icon. |
| T3 | Children **lazy-load** on folder expand (do not walk the whole remote tree upfront). |
| T4 | Clicking a **file** opens it in the **top editor block** (see X1); clicking a **folder** toggles expand/collapse. |
| T5 | The currently open file is highlighted in the tree, kept in sync with tabs + OPEN EDITORS. |
| T6 | Standard file-type icons (py, json, dockerfile, md, sh, etc.); unknown types get a generic file icon. |
| T7 | Refresh control re-reads the remote tree (re-runs SFTP listing for expanded nodes). |
| T8 | Switching connection swaps the tree to that connection's filesystem and restores its expanded state (per §layout persistence in the design doc). |

---

## 4. Editor tabs (X#)

| ID | Requirement |
|----|-------------|
| X1 | Files open in a **single designated editor block** at the top of the layout — not in-place in the tree, not a new floating block. (This is change #5; the tree is its trigger.) |
| X2 | Each open file is a tab with type icon, filename, `×` close, and a dirty dot when modified. |
| X3 | The active tab is highlighted (accent underline); clicking a tab focuses that file. |
| X4 | Tabs, OPEN EDITORS, and tree selection stay mutually in sync (one source of "active file"). |
| X5 | Editing + save writes back to the remote host over SFTP (existing Wave editor capability). |

---

## 5. Cross-cutting (C#)

| ID | Requirement |
|----|-------------|
| C1 | **Single blue accent token** for all selection/active states (tab underline, tree highlight, active row). No Wave green. |
| C2 | Explorer content is scoped to the **active connection** — it is part of the per-connection workspace, not global. |
| C3 | Explorer is collapsible as a whole (consistent with the connections rail collapse behavior). |
| C4 | Dirty state is one model shared by OPEN EDITORS, tabs, and tree (`M` / dot come from the same source). |

---

## 6. Git decorations (G#) — optional for v1

| ID | Requirement |
|----|-------------|
| G1 | Files show a git-status indicator: **blue dot = added/untracked**, **amber `M` = modified**. (Remap of VS Code's green/orange to the blue accent + amber.) |
| G2 | Folder rows roll up a dot if any descendant is changed. |
| G3 | Status is computed from a git query **over the active SSH connection** (the remote repo), refreshed on tree refresh and after save. |

> **Deferral note:** the tree (T#) and tabs (X#) are the core. Git decorations (G#) add
> real work because they require running git per-file/status over SSH, which Wave's file
> preview does not do today. **Recommend shipping T#/X#/E# first and adding G# in a later
> pass** unless git status is a v1 must-have.

---

## 7. Wave implementation notes

- Wave's directory block renders the table view (`frontend/app/view/preview/`). This
  requirement set means **replacing that view with a tree** or adding a new explorer
  block type — confirm which is cleaner against the live code during the spike.
- SFTP listing already exists in Wave's connection layer — reuse it for T1/T3 rather
  than adding a new transport.
- The "open in the designated editor block" wiring (X1) is shared with change #5; build
  them together.
- Git status (G#) has **no existing Wave equivalent** — treat as net-new, hence the
  deferral.

---

## 8. Acceptance criteria

- [ ] Explorer shows OPEN EDITORS + tree, not the Perm/Size/Type table.
- [ ] Expanding a folder lazy-loads its children over SFTP.
- [ ] Clicking a file opens it in the top editor block as a tab; the tree row, tab, and OPEN EDITORS entry all highlight in sync.
- [ ] Closing from OPEN EDITORS or the tab closes the same file; dirty state is consistent across all three.
- [ ] Switching connection swaps the tree + open editors to that workspace and restores expanded state.
- [ ] All active/selection states use the blue accent; no green anywhere.
- [ ] (If G# in scope) changed files show blue-dot / amber-`M`; folders roll up.

---

## 9. Open decisions

1. **Git decorations in v1?** (G# scope — see deferral note.)
2. **Multi-root explorer** or single root per connection? (Design assumes single root = workspace cwd.)
3. **Tree state persistence granularity** — remember expanded folders per connection, or reset to root on each switch? (Design leans: remember, per the per-connection layout model.)
