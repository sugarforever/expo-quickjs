import React, { useEffect, useRef, useState } from "react";
import { Button, ScrollView, Text } from "react-native";
import { createQuickJS } from "expo-quickjs";
export default function App() {
  const [q] = useState(() => createQuickJS());
  const [result, setResult] = useState("Ready"),
    [ticks, setTicks] = useState(0);
  const active = useRef("");
  useEffect(() => {
    void selftest();
    const t = setInterval(() => setTicks((n) => n + 1), 100);
    return () => {
      clearInterval(t);
      void q.close();
    };
  }, []);
  async function run(code: string) {
    const runId = `run-${Date.now()}`;
    active.current = runId;
    setResult("Running");
    try {
      setResult(
        JSON.stringify(
          await q.execute(code, {
            runId,
            limits: { timeoutMs: 3000 },
            tools: {
              lookup: async (args, { signal }) => {
                await new Promise((r) => setTimeout(r, 400));
                if (signal.aborted) throw Error("cancelled");
                return { player: args, points: 12 };
              },
            },
          }),
        ),
      );
    } catch (e) {
      setResult(String(e));
    }
  }
  async function selftest() {
    const checks: string[] = [];
    let sequence = 0;
    const prefix = `test-${Date.now()}-`;
    const evaluate = (code: string, extra: any = {}) =>
      q.execute(code, { runId: prefix + sequence++, ...extra });
    try {
      const calc = await evaluate("return 6*7");
      if (!calc.ok || calc.value !== 42) throw Error("calculation failed");
      checks.push("calculation");
      const asyncResult = await evaluate('return await tools.echo("你好🌳")', {
        tools: {
          echo: async (v: any) => {
            await new Promise((r) => setTimeout(r, 50));
            return v;
          },
        },
      });
      if (!asyncResult.ok || asyncResult.value !== "你好🌳")
        throw Error("host call failed");
      checks.push("Unicode async host");
      for (const code of ["while(true){}", "while(true) await null"]) {
        const c = new AbortController();
        let responsive = false;
        const timer = setTimeout(() => {
          responsive = true;
          c.abort();
        }, 100);
        const result = await evaluate(code, {
          signal: c.signal,
          limits: { timeoutMs: 2000 },
        });
        clearTimeout(timer);
        if (result.ok !== false || result.status !== "aborted" || !responsive)
          throw Error("cancellation/responsiveness failed");
        checks.push(code.includes("await") ? "microtask cancel" : "CPU cancel");
      }
      const output = await evaluate('while(true)text("x".repeat(10000))', {
        limits: { outputBytes: 20000 },
      });
      if (output.ok !== false || output.status !== "resource-limit")
        throw Error("output limit failed");
      checks.push("output limit");
      for (let i = 0; i < 10; i++) {
        const r = await evaluate("return 1");
        if (!r.ok) throw Error("repeat failed");
      }
      checks.push("10 create/dispose");
      setResult("SELFTEST PASS: " + checks.join(", "));
    } catch (e) {
      setResult("SELFTEST FAIL: " + String(e) + " after " + checks.join(", "));
    }
  }
  return (
    <ScrollView
      contentContainerStyle={{ padding: 32, paddingTop: 70, gap: 12 }}
    >
      <Text>Native QuickJS / Hermes UI ticks: {ticks}</Text>
      <Button title="Run native self-test" onPress={selftest} />
      <Button
        title="Calculate"
        onPress={() => run('text("你好🌳");return 6*7')}
      />
      <Button
        title="Async controlled host tool"
        onPress={() => run('return await tools.lookup("Salah")')}
      />
      <Button title="CPU loop" onPress={() => run("while(true){}")} />
      <Button
        title="Microtask loop"
        onPress={() => run("while(true) await null")}
      />
      <Button
        title="Output limit"
        onPress={() => run('while(true)text("x".repeat(10000))')}
      />
      <Button title="Cancel" onPress={() => q.cancel(active.current)} />
      <Text selectable>{result}</Text>
    </ScrollView>
  );
}
