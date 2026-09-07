import { test } from "node:test";
import assert from "node:assert/strict";
import {
  uploadSchema,
  MAX_FILE_SIZE,
  validFileSignature,
} from "../lib/file-model";
test("file uploads reject unsupported formats, unsafe names and oversized bodies", () => {
  const file = { serviceId: "one", name: "Справка.pdf", size: 2048 };
  assert.equal(uploadSchema.safeParse(file).success, true);
  for (const patch of [
    { name: "page.html" },
    { name: "../doc.pdf" },
    { name: "a\r\nb.pdf" },
    { size: 0 },
    { size: MAX_FILE_SIZE + 1 },
  ])
    assert.equal(uploadSchema.safeParse({ ...file, ...patch }).success, false);
});
test("file contents must match a supported document signature", () => {
  assert.equal(
    validFileSignature(new TextEncoder().encode("%PDF-1.4"), "application/pdf"),
    true,
  );
  assert.equal(
    validFileSignature(
      new TextEncoder().encode("<html>bad"),
      "application/pdf",
    ),
    false,
  );
  assert.equal(
    validFileSignature(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    ),
    true,
  );
  assert.equal(
    validFileSignature(new Uint8Array([1, 2, 3]), "image/jpeg"),
    false,
  );
});
