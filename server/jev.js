import { ACTIONS, CONFIG as C } from "../duel/config.js";
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
  const questions = Object.fromEntries(
    Object.entries(ACTIONS).map(([key, options]) => [
      key,
      {
        type: "choice",
        instructions: `Choose the ${key} action to maximize survival and damage efficiency in this duel. All four choices are independent and based on the same observation.`,
        criteria: Object.fromEntries(options.map((o) => [o, descriptions[o]])),
      },
    ]),
  );
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
  const response = await fetchImpl(PROVIDER_URL, {
    method: "POST",
    redirect: "error",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(providerRequest(snapshot, model)),
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
  return { ...result, providerLatencyMs: performance.now() - started };
}
