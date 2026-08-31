# Notice — Jesus Agent

Jesus Agent is a derivative work based on
**[Pi Agent Harness](https://github.com/earendil-works/pi)** by
Mario Zechner / Earendil Works.

- Upstream commit: `853a80d26c90a14c1886f0ebb8ffaae133ca2185`
- Upstream license: MIT — Copyright (c) 2025 Mario Zechner
- Forked from: <https://github.com/earendil-works/pi>

## What changed in this fork

The following identifiers have been renamed for the Jesus Agent product:

| Upstream | Jesus Agent |
|---|---|
| `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `@earendil-works/pi-telemetry` | `@jesus/coding-agent`, `@jesus/agent-core`, `@jesus/ai`, `@jesus/tui`, `@jesus/telemetry` |
| CLI binary `pi` | `jesus` |
| Config directory `~/.pi/` | `~/.jesus/` |
| Auto-derived env prefix `PI_*` (for dir/session) | `JESUS_*` (for dir/session) |
| Telemetry schema namespace `pi.ai.*`, `pi.session.*`, `pi.operation.*`, etc. | `jesus.ai.*`, `jesus.session.*`, `jesus.operation.*`, etc. |
| Billing header values (`X-OpenRouter-Title`, `X-BILLING-INVOKE-ORIGIN`, `User-Agent`, `x-opencode-client`) | `Jesus Agent` |
| `process.env.PI_CODING_AGENT`, `process.env.AI_AGENT` | `process.env.JESUS_CODING_AGENT`, `process.env.AI_AGENT="jesus"` |

## What was deliberately preserved

- **`pi-messages` SSE provider protocol** — external backends (Radius gateway and others)
  speak this protocol; the wire format, types, and lazy-loader are kept identical.
- **All non-cosmetic environment variables** — `PI_OFFLINE`, `PI_TELEMETRY`,
  `PI_CACHE_RETENTION`, `PI_IMAGE_PROTOCOL`, `PI_HARDWARE_CURSOR`, `PI_TIMING`,
  `PI_SKIP_VERSION_CHECK`, `PI_INSTALLER_API_BASE`, `PI_MANAGED_INSTALL_ROOT`,
  `PI_PACKAGE_DIR`, `PI_EVAL_ARTIFACT_DIR`, `PI_PROVIDER`, `PI_MODEL`, etc. are
  user-facing configuration contracts and were left untouched.
- **`piConfig` JSON key in `package.json`** — this is the rebranding mechanism itself
  (consumed by `packages/coding-agent/src/config.ts`), not a brand string.
- **Side packages** (`@earendil-works/pi-protocol`, `@earendil-works/pi-client`,
  `@earendil-works/pi-evals`, `@earendil-works/pi-chat`, `@earendil-works/pi-session-backends/...`)
  keep their original upstream names to avoid churning public API.
- **`LICENSE`** — the upstream MIT text is preserved verbatim and ships in every distribution.

## What was deliberately NOT modified

Per the user's brief ("don't touch the architecture and core"):

- Agent loop, tool calling dispatch, compaction, branch summarization
- Session tree, JSONL codec, reducer, event system
- Provider adapters (Anthropic, OpenAI, Google, Bedrock, Vertex, Mistral, OpenRouter, etc.)
- TUI rendering, markdown transformer, editor, autocomplete, layout
- Extension / Skill / Prompt-template loader
- Package manager, telemetry reference adapter
- Build pipeline (`tsgo`, `bun build --compile`, `npm run check`)

Jesus Agent is distributed under the same MIT License — see [LICENSE](LICENSE).