# Clusterdeck documentation

This workspace contains the Docusaurus site intended for `https://docs.clusterdeck.app`. The repository configures that domain, but DNS, GitHub Pages custom-domain settings, TLS issuance, and live availability are external prerequisites and are not implied by this README.

## Layout

- `docusaurus.config.ts` — site metadata, navigation, strict link checks, and build configuration
- `docs/` — live user documentation
- `src/` — Docusaurus components and styles
- `static/` — static assets and the Pages `CNAME`
- `clusterdeck/` — design and implementation history; these files are not live product routes

Root [`BUILD.md`](../BUILD.md) and [`INSTALL.md`](../INSTALL.md) cover the application itself.

## Local development

From the repository root:

```sh
npm ci
npm run start --workspace docs
```

Validate a production site with:

```sh
npm run typecheck --workspace docs
npm run build --workspace docs
```

The build output is `docs/build`. Broken routes, anchors, and Markdown links fail the production build.

## Deployment

[`.github/workflows/deploy-docsite.yml`](../.github/workflows/deploy-docsite.yml) validates docs on pull requests and deploys `docs/build` from `main` using the official GitHub Pages actions. Repository administrators must separately:

1. Select **GitHub Actions** as the Pages source for `Pramodhsurya/clusterdeck`.
2. Configure and verify `docs.clusterdeck.app` as the custom domain.
3. Create the DNS CNAME using the exact Pages target shown by GitHub (normally `clusterdeck.github.io`).
4. Wait for DNS propagation and certificate issuance, then enforce HTTPS and verify the live routes.
5. Make `Pramodhsurya/clusterdeck` and `Pramodhsurya/homebrew-tap` publicly readable, or replace public documentation links with an owner-approved public destination. Repository links are not treated as live merely because they exist in source.

Because `.app` is HSTS-preloaded, DNS without a valid HTTPS certificate is not a usable placeholder.

## Contributing

Update live docs whenever behavior, configuration, privacy, or release content changes. Substantive derivative application changes also belong in root [`CHANGES.md`](../CHANGES.md); release-visible changes belong in [`RELEASES.md`](../RELEASES.md). Preserve inherited identifiers only where compatibility still requires them, and label the reason rather than presenting them as Clusterdeck branding.
