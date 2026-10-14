import assert from "node:assert/strict";
import test from "node:test";
import { invitationCreationError as serverMessage } from "./invitation-errors";

test("registered account rejection reaches the invite form without exposing provider details", () => {
  const message = serverMessage({
    status: 422, errors: [{ code: "form_identifier_exists", message: "Private provider detail" }],
  });
  assert.match(message, /already has a FlowBuilder account/);
  assert.match(message, /another workspace.*separately/);
  assert.doesNotMatch(message, /Private provider detail/);
});

test("other server errors and network failures remain distinct", () => {
  assert.match(serverMessage(new Error("Internal private detail")), /could not be sent/);
});
