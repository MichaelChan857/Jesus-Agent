// scripts/provider-e2e/scenarios/multi-turn-thinking.scenario.mjs
//
// Two-turn conversation: first turn's text is fed back into the second turn.
// Asserts the second turn is non-empty. This is a smoke for "provider
// supports multi-turn sessions"; the harness itself does not yet track
// session state across turns (that's a future enhancement).

export default {
  name: "multi-turn-thinking",
  providers: ["anthropic", "openai"],
  timeoutMs: 45000,
  async run(provider) {
    const opts = { signal: provider._signal };
    if (provider.name === "anthropic") opts.model = "claude-haiku-4-5";
    const r1 = await provider.send("Think step 1", opts);
    if (typeof r1.text !== "string" || r1.text.length === 0) {
      throw new Error(`empty turn-1 for ${provider.name}`);
    }
    const r2 = await provider.send(
      `Continue: ${r1.text.slice(0, 50)}`,
      opts,
    );
    if (typeof r2.text !== "string" || r2.text.length === 0) {
      throw new Error(`empty turn-2 for ${provider.name}`);
    }
  },
};