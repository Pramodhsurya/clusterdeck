# Contributing to Clusterdeck

Clusterdeck is a focused, macOS-first derivative of Wave Terminal. Contributions are welcome when they preserve the connection-as-workspace design and keep changes reviewable.

## Before changing code

- Small bug fixes and documentation corrections may be submitted directly.
- For new features, UI changes, default-behavior changes, refactors, or broad cleanup, open a [GitHub issue](https://github.com/clusterdeck/app/issues) first to align on scope.
- Keep one pull request to one logical change. Do not reformat or clean up unrelated files.
- Preserve inherited compatibility identifiers such as Go module paths, `WAVETERM_*` environment variables, and `~/.waveterm/bin/wsh` unless an approved migration explicitly replaces them.
- Preserve the upstream license and attribution. Record substantive derivative changes in [`CHANGES.md`](./CHANGES.md).

## Development workflow

1. Follow [`BUILD.md`](./BUILD.md) to initialize and run Clusterdeck.
2. Add focused tests for changed behavior.
3. Run relevant Go, TypeScript, Vitest, production-build, and docs gates.
4. Run `git diff --check` and review the final diff for unrelated changes.
5. Open a pull request against `main` and explain the user-visible behavior, tests, and any compatibility impact.

The project uses American English, `gofmt` for Go, and the repository's Prettier configuration for supported frontend files. Security vulnerabilities should follow [`SECURITY.md`](./SECURITY.md), not a public issue. All contributors must follow [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
