# Contributing

Thank you for your interest in **inD3X Art**.

This repository is proprietary software. External contributions are not accepted at this time unless you have a prior agreement with the maintainer.

## Development setup

```powershell
npm install
npm run tauri dev
```

## Quality gates (run before opening internal PRs)

```powershell
npm run ci
```

This runs typecheck, `gen:types`, ESLint, Prettier, Vitest, Clippy, Rust tests, production build, and Playwright (smoke + integration).

See [docs/TESTING.md](docs/TESTING.md) for details.

## Contact

**Maintainer:** [ximaks00-hue](https://github.com/ximaks00-hue) · ximaks00@gmail.com
