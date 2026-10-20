import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublished } from "../scripts/release-status.mjs";

test("release retry recognizes an already published version", async () => {
  assert.equal(
    await isPublished(
      "expo-quickjs",
      "0.1.0",
      async () =>
        new Response(JSON.stringify({ version: "0.1.0" }), { status: 200 }),
    ),
    true,
  );
});
test("only registry 404 permits a new publication", async () => {
  assert.equal(
    await isPublished(
      "expo-quickjs",
      "0.1.0",
      async () => new Response("{}", { status: 404 }),
    ),
    false,
  );
  await assert.rejects(
    isPublished(
      "expo-quickjs",
      "0.1.0",
      async () => new Response("{}", { status: 503 }),
    ),
  );
  await assert.rejects(
    isPublished(
      "expo-quickjs",
      "0.1.0",
      async () =>
        new Response(JSON.stringify({ version: "0.2.0" }), { status: 200 }),
    ),
  );
});
