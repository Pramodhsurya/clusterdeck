# Clusterdeck

A VS Code–style, multi-cluster SSH workspace. **The connection *is* the workspace** —
selecting an SSH connection in the left rail sets the context for the entire window
(the file explorer, the editor, and every terminal), and each connection remembers its
own layout. Switching clusters is a click, not a new window.

Clusterdeck is a fork of [Wave Terminal](https://www.waveterm.dev) reshaped from a
free-floating block terminal into a fixed IDE layout for working across many clusters
in a single window. macOS-first.

![Clusterdeck interface](docs/clusterdeck/images/clusterdeck-ui.gif)

> The three vertical zones — **connections rail**, **file explorer**, and **editor +
> terminals** — all bound to the active SSH connection.
> ([static image](docs/clusterdeck/images/clusterdeck-ui.png) ·
> [full mockup](docs/clusterdeck/clusterdeck-demo.html))

## Features

A mockup per feature (animated versions in
[`clusterdeck-features.html`](docs/clusterdeck/clusterdeck-features.html)):

|  |  |
|:--|:--|
| ![Connection = workspace](docs/clusterdeck/images/feat-connection.png) | ![VS Code–style explorer](docs/clusterdeck/images/feat-explorer.png) |
| ![Routed editor with tabs](docs/clusterdeck/images/feat-editor.png) | ![Session-bound terminals](docs/clusterdeck/images/feat-terminals.png) |
| ![Per-connection layout](docs/clusterdeck/images/feat-layout.png) | ![Durable SSH sessions](docs/clusterdeck/images/feat-durable.png) |

- **Shell connections rail** — a vertical, collapsible workspace switcher with status
  dots and `⌘1–⌘n` hotkeys; each connection is a saved workspace.
- **Connection = workspace** — new terminals, the editor, and the explorer all bind to
  the active connection; no per-block connection picker.
- **Full-height file explorer** — a VS Code–style tree over SFTP with an open-editors
  list, git decorations, and single-click open.
- **Routed editor** — clicking a file opens it in one designated Monaco editor pane
  (with editor tabs), never in-place or as a new floating block.
- **Per-connection layout** — the explorer/editor/terminal arrangement persists per
  connection and restores when you switch back.

It keeps Wave's durable SSH sessions, `wsh` command system, connection controller,
Monaco editor, terminal blocks, secret storage, and themes intact.

## Install

macOS-first (Apple Silicon). Easiest — via Homebrew:

```sh
brew tap clusterdeck/tap
brew install --appdir=~/Applications --cask clusterdeck   # no admin/sudo needed
```

(Drop `--appdir=~/Applications` to install into `/Applications` if you have admin rights.)

**⚠️ First launch will be blocked by Gatekeeper** — the build isn't code-signed or
notarized by Apple yet, so macOS shows *"Clusterdeck" Not Opened*. Fix it once:

```sh
xattr -dr com.apple.quarantine ~/Applications/Clusterdeck.app
```

(or right-click the app → **Open** → confirm **Open**, no Terminal needed). Only do
this for a build from clusterdeck's own
[homebrew-tap](https://github.com/clusterdeck/homebrew-tap) /
[releases](https://github.com/clusterdeck/releases) — clearing the quarantine flag
bypasses a real macOS security check, so only trust it for a source you trust. Full
notice and details in [`INSTALL.md`](INSTALL.md).

Or build from the repo:

```sh
git clone https://github.com/clusterdeck/app.git clusterdeck && cd clusterdeck
task init                                   # install deps (needs node, go, go-task)
task package -- --mac dir --arm64           # build make/mac-arm64/Clusterdeck.app
cp -R make/mac-arm64/Clusterdeck.app ~/Applications/ && \
  xattr -dr com.apple.quarantine ~/Applications/Clusterdeck.app
open ~/Applications/Clusterdeck.app
```

Or run from source with hot-reload: `task dev`. Full details — requirements, dev workflow,
upgrading, Gatekeeper notes — are in [`INSTALL.md`](INSTALL.md).

## Built on Wave Terminal

Clusterdeck is a derivative work of **[Wave Terminal](https://github.com/wavetermdev/waveterm)**
by Command Line Inc., and would not exist without it. Wave is a fantastic open-source
terminal — please check it out, and consider
[sponsoring the upstream project](https://github.com/sponsors/wavetermdev).

- **Upstream:** https://github.com/wavetermdev/waveterm
- **License:** Apache License 2.0 — Wave's original [`LICENSE`](./LICENSE) and
  [`NOTICE`](./NOTICE) are preserved unmodified at the repo root.
- **What we changed:** every substantive modification is recorded in
  [`CHANGES.md`](./CHANGES.md), per Apache-2.0 §4(b). Third-party dependency licenses are
  listed in [`ACKNOWLEDGEMENTS.md`](./ACKNOWLEDGEMENTS.md).

Clusterdeck is an independent project. It is **not affiliated with, sponsored by, or
endorsed by Command Line Inc.** "Wave" and "Wave Terminal" are names of the upstream
project and are used here only to credit and identify it.

## License

Clusterdeck is distributed under the **Apache License 2.0** — the same license as Wave
Terminal. See [`LICENSE`](./LICENSE) for the full text and [`NOTICE`](./NOTICE) for
attribution. Apache-2.0 permits private and commercial use; this fork keeps the upstream
attribution the license requires, which is what makes commercializing it safe.
