export const name = "anthropic";

export function isConfigured() {
  return Boolean(process.env.PI_ANTHROPIC_API_KEY);
}

export async function send(prompt, opts = {}) {
  const key = process.env.PI_ANTHROPIC_API_KEY;
  if (!key) throw new Error("PI_ANTHROPIC_API_KEY not set");
  const model = opts.model ?? "claude-haiku-4-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 64,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = (json.content ?? []).map((b) => b.text ?? "").join("");
  return {
    text,
    usage: {
      input: json.usage?.input_tokens ?? 0,
      output: json.usage?.output_tokens ?? 0,
    },
  };
}