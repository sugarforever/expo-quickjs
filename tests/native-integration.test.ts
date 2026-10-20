import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuickJS } from "../src/core.ts";
import { HostNativeTransport } from "./native-transport.ts";
test("real native engine executes facade prelude and concurrent out-of-order host calls", async () => {
  const q = createQuickJS(new HostNativeTransport());
  try {
    const r = await q.execute(
      'text("你好🌳");return await Promise.all([tools.slow(1),tools.fast(2)])',
      {
        runId: "a",
        tools: {
          slow: async () => {
            await new Promise((r) => setTimeout(r, 30));
            return 3;
          },
          fast: () => 4,
        },
      },
    );
    assert.deepEqual(r, { ok: true, value: [3, 4], output: ["你好🌳"] });
  } finally {
    await q.close();
  }
});
test("real return values cannot collide with internal script error envelope", async () => {
  const q = createQuickJS(new HostNativeTransport());
  try {
    const r = await q.execute('return {__executionError:"value"}', {
      runId: "a",
    });
    assert.equal(r.ok, true);
  } finally {
    await q.close();
  }
});
test("real native bootstrap hides bridge and terminates unresolved promises", async () => {
  const q = createQuickJS(new HostNativeTransport());
  try {
    const r = await q.execute(
      "return [typeof __request,typeof __finish,typeof __receive,typeof __drain]",
      { runId: "a" },
    );
    assert.deepEqual(r, {
      ok: true,
      value: ["undefined", "undefined", "undefined", "undefined"],
      output: [],
    });
    const stalled = await q.execute("await new Promise(()=>{})", {
      runId: "b",
    });
    assert.equal(stalled.ok, false);
  } finally {
    await q.close();
  }
});
test("CPU and microtask loops remain watchdog bounded in actual native engine", async () => {
  const q = createQuickJS(new HostNativeTransport());
  try {
    for (const [i, code] of [
      "while(true){}",
      "while(true) await null",
    ].entries()) {
      const r = await q.execute(code, {
        runId: String(i),
        limits: { timeoutMs: 50 },
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.status, "timeout");
    }
  } finally {
    await q.close();
  }
});

test("batched immediate replies all resume in native runner", async () => {
  const q = createQuickJS(new HostNativeTransport());
  try {
    const r = await q.execute(
      "return await Promise.all(Array.from({length:16},(_,i)=>tools.echo(i)))",
      { runId: "a", tools: { echo: (x) => x } },
    );
    assert.deepEqual(r, {
      ok: true,
      value: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      output: [],
    });
  } finally {
    await q.close();
  }
});
test("native exception text obeys bridge byte limit", async () => {
  const q = createQuickJS(new HostNativeTransport());
  try {
    let terminal: any;
    await q.start(
      {
        runId: "a",
        bootstrap: 'throw Error("x".repeat(10000))',
        limits: { messageBytes: 1024 },
      },
      (e) => {
        if (e.type === "terminal") terminal = e;
      },
    );
    for (let i = 0; i < 200 && !terminal; i++)
      await new Promise((r) => setTimeout(r, 5));
    assert.ok(terminal);
    assert.ok(Buffer.byteLength(terminal.error) <= 1024);
  } finally {
    await q.close();
  }
});
test("cyclic and BigInt script return values fail explicitly rather than timing out", async () => {
  const q = createQuickJS(new HostNativeTransport());
  try {
    for (const [i, code] of [
      "const x={};x.x=x;return x",
      "return 1n",
    ].entries()) {
      const r = await q.execute(code, {
        runId: String(i),
        limits: { timeoutMs: 100 },
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.status, "script-error");
    }
  } finally {
    await q.close();
  }
});
test("omitted JSON values normalize to null at the public boundary", async () => {
  const q = createQuickJS(new HostNativeTransport());
  try {
    const r = await q.execute("text(()=>{});return ()=>{}", { runId: "a" });
    assert.deepEqual(r, { ok: true, value: null, output: [null] });
  } finally {
    await q.close();
  }
});

test("cleanup joins a terminal subprocess without writing to its closed stdin", async () => {
  const transport = new HostNativeTransport();
  let lateWrites = 0;
  const completed = new Promise<void>((resolve, reject) => {
    transport.addListener("onEvent", (event) => {
      if (event.type !== "terminal") return;
      const child = transport.children.get("closed-pipe");
      assert.ok(child);
      child.stdin.destroy();
      child.stdin.write = (() => {
        lateWrites++;
        return false;
      }) as typeof child.stdin.write;
      void transport.close().then(resolve, reject);
    });
  });
  await transport.start(
    "closed-pipe",
    "__finish('null')",
    "null",
    JSON.stringify({
      timeoutMs: 1000,
      memoryBytes: 33554432,
      stackBytes: 262144,
      outputBytes: 1048576,
      messageBytes: 1048576,
      maxHostCalls: 32,
    }),
  );
  await completed;
  assert.equal(lateWrites, 0);
});
