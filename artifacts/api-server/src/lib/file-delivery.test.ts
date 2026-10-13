import assert from "node:assert/strict";
import test from "node:test";
import { fileDeliveryHeaders } from "./file-delivery";

test("approved preview types open inline only when requested", () => {
  for (const type of ["application/pdf", "image/png", "image/jpeg", "text/plain"]) {
    assert.match(fileDeliveryHeaders(type, true, "receipt.pdf").contentDisposition, /^inline;/);
    assert.match(fileDeliveryHeaders(type, false, "receipt.pdf").contentDisposition, /^attachment;/);
  }
});

test("active documents and unsupported formats never open inline", () => {
  for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml", "application/javascript", "application/octet-stream", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) {
    assert.match(fileDeliveryHeaders(type, true).contentDisposition, /^attachment;/);
  }
});

test("filenames are encoded without header injection, and MIME parameters cannot inject headers", () => {
  const result = fileDeliveryHeaders("text/plain; charset=ascii", true, "résumé\r\n/\".txt");
  assert.equal(result.contentType, "text/plain; charset=utf-8");
  assert.ok(result.contentDisposition.includes("r%C3%A9sum%C3%A9___%22.txt"));
  assert.ok(!/[\r\n]/.test(result.contentDisposition));
  assert.equal(fileDeliveryHeaders("text/html\r\nX-Injected: yes", true).contentType, "application/octet-stream");
});
