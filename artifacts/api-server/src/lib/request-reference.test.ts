import assert from "node:assert/strict";
import test from "node:test";
import { formatRequestReference, requestReferencePrefix } from "./request-reference";

test("references use uppercase workflow initials and six-digit counters", () => {
  const prefix = requestReferencePrefix("Staff Onboarding", new Date("2026-10-13T06:00:00Z"));
  assert.equal(formatRequestReference(prefix, 1), "SO-26-10-13-000001");
  assert.equal(formatRequestReference(prefix, 42), "SO-26-10-13-000042");
  assert.equal(formatRequestReference(prefix, 999999), "SO-26-10-13-999999");
});

test("initials handle single words, spacing, punctuation and apostrophes", () => {
  const date = new Date("2026-01-02T06:00:00Z");
  assert.equal(requestReferencePrefix("Payment", date), "P-26-01-02");
  assert.equal(requestReferencePrefix("  annual   leave-request & review ", date), "ALRR-26-01-02");
  assert.equal(requestReferencePrefix("Manager's Approval", date), "MA-26-01-02");
  assert.equal(requestReferencePrefix("𝔄udit Review", date), "𝔄R-26-01-02");
  assert.equal(requestReferencePrefix("අනුමැතිය ඉල්ලීම", date), "අඉ-26-01-02");
  assert.equal(requestReferencePrefix("!!!", date), "WF-26-01-02");
});

test("the date uses Sri Lanka time, including midnight and year boundaries", () => {
  assert.equal(requestReferencePrefix("Staff Onboarding", new Date("2026-10-12T18:29:59Z")), "SO-26-10-12");
  assert.equal(requestReferencePrefix("Staff Onboarding", new Date("2026-10-12T18:30:00Z")), "SO-26-10-13");
  assert.equal(requestReferencePrefix("Staff Onboarding", new Date("2026-12-31T18:30:00Z")), "SO-27-01-01");
});

test("invalid or exhausted counters fail rather than breaking the requested format", () => {
  for (const counter of [0, -1, 1.5, 1000000, NaN]) {
    assert.throws(() => formatRequestReference("SO-26-10-13", counter));
  }
});
