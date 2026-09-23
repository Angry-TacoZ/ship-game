import { deterministicPolicy } from "./policy.js";
import { parseProviderResponse } from "./contract.js";
import { PLANS, planKey } from "./config.js";

export function liveAdapter(token) {
  return async (snapshot, { signal }) => {
    const timeout = AbortSignal.timeout(6500);
    const response = await fetch("/api/jev/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Duel-Token": token },
      body: JSON.stringify({ snapshot }),
      signal: AbortSignal.any([signal, timeout]),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const known =
        /^Provider HTTP \d{3}$/.test(body.error) ||
        [
          "Provider timeout",
          "Provider request failed or response malformed",
          "Request limit reached or request already pending",
          "Live Jev is disabled. Configure the local server.",
        ].includes(body.error);
      throw new Error(
        known ? body.error : `Local proxy HTTP ${response.status}`,
      );
    }
    const body = await response.json();
    const parsed = parseProviderResponse(body);
    if (!Number.isFinite(body.providerLatencyMs) || body.providerLatencyMs < 0)
      throw new Error("Invalid latency");
    for (const key of [
      "planOptionCount",
      "serializedProviderRequestBytes",
      "serializedObservationBytes",
      "serializedCriteriaBytes",
      "inputTokens",
      "outputTokens",
    ])
      if (body[key] != null && (!Number.isSafeInteger(body[key]) || body[key] < 0))
        throw new Error("Invalid provider telemetry");
    return {
      ...parsed,
      providerLatencyMs: body.providerLatencyMs,
      planOptionCount: body.planOptionCount ?? null,
      serializedProviderRequestBytes: body.serializedProviderRequestBytes ?? null,
      serializedObservationBytes: body.serializedObservationBytes ?? null,
      serializedCriteriaBytes: body.serializedCriteriaBytes ?? null,
      inputTokens: body.inputTokens ?? null,
      outputTokens: body.outputTokens ?? null,
    };
  };
}
// A delayed copy of the rule policy, explicitly NOT Jev and never benchmark eligible.
export function mockAdapter(delayMs = 180) {
  return (snapshot, { signal }) =>
    new Promise((resolve, reject) => {
      const start = performance.now(),
        result = deterministicPolicy(snapshot);
      const abort = () => {
        clearTimeout(timer);
        reject(new Error("Cancelled"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve({
          ...parseProviderResponse({
            model: "MOCK_RULES_NOT_JEV",
            answers: {
              plan: {
                type: "choice",
                choice: planKey(result.action),
                confidence: 1,
                probabilities: Object.fromEntries(
                  Object.keys(PLANS).map((key) => [
                    key,
                    key === planKey(result.action) ? 1 : 0,
                  ]),
                ),
              },
            },
          }),
          providerLatencyMs: performance.now() - start,
        });
      }, delayMs);
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
}
