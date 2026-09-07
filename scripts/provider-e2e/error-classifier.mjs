// scripts/provider-e2e/error-classifier.mjs
//
// Classifies provider + scenario failures into the four retry categories
// the runner acts on. See spec §2.A.5 for the full table.
//
//   AUTH        401 / 403    no retry (single retry handled upstream at the
//                           provider module boundary, e.g. key refresh hint)
//   RATE_LIMIT  429          retry up to 3× with exponential backoff
//   SERVER      5xx          no retry — 5xx is the signal, not noise
//   TIMEOUT     scenario exceeded timeoutMs   no retry, continue
//   UNKNOWN     anything else                  no retry, surface to caller

export function classifyError(err) {
  if (err && err.kind === "TIMEOUT") {
    return { kind: "TIMEOUT", shouldRetry: false };
  }
  const status = err?.status;
  if (status === 401 || status === 403) {
    return { kind: "AUTH", shouldRetry: false };
  }
  if (status === 429) {
    return { kind: "RATE_LIMIT", shouldRetry: true, backoffMs: [2000, 4000, 8000] };
  }
  if (status >= 500 && status < 600) {
    return { kind: "SERVER", shouldRetry: false };
  }
  return { kind: "UNKNOWN", shouldRetry: false };
}