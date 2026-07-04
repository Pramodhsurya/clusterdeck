# Installing Clusterdeck

Clusterdeck is **macOS-first** (Apple Silicon `arm64` is what's tested; Intel `x64`
builds too). There are **no prebuilt downloads published yet** — Clusterdeck lives in a
private repo, so for now you install it by building from the repository. Both paths
below are the ones used to produce the app.

![Installing Clusterdeck from source](docs/clusterdeck/images/clusterdeck-install.png)

> The Option A flow at a glance (animated version:
> [`clusterdeck-install-demo.html`](docs/clusterdeck/clusterdeck-install-demo.html)).

## Requirements

- **macOS** 11 or later
- **Node.js** ≥ 22 and **npm**
- **Go** ≥ 1.23
- **[Task](https://taskfile.dev)** (`go-task`) — the build runner
- **Git**

Install the toolchain with Homebrew:

```sh
brew install node go go-task/tap/go-task git
```

---

## Option A — Build & install the app (recommended)

Produces `Clusterdeck.app`, which you run like any other macOS app.

```sh
# 1. clone
git clone https://github.com/clusterdeck/clusterdeck.git
cd clusterdeck

# 2. install dependencies (JS + Go)
task init

# 3. build the app bundle (Apple Silicon)
task package -- --mac dir --arm64
#    -> output: make/mac-arm64/Clusterdeck.app
#    (plain `task package` instead builds signed-less .dmg + .zip for arm64 AND x64)

# 4. install to ~/Applications (no admin needed)
cp -R make/mac-arm64/Clusterdeck.app ~/Applications/

# 5. the local build is unsigned, so clear the quarantine flag once, then launch
xattr -dr com.apple.quarantine ~/Applications/Clusterdeck.app
open ~/Applications/Clusterdeck.app
```

> **Gatekeeper:** because this is a locally built, unsigned app, macOS may warn on first
> launch. The `xattr` step above avoids the prompt; alternatively right-click the app →
> **Open** → **Open**. (Once you sign/notarize a release, this goes away.)

The app stores its data in `~/Library/Application Support/clusterdeck-dev` and reads
config from `~/.config/clusterdeck-dev`.

---

## Option B — Run from source (for development)

Runs the app straight from the repo with hot-reload — no install step.

```sh
git clone https://github.com/clusterdeck/clusterdeck.git
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

## Option C — Direct download

Not available yet. Once signed, notarized releases are published, this section will link
to a `.dmg` on the repo's **Releases** page — download it, drag **Clusterdeck** to
**Applications**, done. Until then, use Option A.

---

## Upgrading

Pull the latest and rebuild:

```sh
git pull
task init
task package -- --mac dir --arm64 && cp -R make/mac-arm64/Clusterdeck.app ~/Applications/
```

Your workspaces and settings persist in `~/Library/Application Support/clusterdeck-dev`
across upgrades.

## Building from source (deeper reference)

For full multi-platform build details, code signing, and the component layout, see
[`BUILD.md`](BUILD.md) (inherited from upstream Wave Terminal; the toolchain is the same).
