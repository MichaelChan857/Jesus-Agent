# Provider e2e harness

Detects upstream LLM-provider protocol regressions within one CI cycle.
See `docs/superpowers/specs/2026-08-31-jesus-improvements-route-a.md`
§2.A for the design rationale and §2.A.5 for error-handling rules.

## Quick start

```bash
# Offline faux-only run (no network, no API keys required):
node scripts/provider-e2e/runner.mjs --faux-only

# Real provider run (requires PI_<NAME>_API_KEY in env):
node scripts/provider-e2e/runner.mjs --provider anthropic

# Single scenario:
node scripts/provider-e2e/runner.mjs --scenario simple-stream --faux-only

# JUnit XML for CI ingestion:
node scripts/provider-e2e/runner.mjs --reporter junit
#   writes .artifacts/provider-e2e/<ts>/report.xml
```

## Layout

```
scripts/provider-e2e/
  ├─ runner.mjs                  # CLI entry; yargs + p-limit(4)
  ├─ runner-cli.test.mjs         # parseArgs() tests
  ├─ runner-runone.test.mjs      # runOne() tests
  ├─ runner.test.mjs             # scenario-loader tests
  ├─ error-classifier.mjs        # classifyError(err) -> {kind,shouldRetry,backoffMs?}
  ├─ error-classifier.test.mjs   # classifier tests
  ├─ scenario-loader.mjs         # discoverScenariosAsync(rootDir)
  ├─ providers/
  │   ├─ faux.mjs                # always-configured, deterministic
  │   ├─ anthropic.mjs           # POST https://api.anthropic.com/v1/messages
  │   ├─ openai.mjs              # POST https://api.openai.com/v1/chat/completions
  │   ├─ minimax.mjs             # POST https://api.minimax.chat/v1/text/chatcompletion_v2
  │   ├─ minimax-cn.mjs          # POST https://api.minimaxi.chat/v1/text/chatcompletion_v2
  │   └─ *.test.mjs               # provider unit tests
  └─ scenarios/
      ├─ simple-stream.scenario.mjs
      ├─ tool-call.scenario.mjs
      ├─ multi-turn-thinking.scenario.mjs
      ├─ cache-hit.scenario.mjs
      └─ 401-retry.scenario.mjs
```

## Scenario contract

Each `*.scenario.mjs` file must export a default object:

```js
export default {
  name: "my-scenario",                // unique within scenarios/
  providers: ["anthropic", "openai"], // which providers to fan out to
  timeoutMs: 30000,                   // optional, default 30000
  async run(provider) {                // throws on failure
    const r = await provider.send("prompt", { signal: provider._signal });
    if (!r.text) throw new Error("empty");
  },
};
```

The runner invokes `scenario.run(providerMod)` and wraps it with an
`AbortSignal` (injected as `provider._signal`). The scenario owns the
assertion; the runner owns the timeout + lifecycle.

## Provider module contract

Each `providers/<name>.mjs` exports named:

```js
export const name = "anthropic";
export function isConfigured() { return Boolean(process.env.PI_ANTHROPIC_API_KEY); }
export async function send(prompt, opts) { /* returns { text, usage } */ }
```

When `isConfigured()` returns false (or `--faux-only` is set), the runner
routes to `providers/faux.mjs`, which always returns a deterministic
`{ text: "faux:<prompt-len>:<model>", usage: { input: 1, output: 1 } }`.

## Error handling (per spec §2.A.5)

| Failure       | Behavior |
|---------------|----------|
| 401 / 403     | Mark AUTH, no retry (single refresh hint handled upstream) |
| 429           | Mark RATE_LIMIT, retry up to 3× with backoff [2s, 4s, 8s] |
| 5xx           | Mark SERVER, no retry — 5xx is the signal, not noise |
| TIMEOUT       | Mark TIMEOUT, continue, no retry |
| Faux mismatch | Hard fail (this is a spec bug) |
| Runner crash  | Exit 2 + write runner.log under `.artifacts/` |

## Adding a new scenario

1. Create `scripts/provider-e2e/scenarios/<name>.scenario.mjs`.
2. Export the default object with `name`, `providers`, `run`.
3. Run `node scripts/provider-e2e/runner.mjs --scenario <name> --faux-only`
   to verify it works against faux.
4. Run with real provider: `node scripts/provider-e2e/runner.mjs --provider <name>`.

## Adding a new provider

1. Create `scripts/provider-e2e/providers/<name>.mjs` with named exports
   `name`, `isConfigured`, `send`.
2. Add it to the `PROVIDERS` map in `runner.mjs`.
3. Create `scripts/provider-e2e/providers/<name>.test.mjs` covering env-key
   toggle (and any provider-specific surface).
