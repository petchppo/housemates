import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DEMO_PROFILE, type DemoProfile } from "../src/domain/demo";
import { createSyntheticWeather } from "../src/domain/demo-weather";
import { messageHouseholdContext } from "../src/domain/message-household";

test("forecast refreshes, weather experiments and planning preferences retain phone identity", () => {
  const profile: DemoProfile = { ...DEFAULT_DEMO_PROFILE, applianceIds: ["evie", "bubbles"] };
  const key = messageHouseholdContext(profile);
  assert.equal(messageHouseholdContext({ ...profile, forecast: createSyntheticWeather(profile.regionId), weatherMode: "live", planningMode: "carbon" }), key);
  assert.equal(messageHouseholdContext({ ...profile, weatherOffsetC: 4, weatherCode: 61, weatherPreferenceExplicit: true, applianceIds: ["bubbles", "evie"] }), key);
});

test("different reviewed households cannot inherit the remembered phone scope", () => {
  const profile: DemoProfile = { ...DEFAULT_DEMO_PROFILE, applianceIds: ["evie"] };
  const key = messageHouseholdContext(profile);
  assert.notEqual(messageHouseholdContext({ ...profile, residenceType: "apartment" }), key);
  assert.notEqual(messageHouseholdContext({ ...profile, applianceIds: ["chill"] }), key);
  assert.throws(() => messageHouseholdContext({ ...profile, regionId: "invalid" } as unknown as DemoProfile));
});
