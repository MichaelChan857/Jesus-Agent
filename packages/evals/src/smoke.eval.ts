import { expect } from "vitest";
import { describeEval } from "vitest-evals";
import { createJesusCodingAgentHarness } from "./jesus-harness.ts";

const jesusCodingAgentHarness = createJesusCodingAgentHarness({ noTools: "all" });

describeEval("Pi Coding Agent smoke", { harness: jesusCodingAgentHarness }, (it) => {
	it("runs a basic prompt end to end", async ({ run }) => {
		const result = await run("What's the capital of France? Respond with only the city name.");

		expect(result.output.trim()).toBe("Paris");
		expect(result.errors).toEqual([]);
		expect(result.usage.provider).toBe(process.env.JESUS_PROVIDER ?? process.env.PI_PROVIDER);
		expect(result.usage.model).toBe(process.env.JESUS_MODEL ?? process.env.PI_MODEL);
		expect(result.usage.totalTokens).toBeGreaterThan(0);
	});
});
