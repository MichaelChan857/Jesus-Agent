import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTypedSpanStarter, NOOP_TELEMETRY_CONTEXT, type TelemetryContext } from "@jesus/telemetry";
import { describe, expect, expectTypeOf, it } from "vitest";
import { renderAgentTelemetrySchemaMarkdown } from "../../scripts/generate-telemetry-docs.ts";
import {
	AGENT_TELEMETRY_SCHEMAS,
	AI_TELEMETRY_SCHEMA,
	type AiSpanEndAttributes,
	type AiSpanStartAttributes,
	HARNESS_TELEMETRY_SCHEMA,
	type HarnessSpanEndAttributes,
	type HarnessSpanStartAttributes,
	startAiSpan,
	startHarnessSpan,
} from "../../src/harness/telemetry.ts";

describe("agent telemetry schemas", () => {
	it("serializes both schemas and generates the checked-in reference", () => {
		expect(() => JSON.stringify(AI_TELEMETRY_SCHEMA)).not.toThrow();
		expect(() => JSON.stringify(HARNESS_TELEMETRY_SCHEMA)).not.toThrow();
		expect(AGENT_TELEMETRY_SCHEMAS).toEqual([AI_TELEMETRY_SCHEMA, HARNESS_TELEMETRY_SCHEMA]);
		expect(Object.keys(HARNESS_TELEMETRY_SCHEMA.spans)).toEqual([
			"jesus.harness.run",
			"jesus.harness.compaction",
			"jesus.harness.navigation",
			"jesus.harness.checkpoint",
			"jesus.harness.turn",
			"jesus.harness.step",
			"jesus.harness.tool",
			"jesus.harness.hook",
			"jesus.harness.sleep",
			"jesus.harness.event_handler",
			"jesus.session.write",
		]);
		const actual = readFileSync(resolve(import.meta.dirname, "../../docs/telemetry-schema.md"), "utf8");
		expect(actual).toBe(renderAgentTelemetrySchemaMarkdown());
	});

	it("starts AI-request and harness spans through one composed typed starter", async () => {
		const startSpan = createTypedSpanStarter(NOOP_TELEMETRY_CONTEXT, AGENT_TELEMETRY_SCHEMAS);
		await startSpan(
			"jesus.harness.step",
			{
				"jesus.lane.name": "main",
				"jesus.operation.id": "operation",
				"jesus.step.kind": "assistant",
				"jesus.step.attempt": 1,
			},
			async (stepSpan, startChildSpan) => {
				stepSpan.setAttributes({ "jesus.step.outcome": "succeeded" });
				await startChildSpan(
					"jesus.ai.request",
					{
						"jesus.ai.operation": "stream",
						"jesus.ai.provider": "provider",
						"jesus.ai.model": "model",
						"jesus.ai.api": "api",
						"jesus.ai.streaming": true,
					},
					(requestSpan) => {
						requestSpan.setAttributes({ "jesus.ai.response.stop_reason": "stop" });
					},
				);
			},
		);
	});

	it("infers exact AI start and optional end attributes", async () => {
		type Start = AiSpanStartAttributes<"jesus.ai.request">;
		type End = AiSpanEndAttributes<"jesus.ai.request">;
		expectTypeOf<Start>().toMatchTypeOf<{
			"jesus.ai.operation": "stream" | "fetch_deferred" | "cancel_deferred" | "generate_images";
			"jesus.ai.provider": string;
			"jesus.ai.model": string;
			"jesus.ai.api": string;
			"jesus.ai.streaming": boolean;
			"jesus.ai.deferred"?: boolean;
		}>();
		expectTypeOf<End["jesus.ai.response.stop_reason"]>().toEqualTypeOf<
			"stop" | "length" | "tool_use" | "error" | "aborted" | "deferred" | undefined
		>();

		const telemetryContext: TelemetryContext = NOOP_TELEMETRY_CONTEXT;
		await startAiSpan(
			telemetryContext,
			"jesus.ai.request",
			{
				"jesus.ai.operation": "stream",
				"jesus.ai.provider": "provider",
				"jesus.ai.model": "model",
				"jesus.ai.api": "api",
				"jesus.ai.streaming": true,
			},
			(span) => {
				span.setAttributes({ "jesus.ai.response.stop_reason": "tool_use" });
				// @ts-expect-error pi.ai.request declares no span events
				span.addEvent("chunk");
			},
		);

		const compileTimeFailures = () => {
			const extraAttributes = {
				"jesus.ai.operation": "stream",
				"jesus.ai.provider": "provider",
				"jesus.ai.model": "model",
				"jesus.ai.api": "api",
				"jesus.ai.streaming": true,
				"jesus.ai.unknown": true,
			} as const;
			// @ts-expect-error variables with unknown attributes are rejected
			void startAiSpan(telemetryContext, "jesus.ai.request", extraAttributes, () => {});
			// @ts-expect-error missing required start attributes
			void startAiSpan(telemetryContext, "jesus.ai.request", { "jesus.ai.operation": "stream" }, () => {});
		};
		expectTypeOf(compileTimeFailures).toBeFunction();
	});

	it("infers per-span harness literals and optional completion enrichment", async () => {
		type RunStart = HarnessSpanStartAttributes<"jesus.harness.run">;
		type RunEnd = HarnessSpanEndAttributes<"jesus.harness.run">;
		expectTypeOf<RunStart["jesus.operation.kind"]>().toEqualTypeOf<"run">();
		expectTypeOf<RunEnd["jesus.operation.outcome"]>().toEqualTypeOf<
			"completed" | "aborted" | "failed" | "suspended" | undefined
		>();

		const telemetryContext: TelemetryContext = NOOP_TELEMETRY_CONTEXT;
		await startHarnessSpan(
			telemetryContext,
			"jesus.harness.run",
			{
				"jesus.session.id": "session",
				"jesus.lane.name": "main",
				"jesus.operation.id": "operation",
				"jesus.operation.kind": "run",
				"jesus.operation.recovery": false,
			},
			(span) => {
				span.setAttributes({ "jesus.operation.outcome": "completed" });
				span.setAttributes({});
				// @ts-expect-error the harness schema declares no span events
				span.addEvent("result");
			},
		);

		const compileTimeFailures = () => {
			const extraRunAttributes = {
				"jesus.session.id": "session",
				"jesus.lane.name": "main",
				"jesus.operation.id": "operation",
				"jesus.operation.kind": "run",
				"jesus.operation.recovery": false,
				"jesus.unknown": true,
			} as const;
			// @ts-expect-error variables with unknown attributes are rejected
			void startHarnessSpan(telemetryContext, "jesus.harness.run", extraRunAttributes, () => {});
			void startHarnessSpan(
				telemetryContext,
				"jesus.harness.checkpoint",
				{
					"jesus.lane.name": "main",
					"jesus.operation.id": "operation",
					"jesus.checkpoint.kind": "normal",
				},
				(span) => {
					// @ts-expect-error empty end schemas reject every attribute
					span.setAttributes({ "jesus.unknown": true });
				},
			);
			void startHarnessSpan(
				telemetryContext,
				"jesus.harness.run",
				{
					"jesus.session.id": "session",
					"jesus.lane.name": "main",
					"jesus.operation.id": "operation",
					// @ts-expect-error run spans accept only the run operation kind
					"jesus.operation.kind": "navigation",
					"jesus.operation.recovery": false,
				},
				() => {},
			);
			// @ts-expect-error missing required run start attributes
			void startHarnessSpan(telemetryContext, "jesus.harness.run", {}, () => {});
		};
		expectTypeOf(compileTimeFailures).toBeFunction();
	});
});
