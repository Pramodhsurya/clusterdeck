# Clusterdeck release notes

## 0.1.x line — lean shell, explorer, and editor

The 0.1.x line is the first public Clusterdeck line. It derives from Wave Terminal 0.14.5 and is macOS-first, with Apple Silicon as the published package target.

### 0.1.4 — privacy, layout, and product consistency

- Removed the built-in Wave AI subsystem and the short-lived coding-agent integration.
- Removed the k9s and lazygit launcher widgets and their Kubernetes launcher code. The simple `htop` widget remains and runs in a login shell.
- Pinned the routed editor to the top of the workspace and hardened editor, workspace, keyboard, screen-reader, and layout behavior.
- Integrated config preview/typeahead, PDF preview, and context-menu fixes.
- Made telemetry consent non-retroactive, removed dead legacy activity collection, and kept `WAVETERM_NOPING` as an additional ping override.
- Hard-disabled the inherited Wave updater and feed; 0.1.4 updates use Homebrew and this repo's own [Releases](https://github.com/Pramodhsurya/clusterdeck/releases).
- Corrected application, package-lock, release-history, legal-notice, documentation, and deployment identity.
- Replaced inherited product documentation with macOS-first Clusterdeck documentation and an operator-specific privacy policy.

### 0.1.3 — editor autosave and file switching

The immutable `v0.1.2..v0.1.3` range contains three editor fixes, the version/release-note updates, and an incidental `.gitignore` update:

- Added 600 ms debounced editor autosave without disrupting Monaco undo history.
- Flushed a pending save to the correct file when switching or closing files.
- Corrected stale content and stale flashes when switching between open files.
- Updated the application version/onboarding notes and `.gitignore`; this range did not add editor test files.

### 0.1.2 — launcher PATH, Homebrew guidance, and branding

The immutable `v0.1.1..v0.1.2` range contains:

- Started the then-present k9s, lazygit, and htop command widgets in a login shell so Homebrew-installed tools can be found on PATH.
- Documented automatic quarantine clearing and how to force a Homebrew tap refresh.
- Corrected remaining user-facing Wave branding in dialogs and errors.
- Bumped the application version to 0.1.2.

### 0.1.1 — app widgets, connections, and explorer fixes

- Added the original k9s, lazygit, and htop launcher widgets.
- Fixed explorer reconnection behavior and added VS Code-style file operations.
- Fixed remembered-password connection timing and improved workspace history.

### 0.1.0 — first Clusterdeck release

- Made the selected connection the workspace context for the explorer, editor, and new terminals.
- Added the full-height SFTP explorer, open-editors list, routed Monaco editor, and per-connection layout persistence.
- Preserved inherited `wsh`, terminal widgets, and durable SSH sessions.

See [`CHANGES.md`](./CHANGES.md) for the derivative-work change record. The annotated `v0.1.2` and `v0.1.3` tags remain immutable historical boundaries.

## Building and validating a release

Clusterdeck does not use the inherited Wave signing, notarization, S3, or multi-platform package-manager pipeline.

1. Start from a clean checkout of `main`. Confirm `package.json`, `package-lock.json`, onboarding, and release notes all use the intended version.
2. Install exactly the locked dependencies with `npm ci`.
3. Run the release gates:

   ```sh
   go test ./...
   npm test -- --run
   npx tsc --noEmit
   npm run build:prod
   npm run typecheck --workspace docs
   npm run build --workspace docs
   git diff --check
   ```

4. Build the unsigned Apple Silicon DMG from the prospective release commit with `task package -- --mac dmg --arm64`. Inspect the packaged About/version metadata and smoke-test onboarding, SSH workspace switching, the explorer/editor, terminal override, and telemetry opt-in/opt-out.
5. Only after validation, create an annotated release tag on that exact commit and publish matching artifacts and notes as a [GitHub Release](https://github.com/Pramodhsurya/clusterdeck/releases) on this repo, used by the Homebrew cask. Clusterdeck artifacts are currently unsigned and not notarized; do not claim otherwise.
6. Update [Pramodhsurya/homebrew-tap](https://github.com/Pramodhsurya/homebrew-tap) with the exact version, artifact URL, and checksum, then test tap refresh, install, and upgrade.

Do not move or recreate an existing release tag. GitHub Pages deployment and the documentation custom domain have their own workflow and external DNS/TLS prerequisites; see [`docs/README.md`](./docs/README.md).
