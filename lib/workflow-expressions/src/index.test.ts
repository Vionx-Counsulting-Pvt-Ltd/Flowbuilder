import assert from "node:assert/strict";
import test from "node:test";
import {
  computeFormExpressions,
  evaluateExpression,
  getExpressionReferences,
  getExpressionDereferences,
  validateExpression,
  type ExpressionContext,
} from "./index";

const branchReference: ExpressionContext["fields"][number] = {
  id: "branch", key: "branch_key", label: "Branch", type: "select", sourceTableId: "branches",
  referenceColumns: [{ key: "region", label: "Region" }, { key: "code", label: "Branch Code" }, { key: "capacity", label: "Capacity" }, { key: "enabled", label: "Enabled" }],
  referenceData: {
    west: { region: "Western", code: "001", capacity: 12, enabled: false },
    east: { region: "Eastern", code: "002", capacity: 5, enabled: true },
    empty: { region: null },
  },
};

test("AppSheet dereferences use the selected row and match field/column labels or keys", () => {
  const ctx = { fields: [branchReference], values: { branch: "west" } };
  assert.equal(evaluateExpression("[Branch].[Region]", ctx), "Western");
  assert.equal(evaluateExpression("[branch_key].[REGION]", ctx), "Western");
  assert.equal(evaluateExpression("[Branch].[Branch Code]", ctx), "001");
  assert.equal(evaluateExpression("[Branch].[Capacity] + .5", ctx), 12.5);
  assert.equal(evaluateExpression("[Branch].[Enabled]", ctx), false);
  assert.deepEqual(getExpressionReferences('[Branch].[Region] & [Branch].[Branch Code]'), ["Branch"]);
  assert.deepEqual(getExpressionDereferences("[Branch].[Region]"), [{ field: "Branch", column: "Region" }]);
});

test("computed Region updates, clears, and cannot be overridden by submitted values", () => {
  const fields = [{ id: "region", label: "Region", appFormula: "[Branch].[Region]" }, branchReference];
  assert.equal(computeFormExpressions(fields, { branch: "west", region: "Forged" }).region, "Western");
  assert.equal(computeFormExpressions(fields, { branch: "east", region: "Old" }).region, "Eastern");
  assert.equal(computeFormExpressions(fields, { branch: "", region: "Old" }).region, null);
  assert.equal(computeFormExpressions(fields, { branch: "empty" }).region, null);
  assert.equal(evaluateExpression('IF(ISBLANK([Branch]), "", [Branch].[Region])', { fields, values: { branch: "" } }), "");
});

test("dereferences reject unsupported sources, columns, row IDs, property access and multiple hops", () => {
  const ctx = { fields: [branchReference], values: { branch: "foreign" } };
  assert.throws(() => evaluateExpression("[Branch].[Region]", ctx), /available table row/);
  assert.throws(() => evaluateExpression("[Branch].[Enabled]", { ...ctx, values: { branch: "empty" } }), /not available to this form/);
  assert.equal(validateExpression("[Branch].[Missing]", ctx.fields).valid, false);
  assert.equal(validateExpression("[Branch].[constructor]", ctx.fields).valid, false);
  assert.equal(validateExpression("[Branch].Region", ctx.fields).valid, false);
  assert.equal(validateExpression("[Branch].[Region].[Name]", ctx.fields).valid, false);
  assert.equal(validateExpression("[Branch].[Region]", [{ ...branchReference, type: "enumlist" }]).valid, false);
  assert.equal(validateExpression("[Branch].[Region]", [{ ...branchReference, sourceTableId: null }]).valid, false);
  assert.throws(() => computeFormExpressions([
    { ...branchReference, appFormula: "[Region]" },
    { id: "region", label: "Region", appFormula: "[Branch].[Region]" },
  ], {}), /loop/);
});

const context: ExpressionContext = {
  fields: [
    { id: "amount", key: "request_amount", label: "Amount" },
    { id: "department", label: "Department" },
    { id: "requester", label: "Requester" },
    { id: "tags", label: "Tags" },
  ],
  values: {
    amount: 2400,
    department: "Finance",
    requester: "Asha",
    tags: ["Urgent", "Travel"],
  },
  user: { email: "asha@example.com", name: "Asha Perera", role: "Developer" },
  now: new Date("2026-10-13T10:30:00.000Z"),
};

test("evaluates field references, precedence, and AppSheet-style boolean functions", () => {
  assert.equal(
    evaluateExpression('AND([Amount] > 1000, OR([Department] = "Finance", [Department] = "People"))', context),
    true,
  );
  assert.equal(evaluateExpression("([Amount] + 100) / 2", context), 1250);
});

test("evaluates conditional, list, and text functions", () => {
  assert.equal(evaluateExpression('IF(IN("Urgent", [Tags]), "Fast track", "Normal")', context), "Fast track");
  assert.equal(evaluateExpression('CONCATENATE([Requester], " - ", TEXT([Amount]))', context), "Asha - 2400");
  assert.deepEqual(evaluateExpression('SPLIT("a,b,c", ",")', context), ["a", "b", "c"]);
});

test("supports user and date functions with a fixed evaluation time", () => {
  assert.equal(evaluateExpression("USEREMAIL()", context), "asha@example.com");
  assert.equal(evaluateExpression("TODAY()", context), "2026-10-13");
  assert.equal(evaluateExpression('YEAR(DATE("2026-01-02"))', context), 2026);
  assert.equal(evaluateExpression('LAT(LATLONG(6.9, 79.8))', context), 6.9);
});

test("supports AppSheet-style branching and current-value validation", () => {
  assert.equal(evaluateExpression('IFS([Amount] > 5000, "high", [Amount] > 1000, "medium", "low")', context), "medium");
  assert.equal(evaluateExpression('SWITCH([Department], "Finance", "F", "People", "P", "?")', context), "F");
  assert.equal(evaluateExpression('IN([_THIS], LIST("Finance", "People"))', {
    ...context,
    values: { ...context.values, _THIS: "Finance" },
  }), true);
});

test("computes dependent fields in order and rejects formula cycles", () => {
  const fields = [
    { id: "total", label: "Total", appFormula: "[Quantity] * [Unit price]" },
    { id: "quantity", label: "Quantity", key: "count" },
    { id: "price", label: "Unit price" },
    { id: "greeting", label: "Greeting", initialValueExpression: 'CONCATENATE("Hello, ", [Requester])' },
    { id: "requester", label: "Requester" },
  ];
  assert.deepEqual(computeFormExpressions(fields, {
    quantity: 3,
    price: 12.5,
    requester: "Mina",
  }), {
    quantity: 3,
    price: 12.5,
    requester: "Mina",
    greeting: "Hello, Mina",
    total: 37.5,
  });
  assert.throws(() => computeFormExpressions([
    { id: "a", label: "A", appFormula: "[B] + 1" },
    { id: "b", label: "B", appFormula: "[A] + 1" },
  ], {}), /loop/);
});

test("validates unknown fields, unsupported functions, and syntax", () => {
  assert.deepEqual(validateExpression("[Amount] > 0", context.fields).valid, true);
  assert.deepEqual(validateExpression("[Missing] > 0", context.fields).valid, false);
  assert.deepEqual(validateExpression("EXECUTE(1)", context.fields).valid, false);
  assert.deepEqual(validateExpression("SELECT(1)", context.fields).valid, false);
  assert.deepEqual(validateExpression('IF([Amount] > 0, "yes")', context.fields).valid, false);
});
