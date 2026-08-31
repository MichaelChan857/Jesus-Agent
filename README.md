# Jesus Agent Harness

> **Jesus Agent is a fork of [earendil-works/pi](https://github.com/earendil-works/pi)**
> (commit `853a80d2`) — see [NOTICE.md](NOTICE.md) for attribution.

Jesus Agent is a self-extensible coding agent CLI powered by a unified multi-provider LLM API
and a token-efficient agent runtime. The internal architecture, agent loop, provider adapters,
TUI rendering, session tree, and tool calling are unchanged from upstream.

## Quick links

- **[`@jesus/coding-agent`](packages/coding-agent)** — interactive coding agent CLI (`jesus` command)
- **[`@jesus/agent-core`](packages/agent)** — agent runtime with tool calling and state management
- **[`@jesus/ai`](packages/ai)** — unified multi-provider LLM API (OpenAI, Anthropic, Google, …)

Install:

```bash
npm install -g @jesus/coding-agent
jesus --help
```

Or run from sources:

```bash
git clone https://github.com/jesus-agent/jesus-agent
cd jesus-agent
npm install --ignore-scripts
./jesus-test.sh --help
```

## All packages

| Package | Description |
|---------|-------------|
| **[@jesus/telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |
| **[@jesus/ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@jesus/agent-core](packages/agent)** | Agent runtime with transport abstraction, state management, and attachment support |
| **[@jesus/coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@jesus/tui](packages/tui)** | Terminal UI library with differential rendering |

Side packages (`@earendil-works/pi-protocol`, `@earendil-works/pi-client`,
`@earendil-works/pi-evals`, `@earendil-works/pi-chat`,
`@earendil-works/pi-session-backends/...`) are kept under their original upstream names
to avoid churning public names; they live alongside the core packages in this monorepo.

## Permissions & containerization

Jesus Agent does not include a built-in permission system for restricting filesystem,
process, network, or credential access. By default, it runs with the permissions of the
user and process that launched it.

If you need stronger boundaries, containerize or sandbox Jesus Agent. See
[packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md)
for three patterns:

- **Gondolin extension**: keep the `jesus` binary and provider auth on the host while routing
  built-in tools and `!` commands into a local Linux micro-VM.
- **Plain Docker**: run the whole `jesus` process in a local container for simple isolation.
- **OpenShell**: run the whole `jesus` process in a policy-controlled sandbox.

## Development

```bash
npm install --ignore-scripts  # install without lifecycle scripts
npm run build         # refresh model data, then build all packages
npm run build:offline # rebuild using existing model data (no network)
npm run check         # lint, format, and type-check
./test.sh             # run tests (skips LLM-dependent tests without API keys)
./jesus-test.sh       # run Jesus Agent from sources (from any directory)
```

## Supply-chain hardening

The build treats npm dependency changes as reviewed code changes.

- Direct external dependencies are pinned to exact versions; internal workspace packages
  remain version-ranged.
- `.npmrc` sets `save-exact=true` and `min-release-age=2` to avoid same-day dependency
  releases during npm resolution.
- `package-lock.json` is the dependency ground truth. Pre-commit blocks accidental lockfile
  commits unless `JESUS_ALLOW_LOCKFILE_CHANGE=1` is set.
- `npm run check` verifies pinned direct deps, native TypeScript import compatibility, and
  the generated coding-agent shrinkwrap.
- The published CLI package includes `packages/coding-agent/npm-shrinkwrap.json`, generated
  from the root lockfile, to pin transitive deps for npm users.
- Release smoke tests use `npm run release:local` to build, pack, and create isolated npm
  and Bun installs outside the repo before tagging a release.
- Local release installs, documented npm installs, and `jesus update --self` use
  `--ignore-scripts` where supported.
- CI installs with `npm ci --ignore-scripts`, and a scheduled GitHub workflow runs
  `npm audit --omit=dev` plus `npm audit signatures --omit=dev`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) for project rules.
Upstream Pi contribution rules still apply to the architecture layer; changes to Jesus-specific
files (branding, config dir, env prefix, billing headers) should be coordinated with the Jesus
Agent maintainer.

## License

Jesus Agent is distributed under the MIT License. The original Pi codebase is
Copyright (c) 2025 Mario Zechner. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).