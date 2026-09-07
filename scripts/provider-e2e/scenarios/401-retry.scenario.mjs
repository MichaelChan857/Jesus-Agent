// scripts/provider-e2e/scenarios/401-retry.scenario.mjs
//
// Forces an invalid API key and asserts the provider module rejects with
// a 401 / 403-class error. Per spec §2.A.5, AUTH errors should NOT retry;
// this scenario proves the provider rejects instead of looping.
//
// In faux-only mode this scenario is a no-op because the runner routes
// unconfigured / faux-only providers to faux, which never 401s. The
// scenario only exercises its real path against a real provider with
// PI_<NAME>_API_KEY set.

export default {
  name: "401-retry",
  providers: ["anthropic", "openai"],
  timeoutMs: 30000,
  async run(provider) {
    if (provider.name === "faux") return; // skip in faux-only mode
    const envName = `PI_${provider.name.toUpperCase().replace("-", "_")}_API_KEY`;
    const orig = process.env[envName];
    process.env[envName] = "definitely-invalid-key";
    try {
      let caught = null;
      try {
        await provider.send("hello", { signal: provider._signal });
      } catch (e) {
        caught = e;
      }
      if (!caught) {
        throw new Error(`expected 401/403 from ${provider.name} with invalid key, got success`);
      }
      const msg = caught.message ?? String(caught);
      const status = caught.status;
      const looksLikeAuth =
        /401|403/.test(msg) || status === 401 || status === 403;
      if (!looksLikeAuth) {
        throw new Error(
          `expected 401/403 for ${provider.name}, got: ${msg.slice(0, 200)}`,
        );
      }
    } finally {
      if (orig === undefined) delete process.env[envName];
      else process.env[envName] = orig;
    }
  },
};