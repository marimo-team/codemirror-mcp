# codemirror-mcp

CodeMirror 6 extension implementing the Model Context Protocol for `@resource` mention and `/prompt` command completions. Published to npm as `@marimo-team/codemirror-mcp` and used by marimo's editor.

## Development

```bash
pnpm install --ignore-scripts --frozen-lockfile  # CI install
pnpm test              # vitest
pnpm run lint          # biome check --write (autofix.ci runs this on PRs)
pnpm exec biome ci .   # non-mutating lint CI enforces
pnpm run typecheck     # tsc --noEmit
pnpm run demo          # vite build of demo/
```

- Install with `--ignore-scripts`: the `prepare` script otherwise runs `husky install && pnpm build` on every install.
- Release: `pnpm run release` (pnpm version) bumps + tags; pushing a `v*` tag triggers release.yml, which publishes to npm via OIDC.
