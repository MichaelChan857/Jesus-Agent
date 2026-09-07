export const name = "faux";

export function isConfigured() {
  return true;
}

export async function send(prompt, opts = {}) {
  const text = `faux:${prompt.length}:${opts.model ?? "default"}`;
  return { text, usage: { input: 1, output: 1 } };
}