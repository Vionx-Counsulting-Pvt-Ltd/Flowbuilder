import assert from "node:assert/strict";
import test from "node:test";
import { invitationRedirectUrl } from "./invitation-redirect";

test("invitations use the absolute preview sign-up URL rather than Clerk's accounts host", () => {
  assert.equal(invitationRedirectUrl({ headers: { host: "internal:8080", "x-forwarded-host": "workspace.replit.dev", origin: "https://workspace.replit.dev" } }), "https://workspace.replit.dev/sign-up");
});
test("forwarded host variations preserve the actual app or company domain", () => {
  for (const forwarded of ["portal.example.com", "portal.example.com, internal:8080", ["portal.example.com", "internal:8080"]]) {
    assert.equal(invitationRedirectUrl({ headers: { host: "internal:8080", "x-forwarded-host": forwarded, "x-forwarded-proto": "https, http" } }), "https://portal.example.com/sign-up");
  }
  assert.equal(invitationRedirectUrl({ headers: { host: "localhost:25908", origin: "http://localhost:25908" } }), "http://localhost:25908/sign-up");
});
test("reject untrusted origins, insecure external URLs and malformed hosts", () => {
  assert.throws(() => invitationRedirectUrl({ headers: { host: "portal.example.com", origin: "https://attacker.example.com" } }));
  assert.throws(() => invitationRedirectUrl({ headers: { host: "portal.example.com", origin: "http://portal.example.com" } }));
  assert.throws(() => invitationRedirectUrl({ headers: { host: "portal.example.com", origin: "https://portal.example.com/elsewhere" } }));
  for (const host of ["", "someone@attacker.example.com", "portal.example.com/sign-up", "portal.example.com?host=x"]) {
    assert.throws(() => invitationRedirectUrl({ headers: { host } }));
  }
});
