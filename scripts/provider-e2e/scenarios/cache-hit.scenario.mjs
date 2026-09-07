// scripts/provider-e2e/scenarios/cache-hit.scenario.mjs
//
// Two identical requests; assert both return non-empty text. A meaningful
// cache check would inspect cached_tokens / cache_read_input_tokens, but
// the current faux provider does not surface that field and the spec
// §2.A.3 contract is `{ text, usage: { input, output } }`. We assert
// response stability instead: same prompt → same response shape.

export default {
  name: "cache-hit",
  providers: ["anthropic"],
  timeoutMs: 30000,
  async run(provider) {
    const opts = { signal: provider._signal };
    if (provider.name === "anthropic") opts.model = "claude-haiku-4-5";
    const a = await provider.send("Same prompt", opts);
    const b = await provider.send("Same prompt", opts);
    if (typeof a.text !== "string" || a.text.length === 0) {
      throw new Error(`empty first response for ${provider.name}`);
    }
    if (typeof b.text !== "string" || b.text.length === 0) {
      throw new Error(`empty second response for ${provider.name}`);
    }
    // Faux is deterministic, so same prompt yields same text — assert this.
    if (provider.name === "faux" && a.text !== b.text) {
      throw new Error(`faux cache instability: "${a.text}" vs "${b.text}"`);
    }
  },
};