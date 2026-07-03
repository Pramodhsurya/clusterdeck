# Clusterdeck — Claude Code Project Instructions

Build **Clusterdeck**: a fork of **Wave Terminal** reshaped into a VS Code–style,
multi-cluster SSH workspace. The core idea is **connection = workspace**: selecting
an SSH connection sets context for the whole window (explorer, editor, all terminals),
and each connection remembers its own layout.

This file is the behavioral contract. The three reference docs below are the source of
truth for *what* to build; this file governs *how* to work.

## Reference docs (read before acting)
@docs/clusterdeck/clusterdeck-design-considerations.md   <!-- full UX + data model spec -->
@docs/clusterdeck/clusterdeck-building-on-wave.md         <!-- fork strategy, 5 changes, spike, phases -->
@docs/clusterdeck/clusterdeck-mockup.html                 <!-- the approved visual target -->

> The `.html` mockup is the visual ground truth — match it, don't reinvent it.
> Wave's own upstream `CLAUDE.md` is preserved at `docs/wave/CLAUDE.md` for build reference.

---

## Golden rules (non-negotiable)

1. **Spike before features.** Do the §6 spike in the fork-plan doc FIRST and report
   results. Do NOT write feature code until the three load-bearing questions are
   answered (layout templating, workspace-level connection inheritance, explorer→editor
   routing). If any is infeasible, STOP and flag it — do not force a workaround.
2. **Verify Wave internals against the live repo.** File paths in the docs
   (`frontend/app/view/term/`, `preview-model.ts`, the workspace switcher near
   `tabbar.tsx`, etc.) are from Wave's architecture docs and may be stale. Confirm
   actual paths/schema by reading the cloned code before editing.
3. **Preserve Wave features.** Keep durable sessions, `wsh`, the connection controller,
   Monaco editor, terminal blocks, secret storage, AI/web blocks, and themes intact.
   Only reshape what the 5 changes require. Do not remove Wave subsystems.
4. **Single blue accent.** Use one theme token for the accent (the blue in the mockup),
   including terminal prompt colors. No Wave green. Define it as a token; never hard-code.
5. **Never use GitHub's Fork button.** This is a private mirror, not a network fork
   (see Git workflow below).
6. **Don't touch files outside the change's scope** — keep merge surface small for
   upstream rebases.

---

## The build — 5 reshaping changes (detail in fork-plan doc §3)

1. **Workspace Switcher → SHELL CONNECTIONS rail** — vertical, collapsible; status dots,
   `⌘1–⌘n` hotkeys, active-connection subline ("N terminals · custom layout").
2. **Seed connections from `~/.ssh/config`** — one auto-saved workspace per host;
   handle `ProxyJump`/`Match`/`Include` via a real parser.
3. **Lock block connection to the workspace** — new blocks inherit the workspace
   connection via the config cascade; hide the per-block connection picker.
4. **Default IDE layout template** — seed full-height explorer + top editor + terminal(s)
   on first open; persist per-connection after; add "reset layout to default".
5. **Explorer → top-editor routing** — file click opens in the designated editor block,
   not in-place or a new block.

Terminals: add/remove/split freely; all bound to the active session (no per-terminal
connection choice).

---

## Git workflow (private now, public later)

- Origin is a **private mirror** of Wave, not a fork. Upstream is added as a remote for
  pulling updates; pushing to upstream is disabled.
- `main` tracks a clean-ish mirror of upstream. Do each of the 5 changes on its own
  feature branch (`feat/connections-rail`, `feat/workspace-connection-lock`, …).
- Sync upstream with `git fetch upstream` then `merge`/`rebase` — never re-mirror
  (it would overwrite work).
- Keep changes cohesive per branch to minimize rebase conflicts.

## Security (non-negotiable)

- **Never commit secrets.** `.env`, `*.key`, tokens, API keys stay out of git — a key
  committed while private still leaks when the repo goes public.
- Maintain a strict `.gitignore` (Electron + Go + Node build output, `node_modules/`,
  `.env*`, `*.key`).
- Before any visibility flip to public: run `gitleaks`/`trufflehog` over full history,
  license-scan the dependency tree, confirm LICENSE/NOTICE/CHANGES are correct.

## Apache-2.0 compliance

- Keep Wave's `LICENSE` intact; reproduce its `NOTICE` if present.
- Maintain a top-level `CHANGES.md` stating this is a derivative of Wave Terminal and
  what was modified.
- **No Wave branding** — no "Wave" name or logo in Clusterdeck's own assets/strings.

---

## Working style

- **Plan first for anything multi-file.** Propose the approach and the files you'll
  touch before editing; wait for confirmation on non-trivial changes.
- **Ask when a Wave assumption doesn't hold** rather than guessing or forcing it.
- **Prefer small, verifiable steps.** Build, run, and confirm each change against the
  mockup before moving on.
- **Stop and report** at: end of the spike, before the first feature branch, and before
  any git history rewrite or visibility change.
- When done with a change, state what to test manually to confirm it matches the mockup.

## Definition of done (per change)

- Matches the approved `.html` mockup for that zone.
- Wave's kept features still work (durable sessions, editor, splits).
- On its own branch, rebased cleanly on latest `upstream/main`.
- No secrets added; `.gitignore` still covers build artifacts.
