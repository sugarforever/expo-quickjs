export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface Limits {
  timeoutMs: number;
  memoryBytes: number;
  stackBytes: number;
  outputBytes: number;
  messageBytes: number;
  maxHostCalls: number;
}
export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  timeoutMs: 10000,
  memoryBytes: 33554432,
  stackBytes: 262144,
  outputBytes: 1048576,
  messageBytes: 1048576,
  maxHostCalls: 32,
});
export const ENGINE_REVISION = "quickjs-2025-09-13";
export const CHANNEL_VERSION = "expo-quickjs-channel-1";
export type Status =
  | "ok"
  | "script-error"
  | "timeout"
  | "aborted"
  | "resource-limit"
  | "native-error";
export type NativeEvent = {
  runId: string;
  type: "message" | "terminal";
  status?: Status;
  json?: string;
  error?: string;
};
export interface NativeTransport {
  readonly identity?: string;
  addListener(
    name: "onEvent",
    fn: (event: NativeEvent) => void,
  ): { remove(): void };
  start(
    runId: string,
    bootstrap: string,
    dataJson: string,
    limitsJson: string,
  ): Promise<void>;
  deliver(runId: string, messageJson: string): Promise<void>;
  stop(runId: string): Promise<void>;
  close(): Promise<void>;
}
export interface StartOptions {
  runId: string;
  bootstrap: string;
  data?: JsonValue;
  limits?: Partial<Limits>;
}
export type Tool = (
  args: JsonValue,
  context: { signal: AbortSignal; runId: string },
) => JsonValue | undefined | Promise<JsonValue | undefined>;
export interface ExecuteOptions {
  runId: string;
  tools?: Record<string, Tool>;
  /** Synchronously observe each text() value in order. Return values are ignored.
   * Values are separate copies from result.output. Throwing stops the run with native-error.
   */
  onOutput?: (value: JsonValue) => void;
  signal?: AbortSignal;
  limits?: Partial<Limits>;
}
export type ExecutionResult =
  | { ok: true; value: JsonValue; output: JsonValue[] }
  | {
      ok: false;
      status: Exclude<Status, "ok">;
      error: string;
      output: JsonValue[];
    };
// Hermes builds do not universally expose TextEncoder. Count UTF-8 without Node or polyfills.
export function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 128) n++;
    else if (c < 2048) n += 2;
    else if (
      c >= 0xd800 &&
      c <= 0xdbff &&
      i + 1 < s.length &&
      s.charCodeAt(i + 1) >= 0xdc00 &&
      s.charCodeAt(i + 1) <= 0xdfff
    ) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
export function effectiveLimits(partial: Partial<Limits> = {}): Limits {
  const l = { ...DEFAULT_LIMITS, ...partial };
  const ranges: Record<keyof Limits, [number, number]> = {
    timeoutMs: [1, 86400000],
    memoryBytes: [262144, 2147483648],
    stackBytes: [16384, 1048576],
    outputBytes: [1, 67108864],
    messageBytes: [1, 16777216],
    maxHostCalls: [1, 1024],
  };
  for (const k of Object.keys(l) as (keyof Limits)[]) {
    if (
      !ranges[k] ||
      !Number.isSafeInteger(l[k]) ||
      l[k] < ranges[k][0] ||
      l[k] > ranges[k][1]
    )
      throw Error(`Invalid limit: ${k}`);
  }
  return l;
}
function serialize(value: unknown, max: number): string {
  const s = JSON.stringify(value);
  if (s === undefined) throw Error("Value is not JSON serializable");
  if (utf8Bytes(s) > max) throw Error("Message byte limit exceeded");
  return s;
}
const EXECUTE_BOOTSTRAP = `(()=>{
 const emit=__emit,request=__request,finish=__finish,data=__startData,stringify=JSON.stringify.bind(JSON);
 delete globalThis.__emit;delete globalThis.__request;delete globalThis.__finish;delete globalThis.__startData;
 const pending=new Map();let id=0,started=false,settled=false;
 const tools=Object.create(null);
 for(const name of data.tools) tools[name]=args=>new Promise((resolve,reject)=>{const call=++id;pending.set(call,{resolve,reject});try{request(call,stringify({type:'call',id:call,name,args:args===undefined?null:args}))}catch(e){pending.delete(call);reject(e)}});
 Object.freeze(tools);
 const text=value=>emit(stringify({type:'output',value:value===undefined?null:value}));
 const fail=e=>{settled=true;finish(stringify({ok:false,error:String(e)}))};
 globalThis.__receive=m=>{const p=pending.get(m.id);if(!p)throw Error('Unknown result');pending.delete(m.id);m.ok?p.resolve(m.payload):p.reject(Error(m.error||'Host call failed'));};
 globalThis.__drain=()=>{
  if(!started){started=true;let fn;try{fn=(0,eval)('(async (tools,text)=>{'+data.code+'\\n})')}catch(e){fail(e);return false}
   fn(tools,text).then(value=>{try{settled=true;finish(stringify({ok:true,value:value===undefined?null:value}))}catch(e){fail(e)}},fail);return true;}
  if(!settled&&pending.size===0){settled=true;finish(stringify({ok:false,error:'Script stalled with no pending host calls'}))}return false;
 };
})()`;
export function createQuickJS(transport: NativeTransport) {
  let closed = false;
  let closing: Promise<void> | undefined;
  const ids = new Set<string>();
  const runs = new Map<
    string,
    {
      listener: (event: NativeEvent) => void;
      limits: Limits;
      pending: Set<number>;
      controller: AbortController;
      admission: Promise<void>;
      stopping?: Promise<void>;
    }
  >();
  const subscription = transport.addListener("onEvent", (event) => {
    const run = runs.get(event.runId);
    if (!run) return;
    if (event.type === "terminal") {
      runs.delete(event.runId);
      run.controller.abort();
    }
    try {
      run.listener(event);
    } catch {
      void stop(event.runId);
    }
  });
  async function start(
    options: StartOptions,
    onEvent: (event: NativeEvent) => void,
  ): Promise<void> {
    const limits = effectiveLimits(options.limits);
    if (closed || ids.has(options.runId) || runs.size >= 2)
      throw Error("Closed runtime, duplicate run ID or admission limit");
    if (
      typeof options.runId !== "string" ||
      !options.runId ||
      !wellFormed(options.runId) ||
      utf8Bytes(options.runId) > 256
    )
      throw Error("Invalid run ID");
    if (
      typeof options.bootstrap !== "string" ||
      !wellFormed(options.bootstrap) ||
      utf8Bytes(options.bootstrap) > limits.messageBytes
    )
      throw Error("Bootstrap byte limit exceeded");
    const data = serialize(options.data ?? null, limits.messageBytes);
    ids.add(options.runId);
    const state = {
      listener: onEvent,
      limits,
      pending: new Set<number>(),
      controller: new AbortController(),
      admission: Promise.resolve(),
    };
    runs.set(options.runId, state);
    try {
      state.admission = transport.start(
        options.runId,
        options.bootstrap,
        data,
        JSON.stringify(limits),
      );
      await state.admission;
    } catch (e) {
      runs.delete(options.runId);
      throw e;
    }
  }
  async function deliver(runId: string, message: JsonValue): Promise<void> {
    const run = runs.get(runId);
    if (!run) throw Error("Unknown or completed run");
    await transport.deliver(runId, serialize(message, run.limits.messageBytes));
  }
  async function stop(runId: string): Promise<void> {
    const run = runs.get(runId);
    if (!run) return;
    if (run.stopping) return run.stopping;
    run.controller.abort();
    run.stopping = (async () => {
      try {
        await run.admission;
      } catch {
        return;
      }
      await transport.stop(runId);
      // Native stop joins before resolving; event dispatch may still be queued.
      if (runs.get(runId) === run) {
        runs.delete(runId);
        run.listener({
          runId,
          type: "terminal",
          status: "aborted",
          error: "Execution cancelled",
        });
      }
    })();
    return run.stopping;
  }
  function close(): Promise<void> {
    if (closing) return closing;
    closed = true;
    closing = (async () => {
      const stopped = await Promise.allSettled([...runs.keys()].map(stop));
      let failure = stopped.find((r) => r.status === "rejected");
      let nativeError: unknown;
      try {
        await transport.close();
      } catch (e) {
        nativeError = e;
      }
      for (const [runId, run] of runs) {
        runs.delete(runId);
        run.controller.abort();
        try {
          run.listener({
            runId,
            type: "terminal",
            status: "native-error",
            error: "Native transport teardown failed",
          });
        } catch {}
      }
      subscription.remove();
      if (failure?.status === "rejected") throw failure.reason;
      if (nativeError) throw nativeError;
    })();
    return closing;
  }
  async function execute(
    code: string,
    options: ExecuteOptions,
  ): Promise<ExecutionResult> {
    const output: JsonValue[] = [];
    if (options.signal?.aborted)
      return {
        ok: false,
        status: "aborted",
        error: "Execution cancelled",
        output,
      };
    const tools = options.tools ?? {};
    const names = Object.keys(tools);
    for (const name of names) {
      if (!name || typeof tools[name] !== "function")
        throw Error("Invalid tool name or handler");
    }
    const limits = effectiveLimits(options.limits);
    const seen = new Set<number>();
    let resolve!: (r: ExecutionResult) => void;
    const promise = new Promise<ExecutionResult>((r) => {
      resolve = r;
    });
    let completed = false;
    const abort = () => {
      void stop(options.runId).catch((e) =>
        finish({ ok: false, status: "native-error", error: String(e), output }),
      );
    };
    const finish = (result: ExecutionResult) => {
      if (completed) return;
      completed = true;
      options.signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const handle = async (e: NativeEvent) => {
      if (completed) return;
      if (e.type === "terminal") {
        if (e.status !== "ok") {
          finish({
            ok: false,
            status: e.status ?? "native-error",
            error: e.error || e.status || "Native transport failure",
            output,
          });
          return;
        }
        try {
          const result = JSON.parse(e.json ?? "null");
          if (!result || typeof result.ok !== "boolean")
            throw Error("Malformed completion envelope");
          if (!result.ok)
            finish({
              ok: false,
              status: "script-error",
              error: result.error,
              output,
            });
          else finish({ ok: true, value: result.value ?? null, output });
        } catch (err) {
          finish({
            ok: false,
            status: "native-error",
            error: String(err),
            output,
          });
        }
        return;
      }
      try {
        if (!e.json || utf8Bytes(e.json) > limits.messageBytes)
          throw Error("Invalid native message");
        const m = JSON.parse(e.json);
        if (m.type === "output") {
          output.push(m.value ?? null);
          // Keep the collected result independent of mutations by the observer.
          const run = runs.get(options.runId);
          if (run && !run.controller.signal.aborted && options.onOutput)
            options.onOutput(JSON.parse(e.json).value ?? null);
          return;
        }
        if (
          m.type !== "call" ||
          !Number.isSafeInteger(m.id) ||
          m.id < 1 ||
          seen.has(m.id)
        )
          throw Error("Invalid or duplicate host call");
        seen.add(m.id);
        const run = runs.get(options.runId);
        if (!run) return;
        if (run.pending.size >= limits.maxHostCalls)
          throw Error("Host call limit exceeded");
        run.pending.add(m.id);
        let reply: JsonValue;
        try {
          if (!Object.hasOwn(tools, m.name)) throw Error("Unknown host tool");
          const value = await tools[m.name](m.args, {
            signal: run.controller.signal,
            runId: options.runId,
          });
          reply = { id: m.id, ok: true, payload: value ?? null };
          serialize(reply, limits.messageBytes);
        } catch (err) {
          reply = {
            id: m.id,
            ok: false,
            error: String(err).slice(
              0,
              Math.max(0, Math.floor(limits.messageBytes / 8) - 64),
            ),
          };
        }
        if (
          completed ||
          run.controller.signal.aborted ||
          runs.get(options.runId) !== run
        )
          return;
        run.pending.delete(m.id);
        await deliver(options.runId, reply);
      } catch (err) {
        finish({
          ok: false,
          status: "native-error",
          error: String(err),
          output,
        });
        await stop(options.runId);
      }
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      await start(
        {
          runId: options.runId,
          bootstrap: EXECUTE_BOOTSTRAP,
          data: { code, tools: names },
          limits,
        },
        (e) => {
          void handle(e);
        },
      );
      if (options.signal?.aborted) abort();
    } catch (e) {
      options.signal?.removeEventListener("abort", abort);
      throw e;
    }
    return promise;
  }
  return {
    get identity() {
      return transport.identity;
    },
    start,
    deliver,
    stop,
    cancel: stop,
    close,
    execute,
  };
}
export type QuickJS = ReturnType<typeof createQuickJS>;
export { EXECUTE_BOOTSTRAP };
