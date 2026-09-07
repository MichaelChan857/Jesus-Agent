export const name = "openai";

export function isConfigured() {
  return Boolean(process.env.PI_OPENAI_API_KEY);
}

export async function send(prompt, opts = {}) {
  const key = process.env.PI_OPENAI_API_KEY;
  if (!key) throw new Error("PI_OPENAI_API_KEY not set");
  const model = opts.model ?? "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 64,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  return {
    text,
    usage: {
      input: json.usage?.prompt_tokens ?? 0,
      output: json.usage?.completion_tokens ?? 0,
    },
  };
}