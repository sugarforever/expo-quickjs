import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createQuickJS,
  type NativeTransport,
  type NativeEvent,
} from "../src/core.ts";
class Transport implements NativeTransport {
  listener?: (e: NativeEvent) => void;
  starts: any[] = [];
  replies: any[] = [];
  stops: string[] = [];
  addListener(_: string, fn: (e: NativeEvent) => void) {
    this.listener = fn;
    return {
      remove: () => {
        this.listener = undefined;
      },
    };
  }
  async start(...a: any[]) {
    this.starts.push(a);
  }
  async deliver(id: string, json: string) {
    this.replies.push([id, JSON.parse(json)]);
  }
  async stop(id: string) {
    this.stops.push(id);
    this.listener?.({ runId: id, type: "terminal", status: "aborted" });
  }
  async close() {}
  send(e: NativeEvent) {
    this.listener?.(e);
  }
}
test("calculations and tools cross only bounded serialized transport", async () => {
  const t = new Transport(),
    q = createQuickJS(t);
  const p = q.execute("return await tools.sum({a:2})", {
    runId: "a",
    tools: { sum: async (v: any) => v.a + 3 },
  });
  await new Promise((r) => setImmediate(r));
  t.send({
    runId: "a",
    type: "message",
    json: '{"type":"call","id":1,"name":"sum","args":{"a":2}}',
  });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(t.replies, [["a", { id: 1, ok: true, payload: 5 }]]);
  t.send({
    runId: "a",
    type: "terminal",
    status: "ok",
    json: '{"ok":true,"value":5}',
  });
  assert.deepEqual(await p, { ok: true, value: 5, output: [] });
  await q.close();
});
test("validation prevents duplicate runs and invalid byte budgets", async () => {
  const t = new Transport(),
    q = createQuickJS(t);
  await assert.rejects(
    q.start(
      { runId: "x", bootstrap: "", limits: { timeoutMs: NaN } },
      () => {},
    ),
  );
  assert.equal(t.starts.length, 0);
  await q.start({ runId: "x", bootstrap: "" }, () => {});
  await assert.rejects(q.start({ runId: "x", bootstrap: "" }, () => {}));
  await q.close();
});
test("abort before admission never starts native runtime", async () => {
  const t = new Transport(),
    q = createQuickJS(t),
    c = new AbortController();
  c.abort();
  const r = await q.execute("while(true){}", { runId: "a", signal: c.signal });
  assert.equal(r.ok, false);
  assert.equal(t.starts.length, 0);
  await q.close();
});
test("late host result after stop never delivered", async () => {
  const t = new Transport(),
    q = createQuickJS(t);
  let done!: (v: number) => void;
  const p = q.execute("", {
    runId: "a",
    tools: {
      slow: () =>
        new Promise<number>((r) => {
          done = r;
        }),
    },
  });
  await new Promise((r) => setImmediate(r));
  t.send({
    runId: "a",
    type: "message",
    json: '{"type":"call","id":1,"name":"slow","args":null}',
  });
  await q.stop("a");
  done(3);
  await new Promise((r) => setImmediate(r));
  assert.equal(t.replies.length, 0);
  assert.equal((await p).ok, false);
  await q.close();
});
test("cyclic host results become explicit host error", async () => {
  const t = new Transport(),
    q = createQuickJS(t);
  const p = q.execute("", {
    runId: "a",
    tools: {
      cycle: () => {
        const x: any = {};
        x.x = x;
        return x;
      },
    },
  });
  await new Promise((r) => setImmediate(r));
  t.send({
    runId: "a",
    type: "message",
    json: '{"type":"call","id":1,"name":"cycle","args":null}',
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(t.replies[0][1].ok, false);
  t.send({
    runId: "a",
    type: "terminal",
    status: "ok",
    json: '{"ok":true,"value":null}',
  });
  await p;
  await q.close();
});
test("abort during async native admission waits for admission then stops admitted VM", async () => {
  class Delayed extends Transport {
    admit!: () => void;
    override async start(...a: any[]) {
      await new Promise<void>((r) => {
        this.admit = r;
      });
      this.starts.push(a);
    }
  }
  const t = new Delayed(),
    q = createQuickJS(t),
    c = new AbortController();
  const p = q.execute("", { runId: "a", signal: c.signal });
  c.abort();
  await new Promise((r) => setImmediate(r));
  assert.equal(t.stops.length, 0);
  t.admit();
  const result = await p;
  assert.equal(result.ok, false);
  assert.deepEqual(t.stops, ["a"]);
  await q.close();
});
test("all concurrent close callers await the same teardown", async () => {
  class SlowStop extends Transport {
    release!: () => void;
    override async stop(id: string) {
      await new Promise<void>((r) => {
        this.release = r;
      });
      await super.stop(id);
    }
  }
  const t = new SlowStop(),
    q = createQuickJS(t);
  await q.start({ runId: "a", bootstrap: "" }, () => {});
  const first = q.close();
  await new Promise((r) => setImmediate(r));
  let secondDone = false;
  const second = q.close().then(() => {
    secondDone = true;
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(secondDone, false);
  t.release();
  await Promise.all([first, second]);
});
test("malformed Unicode run IDs reject before transport can normalize their identity", async () => {
  const t = new Transport(),
    q = createQuickJS(t);
  await assert.rejects(
    q.start({ runId: "bad\ud800", bootstrap: "" }, () => {}),
  );
  assert.equal(t.starts.length, 0);
  await q.close();
});
test("transport stop failure still closes native module and settles executions", async () => {
  class BrokenStop extends Transport {
    didClose = false;
    override async stop(_id: string) {
      throw Error("stop failed");
    }
    override async close() {
      this.didClose = true;
    }
  }
  const t = new BrokenStop(),
    q = createQuickJS(t);
  const execution = q.execute("", { runId: "a" });
  await new Promise((r) => setImmediate(r));
  await assert.rejects(q.close());
  assert.equal(t.didClose, true);
  assert.equal((await execution).ok, false);
});
