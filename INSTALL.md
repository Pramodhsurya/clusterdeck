# Installing Clusterdeck

Clusterdeck is **macOS-first** (Apple Silicon `arm64`). The easiest path is Homebrew;
building from source is there too if you want to hack on it.

![Installing Clusterdeck from source](docs/clusterdeck/images/clusterdeck-install.png)

> The build-from-source flow at a glance (animated version:
> [`clusterdeck-install-demo.html`](docs/clusterdeck/clusterdeck-install-demo.html)).

---

## ⚠️ Security notice — unsigned build

Clusterdeck is **not yet code-signed or notarized by Apple**. On first launch, macOS
will refuse to open it:

> **"Clusterdeck" Not Opened**
> Apple could not verify "Clusterdeck" is free of malware that may harm your Mac or
> compromise your privacy.

This is expected — every unsigned macOS app triggers this, not something specific to
Clusterdeck. **If you installed via Homebrew, this is handled for you automatically**
(the cask clears the quarantine flag as a post-install/post-upgrade step) — you
shouldn't need to do anything. If you built from source, or the app still won't open,
clear it manually:

**Terminal (fastest):**

```sh
xattr -dr com.apple.quarantine ~/Applications/Clusterdeck.app
```

(use `/Applications/Clusterdeck.app` instead if you installed system-wide)

**Finder (no Terminal needed):** right-click **Clusterdeck.app** → **Open** → confirm
**Open** in the dialog. Only needed once per install/update.

**Only do this for a build from an official source** —
[`clusterdeck/homebrew-tap`](https://github.com/clusterdeck/homebrew-tap),
[`clusterdeck/releases`](https://github.com/clusterdeck/releases), or one you built
yourself from [`clusterdeck/app`](https://github.com/clusterdeck/app). Clearing the
quarantine flag bypasses a real macOS security check, so only do it for a binary whose
origin you trust — never for a `.app` sent to you directly or downloaded from an
unfamiliar link. See [`SECURITY.md`](SECURITY.md) to report a vulnerability.

---

## Option A — Homebrew (recommended)

```sh
brew tap clusterdeck/tap
brew install --appdir=~/Applications --cask clusterdeck
```

`--appdir=~/Applications` installs with **no admin/sudo required** — the app runs fine
from your user Applications folder. Drop that flag to install into `/Applications`
system-wide instead (needs an admin password).

The build isn't code-signed/notarized yet, but the cask automatically clears the
quarantine flag after install (and after every upgrade), so Gatekeeper shouldn't block
launch. See the **security notice above** if it still does.

Upgrade later with `brew upgrade --cask clusterdeck`; uninstall with
`brew uninstall --cask clusterdeck`.

---

## Option B — Build & install from source

Produces `Clusterdeck.app` yourself, which you run like any other macOS app.

**Requirements:** macOS 11+, **Node.js** ≥ 22 + npm, **Go** ≥ 1.23,
**[Task](https://taskfile.dev)** (`go-task`), **Git** —
`brew install node go go-task/tap/go-task git`.

```sh
# 1. clone
git clone https://github.com/clusterdeck/app.git clusterdeck
cd clusterdeck

# 2. install dependencies (JS + Go)
task init

# 3. build the app bundle (Apple Silicon)
task package -- --mac dir --arm64
#    -> output: make/mac-arm64/Clusterdeck.app
#    (plain `task package` instead builds unsigned .dmg + .zip for arm64 AND x64)

# 4. install to ~/Applications (no admin needed)
cp -R make/mac-arm64/Clusterdeck.app ~/Applications/

# 5. the local build is unsigned, so clear the quarantine flag once, then launch
xattr -dr com.apple.quarantine ~/Applications/Clusterdeck.app
open ~/Applications/Clusterdeck.app
```

The packaged app stores its data in `~/Library/Application Support/clusterdeck` and
reads config from `~/.config/clusterdeck`. (Running via `task dev` instead uses
`clusterdeck-dev` — kept separate so dev and installed data never collide.)

---

## Option C — Run from source (for development)

Runs the app straight from the repo with hot-reload — no install step.

```sh
git clone https://github.com/clusterdeck/app.git clusterdeck
cd clusterdeck
task init
task dev          # launches the app; frontend changes hot-reload (⌘R)
```

For backend (Go / Electron main) changes, rebuild the server and relaunch:

```sh
task build:server:quickdev
task dev
```

---

## Upgrading

**Homebrew:** `brew upgrade --cask clusterdeck`.

**From source:** pull and rebuild:

```sh
git pull
task init
task package -- --mac dir --arm64 && cp -R make/mac-arm64/Clusterdeck.app ~/Applications/
```

Your workspaces and settings persist in `~/Library/Application Support/clusterdeck`
across upgrades either way.

## Building from source (deeper reference)

For full multi-platform build details, code signing, and the component layout, see
[`BUILD.md`](BUILD.md) (inherited from upstream Wave Terminal; the toolchain is the same).
