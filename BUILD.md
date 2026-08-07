# Building Clusterdeck

Clusterdeck is macOS-first. The supported release artifact is currently an unsigned, unnotarized Apple Silicon application. Cross-platform code inherited from Wave remains in the repository, but this document does not claim supported Windows or Linux releases.

## Prerequisites

Install:

- macOS on Apple Silicon
- Go (the version required by `go.mod`)
- Node.js 22 LTS and npm
- [Task](https://taskfile.dev/installation/)
- Xcode Command Line Tools

## Clone and initialize

```sh
git clone https://github.com/clusterdeck/app.git clusterdeck
cd clusterdeck
task init
```

`task init` installs the locked Node dependencies and required Go tooling. Use `npm ci` directly when validating the dependency lock.

## Development

```sh
task dev
```

This starts Electron through the Vite development server with hot reload. Use `Cmd+Option+I` for Chromium developer tools. Development backend logs are under `$HOME/Library/Application Support/clusterdeck-dev/waveapp.log`; `waveapp.log` is an inherited compatibility filename.

For a standalone development build without hot reload:

```sh
task start
```

## Production build and package

Build the production frontend and Electron processes:

```sh
npm run build:prod
```

Build the current release target:

```sh
task package -- --mac dmg --arm64
```

Electron Builder writes the DMG under `make/` using the configured `Clusterdeck-mac-arm64-<version>.dmg` naming pattern. It is not signed or notarized. See [`INSTALL.md`](./INSTALL.md) for Gatekeeper guidance and [`RELEASES.md`](./RELEASES.md) for the complete release validation and Homebrew publication flow.

## Validation

Before proposing a release-affecting change, run:

```sh
go test ./...
npm test -- --run
npx tsc --noEmit
npm run build:prod
npm run typecheck --workspace docs
npm run build --workspace docs
git diff --check
```
