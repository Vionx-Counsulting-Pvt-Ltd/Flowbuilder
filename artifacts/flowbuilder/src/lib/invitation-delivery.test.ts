import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { resendUserInvitation } from "@workspace/api-client-react";
import { invitationCreationError, invitationDeliveryError, shouldRetryInvitation } from "./invitation-delivery";

test("lost resend response retries with the same operation key and credentials", async t => {
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "/api/users/synthetic/invitation");
    requests.push(options);
    if (requests.length === 1) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ id: "synthetic", status: "invited" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  });
  const qc = new QueryClient();
  try {
    const mutation = qc.getMutationCache().build(qc, {
      mutationFn: () => resendUserInvitation("synthetic", {
        idempotencyKey: "410bd455-8140-49be-b7f8-f15dc67e1d9c",
      }, { credentials: "same-origin" }),
      retry: shouldRetryInvitation, retryDelay: 0,
    });
    const result = await mutation.execute(undefined);
    assert.equal(result.status, "invited");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body, requests[1].body);
    assert.equal(requests[1].credentials, "same-origin");
    assert.equal(new Headers(requests[1].headers).get("content-type"), "application/json");
  } finally { qc.clear(); }
});

test("permanent errors are not retried and offline failures have actionable text", () => {
  assert.equal(shouldRetryInvitation(0, new TypeError("Failed to fetch")), true);
  assert.equal(shouldRetryInvitation(2, new TypeError("Failed to fetch")), false);
  assert.equal(shouldRetryInvitation(0, new Error("HTTP 401 Unauthorized")), false);
  assert.equal(shouldRetryInvitation(0, new Error("HTTP 409 delivery failed")), false);
  assert.match(invitationDeliveryError(new TypeError("Failed to fetch")), /retry.*not send a duplicate/i);
  assert.equal(invitationDeliveryError(new Error("Already registered")), "Already registered");
});

test("new invitation form shows the server reason and distinguishes connection failures", () => {
  const reason = "This email address already has a FlowBuilder account.";
  assert.equal(invitationCreationError(Object.assign(new Error("HTTP 409"), { data: { error: reason } })), reason);
  assert.equal(invitationCreationError(Object.assign(new Error("HTTP 403"), { data: { error: "Workspace member limit reached." } })), "Workspace member limit reached.");
  assert.match(invitationCreationError(new TypeError("Failed to fetch")), /reach the server/);
});
