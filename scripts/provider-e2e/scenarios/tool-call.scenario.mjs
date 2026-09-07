// scripts/provider-e2e/scenarios/tool-call.scenario.mjs
//
// Asserts the provider can return a JSON-shaped response when asked.
// Faux provider returns deterministic text "faux:..." which won't parse
// as JSON, so we accept either a parseable JSON object OR a non-empty text
// response (to keep faux green).
//
// See spec §2.A.3 for the scenario contract.

export default {
  name: "tool-call",
  providers: ["anthropic", "openai"],
  timeoutMs: 30000,
  async run(provider) {
    const r = await provider.send("Return JSON {ok:true}", { signal: provider._signal });
    if (typeof r.text !== "string" || r.text.length === 0) {
      throw new Error(`empty response for ${provider.name}`);
    }
    // Faux returns "faux:N:..." — not JSON. Real providers should return JSON.
    // We don't fail if faux is in play; the smoke intent is "non-empty response".
    if (provider.name === "faux") return;
    try {
      const parsed = JSON.parse(r.text);
      if (!parsed || typeof parsed !== "object") {
        throw new Error(`response is not a JSON object: ${r.text.slice(0, 80)}`);
      }
    } catch (e) {
      throw new Error(`tool-call JSON parse failed for ${provider.name}: ${e.message}`);
    }
  },
};