import { PLANS, CONFIG as C } from "../duel/config.js";
import { parseProviderResponse, validateSnapshot } from "../duel/contract.js";

// Contract checked against https://docs.typesafe.ai/api and /primitives/choice, 2026-09-22.
export const PROVIDER_URL = "https://api.typesafe.ai/v1/systemone";
const descriptions = {
  CLOSE: "Point bow toward enemy and close range.",
  OPEN_RANGE: "Point stern toward enemy and open range.",
  ANGLE_IN_PORT: "Close angled 30 degrees with enemy on port side.",
  ANGLE_IN_STARBOARD: "Close angled 30 degrees with enemy on starboard side.",
  ANGLE_AWAY_PORT: "Kite at 150 degrees to enemy bearing, enemy on port.",
  ANGLE_AWAY_STARBOARD:
    "Kite at minus 150 degrees to enemy bearing, enemy on starboard.",
  BROADSIDE_PORT:
    "Present port broadside; all guns can bear but vulnerable to AP.",
  BROADSIDE_STARBOARD:
    "Present starboard broadside; all guns can bear but vulnerable to AP.",
  HOLD_COURSE: "Maintain committed compass heading.",
  HOLD_FIRE: "Save loaded batteries.",
  FIRE: "Fire each eligible turret as it bears; remains active until changed.",
  AP: "High damage against broadside; angled targets ricochet; penetration falls with range.",
  HE: "Lower direct damage, reliable versus angled armor, no fire damage.",
  BOW: "Aim forward quarter; may disable a forward turret.",
  MIDSHIPS:
    "Aim central half; broadside AP citadels and possible engine impairment.",
  STERN: "Aim rear quarter; may impair steering.",
};
export function providerRequest(snapshot, model) {
  const questions = {
    plan: {
      type: "choice",
      instructions:
        "Choose one coherent tactical plan to maximize survival and effective damage. Evaluate maneuver, firing intent, ammunition and target zone together, accounting for estimated track uncertainty and decision latency. HOLD_FIRE still pre-aims the chosen zone. FIRE persists until replaced, but shared physical constraints gate each turret.",
      criteria: Object.fromEntries(
        Object.entries(PLANS).map(([key, a]) => [
          key,
          `${descriptions[a.maneuver]} ${a.fire === "FIRE" ? "Fire" : "Hold fire; pre-aim"} ${a.shell} at ${a.aimZone}.`,
        ]),
      ),
    },
  };
  return {
    model,
    state: {
      observation: validateSnapshot(snapshot),
      rules: {
        units:
          "world units, radians for headings/bearings, degrees for aspect, milliseconds for timers",
        arena: { width: C.width, height: C.height },
        objective: "Sink opponent before 120 seconds; timeout is a draw.",
        equalShips: true,
        ammunition: { AP: descriptions.AP, HE: descriptions.HE },
        zones: {
          BOW: descriptions.BOW,
          MIDSHIPS: descriptions.MIDSHIPS,
          STERN: descriptions.STERN,
        },
        tracking:
          "Only opponent.track is known motion: noisy 10Hz observations, smoothed velocity and hull heading. Hull heading differs from direction of travel. Confidence is estimator quality, not probability of a hit. Shared gun director uses the same current estimated track. Unknown speed or LOST track prevents fire; targets can turn during shell flight.",
        maxSpeed: C.maxSpeed,
        maxRange: C.maxRange,
        reloadMs: C.reloadMs,
        guns: "Two forward and two aft twin turrets. Bow or stern exposes two, broadside four. Shared finite traverse and deterministic lead.",
        armor:
          "Aspect 0 means bow/stern-on, 90 broadside. AP auto-ricochets at aspect <=30, probabilistic from 30 to45. Broadside midships permits citadels.",
        moduleDurationMs: C.moduleDurationMs,
        timing:
          "Decisions at 250ms opportunities. World keeps moving during requests; previous intent remains committed. Enemy reload is an estimate from last observed firing, not hidden turret timers.",
      },
    },
    questions,
  };
}
export async function requestJev(
  snapshot,
  { key, model, fetchImpl = fetch, signal },
) {
  const started = performance.now();
  const payload = providerRequest(snapshot, model),
    serialized = JSON.stringify(payload),
    payloadTelemetry = {
      planOptionCount: Object.keys(payload.questions.plan.criteria).length,
      serializedProviderRequestBytes: Buffer.byteLength(serialized, "utf8"),
      serializedObservationBytes: Buffer.byteLength(
        JSON.stringify(payload.state.observation),
        "utf8",
      ),
      serializedCriteriaBytes: Buffer.byteLength(
        JSON.stringify(payload.questions.plan.criteria),
        "utf8",
      ),
    };
  const response = await fetchImpl(PROVIDER_URL, {
    method: "POST",
    redirect: "error",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: serialized,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Provider HTTP ${response.status}`);
  }
  // Do not return raw provider errors or arbitrary response fields to the browser/log.
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 65536) {
      await reader.cancel();
      throw new Error("Provider response too large");
    }
    chunks.push(value);
  }
  let result;
  try {
    result = parseProviderResponse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    throw new Error("Malformed provider response");
  }
  return {
    ...result,
    ...payloadTelemetry,
    inputTokens: result.usage.input_tokens ?? null,
    outputTokens: result.usage.output_tokens ?? null,
    providerLatencyMs: performance.now() - started,
  };
}
