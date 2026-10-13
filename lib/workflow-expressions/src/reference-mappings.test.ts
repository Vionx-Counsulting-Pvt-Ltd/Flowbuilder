import assert from "node:assert/strict";
import test from "node:test";
import { applyLockedReferenceMappings, fillReferenceSelection, referenceColumnCompatible, type ReferenceMapping } from "./reference-mappings";
import { computeFormExpressions } from "./index";

const fields = [
  { id: "branch", type: "ref", sourceTableId: "branches", referenceMappings: [
    { sourceColumn: "code", targetFieldId: "code", mode: "locked" },
    { sourceColumn: "region", targetFieldId: "region", mode: "suggestion" },
  ] as ReferenceMapping[], optionMappedValues: { a: { code: "A", region: "North" }, b: { code: "B", region: "South" } } },
  { id: "code", type: "text" }, { id: "region", type: "text" },
];

test("selection fills only configured targets and leaves unrelated answers intact", () => {
  assert.deepEqual(fillReferenceSelection(fields, { unrelated: "keep" }, "branch", "a"), { unrelated: "keep", branch: "a", code: "A", region: "North" });
});
test("changing or clearing a selection replaces even manually edited suggestions", () => {
  const edited = { branch: "a", code: "A", region: "Custom" };
  assert.deepEqual(fillReferenceSelection(fields, edited, "branch", "b"), { branch: "b", code: "B", region: "South" });
  assert.deepEqual(fillReferenceSelection(fields, edited, "branch", ""), { branch: "", code: "", region: "" });
});
test("locked values defeat tampering while suggestions remain editable", () => {
  assert.deepEqual(applyLockedReferenceMappings(fields, { branch: "a", code: "FORGED", region: "Edited" }), { branch: "a", code: "A", region: "Edited" });
});
test("fresh row projections update new answers without mutating historical values", () => {
  const historical = { branch: "a", code: "A", region: "North" };
  const updated = [{ ...fields[0], optionMappedValues: { a: { code: "NEW", region: "West" } } }, ...fields.slice(1)];
  assert.equal(applyLockedReferenceMappings(updated, historical).code, "NEW");
  assert.equal(historical.code, "A");
});
test("empty or unavailable selections never retain a previous locked answer", () => {
  assert.equal(applyLockedReferenceMappings(fields, { code: "FORGED" }).code, "");
  assert.equal(applyLockedReferenceMappings(fields, { branch: "retired", code: "FORGED" }).code, "");
});
test("formula and read-only fields cannot be overwritten by malicious mapping definitions", () => {
  const protectedFields = [fields[0], { id: "code", type: "text", appFormula: '"Computed"' }, { id: "region", type: "text", readOnly: true }];
  const data = fillReferenceSelection(protectedFields, { code: "Computed", region: "Fixed" }, "branch", "a");
  assert.equal(data.code, "Computed");
  assert.equal(data.region, "Fixed");
  assert.equal(computeFormExpressions(protectedFields, applyLockedReferenceMappings(protectedFields, { branch: "a", code: "FORGED" })).code, "Computed");
});
test("only matching scalar types are allowed; choice, upload, formula, and read-only targets are excluded", () => {
  for (const [columnType, type] of [["text", "text"], ["number", "decimal"], ["boolean", "yesno"], ["date", "date"]]) {
    assert.equal(referenceColumnCompatible(columnType, { id: "x", type }), true);
  }
  for (const [columnType, type] of [["text", "number"], ["number", "text"], ["date", "datetime"], ["text", "file"], ["text", "ref"], ["boolean", "text"]]) {
    assert.equal(referenceColumnCompatible(columnType, { id: "x", type }), false);
  }
  assert.equal(referenceColumnCompatible("text", { id: "x", type: "text", appFormula: '"Formula"' }), false);
  assert.equal(referenceColumnCompatible("text", { id: "x", type: "text", readOnly: true }), false);
});
