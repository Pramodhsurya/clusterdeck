# Clusterdeck Documentation

This is the home for Clusterdeck's documentation site. This README is specifically
about _building_ and contributing to the docs site. If you are looking for the actual
hosted docs, go to **https://docs.clusterdeck.app** (or, while the docs site is still
under construction, the design + requirements docs in this directory).

## What's in this folder

```
docs/
├── README.md                                     (this file)
├── clusterdeck/                                 Clusterdeck-specific design docs
│   ├── clusterdeck-design-considerations.md     Problem statement + comparison vs Wave
│   ├── clusterdeck-building-on-wave.md          Implementation plan + fork decisions
│   ├── clusterdeck-explorer-requirements.md     Explorer & editor UX requirements
│   ├── spike-report.md                          Pre-fork feasibility spike (2026-07-02)
│   └── images/                                  Screenshots, mockups, GIFs
└── node_modules/                                Docusaurus install (managed by `task docsite`)
```

The `clusterdeck/` subdirectory is the source of truth for design decisions.
`BUILD.md` and `INSTALL.md` (at the repo root) cover how to build and install
Clusterdeck itself.

## Building the docs site

Clusterdeck's docs site is built with [Docusaurus](https://docusaurus.io/), the same
generator upstream Wave uses. The site config lives at `docs-site/docusaurus.config.ts`
(not in this folder) — see the `docsite` task group in [`../Taskfile.yml`](../Taskfile.yml).

### Local development

```sh
task docsite
```

This command starts a local development server and opens a browser window. Most changes
are reflected live without restarting the server.

### Build

```sh
task docsite:build:public
```

This generates static content into the `build` directory and can be served using any
static content hosting service.

### Deployment

The docs site is published from `main` via the [Docsite workflow](../.github/workflows/deploy-docsite.yml).
The deployment target is the GitHub Pages site for `clusterdeck/clusterdeck.github.io`
(or whatever `DOCSITE_*` env vars in the workflow resolve to).

## Contributing

When you change a Clusterdeck-specific behavior (a new feature, a fork decision, an API
change), update the corresponding section in:

- [`../CHANGES.md`](../CHANGES.md) — required for every substantive change (Apache-2.0 §4(b))
- [`../RELEASES.md`](../RELEASES.md) — release notes for the version that includes the change
- [`../ROADMAP.md`](../ROADMAP.md) — if the change reorders or closes a planned item
- The relevant doc under `docs/clusterdeck/` — if the change has user-facing implicationsutely

For changes that only touch the docs site (typography, navigation, layout), no entry
in `CHANGES.md` is needed — `RELEASES.md` is fine.