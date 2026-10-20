import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NativeTransport, NativeEvent } from "../src/core.ts";
export class HostNativeTransport implements NativeTransport {
  listener?: (e: NativeEvent) => void;
  children = new Map<string, ChildProcessWithoutNullStreams>();
  private terminal = new Set<string>();
  addListener(_: string, fn: (e: NativeEvent) => void) {
    this.listener = fn;
    return {
      remove: () => {
        this.listener = undefined;
      },
    };
  }
  async start(id: string, bootstrap: string, data: string, limits: string) {
    const dir = mkdtempSync(join(tmpdir(), "expo-qjs-"));
    writeFileSync(join(dir, "bootstrap.js"), bootstrap);
    writeFileSync(join(dir, "data.json"), data);
    const l = JSON.parse(limits),
      child = spawn(join(process.cwd(), "build/channel_runner"), [
        join(dir, "bootstrap.js"),
        join(dir, "data.json"),
        ...[
          "timeoutMs",
          "memoryBytes",
          "stackBytes",
          "outputBytes",
          "messageBytes",
          "maxHostCalls",
        ].map((k) => String(l[k])),
      ]);
    this.children.set(id, child);
    let buffer = "";
    let pipeError: Error | undefined;
    child.stdin.on("error", (error) => {
      pipeError = error;
    });
    const watchdog = setTimeout(
      () => {
        child.kill("SIGKILL");
      },
      Math.min(l.timeoutMs + 5000, 30000),
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let n;
      while ((n = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, n);
        buffer = buffer.slice(n + 1);
        const event = { ...JSON.parse(line), runId: id };
        if (event.type === "terminal") this.terminal.add(id);
        this.listener?.(event);
      }
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
    child.on("close", (code, signal) => {
      clearTimeout(watchdog);
      this.children.delete(id);
      if (!this.terminal.has(id))
        this.listener?.({
          runId: id,
          type: "terminal",
          status: "native-error",
          error:
            pipeError?.message ??
            `Native subprocess exited without terminal event (${code ?? signal})`,
        });
      this.terminal.delete(id);
      rmSync(dir, { recursive: true, force: true });
    });
  }
  async deliver(id: string, message: string) {
    this.children
      .get(id)
      ?.stdin.write(`${JSON.parse(message).id}\t${message}\n`);
  }
  async stop(id: string) {
    const child = this.children.get(id);
    if (child) {
      const p = new Promise<void>((r) => child.once("close", () => r()));
      if (
        !this.terminal.has(id) &&
        !child.stdin.destroyed &&
        child.exitCode === null &&
        child.signalCode === null
      )
        child.stdin.write("stop\n");
      await p;
    }
  }
  async close() {
    await Promise.all([...this.children.keys()].map((id) => this.stop(id)));
  }
}
