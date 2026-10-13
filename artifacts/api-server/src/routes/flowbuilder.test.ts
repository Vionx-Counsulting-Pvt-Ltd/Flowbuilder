import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import test, { type TestContext } from "node:test";
import {
  auditEventsTable,
  db,
  requestsTable,
  tenantsTable,
  usersTable,
  workflowsTable,
  type WorkflowField,
  type WorkflowStage,
} from "@workspace/db";
import type { ObjectStorageService } from "../lib/objectStorage";
import { createFlowbuilderRouter } from "./flowbuilder";

type TestMember = {
  id: string;
  clerkUserId: string;
  tenantId: string;
  tenantName: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  managerId: string | null;
};

type TestWorkflow = {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  description: string;
  status: string;
  version: number;
  routing: string;
  fields: WorkflowField[];
  stages: WorkflowStage[];
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

const member: TestMember = {
  id: "user-1",
  clerkUserId: "clerk-user-1",
  tenantId: "tenant-1",
  tenantName: "Acme",
  name: "Riley Requester",
  email: "riley@example.com",
  roleId: "role-1",
  roleName: "Developer",
  permissions: ["create", "build"],
  managerId: null,
};

const approvalStages: WorkflowStage[] = [{
  id: "approval",
  name: "Approval",
  order: 1,
  assigneeType: "user",
  assigneeId: "approver-1",
  assigneeLabel: "Approver",
  slaHours: 24,
  conditionFieldId: null,
  conditionValue: null,
}];

function workflow(fields: WorkflowField[], status = "active"): TestWorkflow {
  const now = new Date("2026-10-13T10:30:00.000Z");
  return {
    id: "workflow-1",
    tenantId: member.tenantId,
    name: "Purchase request",
    category: "Operations",
    description: "Request a purchase.",
    status,
    version: 1,
    routing: "sequential",
    fields,
    stages: approvalStages,
    ownerUserId: member.id,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeQuery {
  private table: unknown;
  private selection: Record<string, unknown> = {};
  private input: any;
  private hasJoin = false;

  constructor(
    private readonly operation: "select" | "insert" | "update",
    private readonly state: TestState,
    selection?: unknown,
  ) {
    if (selection && typeof selection === "object") {
      this.selection = selection as Record<string, unknown>;
    }
  }

  from(table: unknown) {
    this.table = table;
    return this;
  }

  innerJoin() {
    this.hasJoin = true;
    return this;
  }

  leftJoin() {
    this.hasJoin = true;
    return this;
  }

  where() {
    return this;
  }

  limit() {
    return this;
  }

  orderBy() {
    return this;
  }

  values(value: unknown) {
    this.input = value;
    return this;
  }

  set(value: unknown) {
    this.input = value;
    return this;
  }

  returning() {
    if (this.operation === "insert" && this.table === requestsTable) {
      const now = new Date("2026-10-13T10:30:00.000Z");
      this.state.savedRequest = {
        ...(this.input as Record<string, unknown>),
        id: 41,
        createdAt: now,
        updatedAt: now,
      };
      return Promise.resolve([this.state.savedRequest]);
    }
    if (this.operation === "update" && this.table === requestsTable && this.state.savedRequest) {
      this.state.savedRequest = {
        ...this.state.savedRequest,
        ...(this.input as Record<string, unknown>),
      };
      return Promise.resolve([this.state.savedRequest]);
    }
    if (this.operation === "update" && this.table === workflowsTable) {
      this.state.currentWorkflow = {
        ...this.state.currentWorkflow,
        ...(this.input as Partial<TestWorkflow>),
      };
      return Promise.resolve([this.state.currentWorkflow]);
    }
    return Promise.resolve([]);
  }

  private result(): unknown[] {
    if (this.operation === "insert") {
      this.state.inserted.push({ table: this.table, values: this.input });
      return [];
    }
    if (this.operation === "select") {
      if (this.table === workflowsTable) return [this.state.currentWorkflow];
      if (this.table === tenantsTable) return [{ requestLimit: 10_000 }];
      if (this.table === requestsTable) {
        if (this.hasJoin && this.state.savedRequest) {
          return [{
            request: this.state.savedRequest,
            workflowName: this.state.currentWorkflow.name,
            workflowOwnerId: this.state.currentWorkflow.ownerUserId,
            requesterName: member.name,
          }];
        }
        return [{ value: 0 }];
      }
      if (this.table === usersTable) {
        if (this.hasJoin) return [];
        if ("managerId" in this.selection) return [{ managerId: null }];
        if ("name" in this.selection) return [{ name: member.name }];
      }
      if (this.table === auditEventsTable) return [];
    }
    return [];
  }

  then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}

type TestState = {
  currentWorkflow: TestWorkflow;
  inserted: Array<{ table: unknown; values: unknown }>;
  savedRequest?: Record<string, any>;
};

async function startApi(
  t: TestContext,
  currentWorkflow: TestWorkflow,
  state: TestState,
  storage?: Pick<ObjectStorageService, "getTenantFile">,
) {
  const mutableDb = db as any;
  t.mock.method(mutableDb, "select", (selection?: unknown) => new FakeQuery("select", state, selection));
  t.mock.method(mutableDb, "insert", (table: unknown) => new FakeQuery("insert", state).from(table));
  t.mock.method(mutableDb, "update", (table: unknown) => new FakeQuery("update", state).from(table));
  // Transactions must use the same fake database, not the real workspace database.
  t.mock.method(mutableDb, "transaction", async (callback: (tx: unknown) => Promise<unknown>) => callback({
    select: mutableDb.select,
    insert: mutableDb.insert,
    update: mutableDb.update,
    execute: async () => ({ rows: [{ nextCounter: 1 }] }),
  }));

  const app = express();
  app.use(express.json());
  app.use(createFlowbuilderRouter((_req, res, next) => {
    res.locals.member = member;
    next();
  }, storage));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address() as AddressInfo;
  return {
    state,
    fetch: (path: string, init?: RequestInit) =>
      fetch(`http://127.0.0.1:${address.port}${path}`, init),
  };
}

function testState(currentWorkflow: TestWorkflow): TestState {
  return { currentWorkflow, inserted: [] };
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

test("publishing rejects invalid expressions that reference fields outside the form", async (t) => {
  const currentWorkflow = workflow([
    { id: "amount", label: "Amount", type: "number", required: true },
    { id: "total", label: "Total", type: "number", required: false, appFormula: "[Missing] * 2" },
  ], "draft");
  const state = testState(currentWorkflow);
  const api = await startApi(t, currentWorkflow, state);

  const response = await api.fetch(`/workflows/${currentWorkflow.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "active" }),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json() as { error: string }).error, /computed value expression.*invalid/i);
  assert.equal(state.currentWorkflow.status, "draft");
  assert.equal(state.inserted.length, 0);
});

test("publishing accepts valid computed, visibility, required, and valid expressions", async (t) => {
  const currentWorkflow = workflow([
    { id: "amount", label: "Amount", type: "number", required: true },
    {
      id: "total",
      label: "Total",
      type: "number",
      required: true,
      appFormula: "[Amount] * 2",
      validIf: "[_THIS] = [Amount] * 2",
    },
    {
      id: "explanation",
      label: "Explanation",
      type: "text",
      required: false,
      showIf: "[Amount] > 100",
      requiredIf: "[Amount] > 500",
    },
  ], "draft");
  const state = testState(currentWorkflow);
  const api = await startApi(t, currentWorkflow, state);

  const response = await api.fetch(`/workflows/${currentWorkflow.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "active" }),
  });

  assert.equal(response.status, 200, await response.text());
  assert.equal(state.currentWorkflow.status, "active");
});

test("submission recomputes forged computed and read-only values on the server", async (t) => {
  const currentWorkflow = workflow([
    { id: "quantity", label: "Quantity", type: "number", required: true },
    {
      id: "total",
      label: "Total",
      type: "number",
      required: true,
      readOnly: true,
      appFormula: "[Quantity] * 2",
      validIf: "[_THIS] = [Quantity] * 2",
    },
    {
      id: "fixed",
      label: "Fixed value",
      type: "text",
      required: true,
      readOnly: true,
      defaultValue: "set by the workflow",
    },
  ]);
  const state = testState(currentWorkflow);
  const api = await startApi(t, currentWorkflow, state);

  const response = await api.fetch("/requests", json({
    workflowId: currentWorkflow.id,
    formData: { quantity: 5, total: 999, fixed: "forged by browser" },
  }));

  assert.equal(response.status, 201, await response.text());
  assert.equal(state.savedRequest?.formData.total, 10);
  assert.equal(state.savedRequest?.formData.fixed, "set by the workflow");
});

test("submission enforces conditional required rules and ignores hidden field values", async (t) => {
  const fields: WorkflowField[] = [
    { id: "amount", label: "Amount", type: "number", required: true },
    {
      id: "explanation",
      label: "Explanation",
      type: "text",
      required: true,
      showIf: "[Amount] > 5",
      requiredIf: "[Amount] > 5",
    },
  ];
  const currentWorkflow = workflow(fields);
  const state = testState(currentWorkflow);
  const api = await startApi(t, currentWorkflow, state);

  const missingRequiredResponse = await api.fetch("/requests", json({
    workflowId: currentWorkflow.id,
    formData: { amount: 6 },
  }));
  assert.equal(missingRequiredResponse.status, 400);
  assert.equal((await missingRequiredResponse.json() as { error: string }).error, "Explanation is required.");

  const hiddenValueResponse = await api.fetch("/requests", json({
    workflowId: currentWorkflow.id,
    formData: { amount: 2, explanation: "must not be retained" },
  }));
  assert.equal(hiddenValueResponse.status, 201, await hiddenValueResponse.text());
  assert.equal("explanation" in (state.savedRequest?.formData ?? {}), false);
});

test("submission enforces validIf expressions independently of the browser", async (t) => {
  const currentWorkflow = workflow([
    {
      id: "department",
      label: "Department",
      type: "text",
      required: true,
      validIf: 'IN([_THIS], LIST("Finance", "People"))',
      invalidMessage: "Choose Finance or People.",
    },
  ]);
  const state = testState(currentWorkflow);
  const api = await startApi(t, currentWorkflow, state);

  const response = await api.fetch("/requests", json({
    workflowId: currentWorkflow.id,
    formData: { department: "Operations" },
  }));

  assert.equal(response.status, 400);
  assert.equal((await response.json() as { error: string }).error, "Choose Finance or People.");
  assert.equal(state.savedRequest, undefined);
});

test("submission checks stored upload metadata instead of trusting the browser", async (t) => {
  const currentWorkflow = workflow([
    { id: "receipt", label: "Receipt", type: "image", required: false },
  ]);
  const state = testState(currentWorkflow);
  let storageLookups = 0;
  const storage = {
    async getTenantFile() {
      storageLookups += 1;
      return {
        async getMetadata() {
          return [{ size: "200", contentType: "application/pdf" }];
        },
      } as any;
    },
  };
  const api = await startApi(t, currentWorkflow, state, storage);

  const response = await api.fetch("/requests", json({
    workflowId: currentWorkflow.id,
    formData: {
      receipt: [{
        fileId: "0a332c3e-84cb-4b52-b582-1eb5638cf0c9",
        name: "receipt.png",
        contentType: "image/png",
        size: 200,
      }],
    },
  }));

  assert.equal(response.status, 400);
  assert.equal((await response.json() as { error: string }).error, "Receipt must contain image files.");
  assert.equal(storageLookups, 1);
  assert.equal(state.savedRequest, undefined);
});
