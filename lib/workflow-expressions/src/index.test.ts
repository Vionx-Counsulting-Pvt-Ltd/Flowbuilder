import assert from "node:assert/strict";
import test from "node:test";
import {
  computeFormExpressions,
  evaluateExpression,
  validateExpression,
  type ExpressionContext,
} from "./index";

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
