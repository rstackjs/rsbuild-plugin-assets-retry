# Repository Guidelines

## Project Structure

- `src/` contains the plugin source and browser runtime code.
- `test/` contains Playwright integration tests and fixtures.
- `playground/` is the local Rsbuild app used for manual verification.
- `dist/` and `.rslib/` are generated build artifacts.

## Tooling

- Build with Rslib: `pnpm build`.
- Lint with Rslint and Prettier: `pnpm lint`; apply fixes with `pnpm lint:write`.
- Run tests with Playwright: `pnpm test`.
- Use Node.js `^20.19.0 || >=22.12.0` and pnpm 11.

## Package Contract

- The package is ESM-only and exposes `./dist/index.js` through `package.json#exports`.
- Runtime retry scripts are built as browser IIFE artifacts under `dist/runtime/`.
- Keep public types aligned with the exported entry point.
- Do not edit generated `dist/` or `.rslib/` output by hand.

## Validation

Before opening a PR, run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm test
npm pack --dry-run
```
