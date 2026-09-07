export const name = "minimax";

export function isConfigured() {
  return Boolean(process.env.PI_MINIMAX_API_KEY);
}

export async function send(prompt, opts = {}) {
  const key = process.env.PI_MINIMAX_API_KEY;
  if (!key) throw new Error("PI_MINIMAX_API_KEY not set");
  const model = opts.model ?? "MiniMax-M2";
  const res = await fetch("https://api.minimax.chat/v1/text/chatcompletion_v2", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    throw new Error(`minimax ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, usage: { input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0 } };
}