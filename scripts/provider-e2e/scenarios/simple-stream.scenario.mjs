// scripts/provider-e2e/scenarios/simple-stream.scenario.mjs
//
// Minimal smoke scenario: sends a one-word prompt, asserts non-empty text.
// Runs against all 4 providers (real or faux depending on configuration).
//
// See spec §2.A.3 for the scenario contract; this is the simplest case.

export default {
  name: "simple-stream",
  providers: ["anthropic", "openai", "minimax", "minimax-cn"],
  timeoutMs: 30000,
  async run(provider) {
    const opts = { signal: provider._signal };
    if (provider.name !== "faux") {
      // Use a cheap fast model for the real call; providers each have a
      // sensible default that we let them pick when opts.model is omitted,
      // but for anthropic we explicitly downgrade to haiku to keep this
      // smoke cheap. Other providers' defaults are already cheap.
      if (provider.name === "anthropic") opts.model = "claude-haiku-4-5";
    }
    const r = await provider.send("Reply with one word: ok", opts);
    if (typeof r.text !== "string" || r.text.length === 0) {
      throw new Error(`empty response for ${provider.name}`);
    }
  },
};