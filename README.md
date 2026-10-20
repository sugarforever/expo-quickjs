# expo-quickjs

MIT native QuickJS workers for Expo iOS and Android, alongside Hermes. Each run gets a fresh QuickJS runtime/context on a dedicated native thread. The generic package has no Pi dependency and grants no filesystem, network, module-loader, Node or device APIs.

This is a prerelease implementation, not yet published to npm. Android builds and the cross-platform CI matrix must be verified before release. Use an Expo development/native build; Expo Go cannot load it. Initial target: Expo 58, React Native 0.88, iOS 16.4+ / Android API 24+. See [verification](docs/verification.md) for what was actually exercised.

```ts
import { createQuickJS } from 'expo-quickjs';

const quickjs = createQuickJS();
const controller = new AbortController();
const result = await quickjs.execute(`
  const player = await tools.lookup({ id: 11 });
  text(player.name);
  return player.points;
`, {
  runId: 'lookup-1', // unique for the lifetime of the native module
  signal: controller.signal,
  tools: {
    lookup: async (args, { signal }) => {
      // Explicit app capability. Implement authentication/authorization here.
      if (signal.aborted) throw new Error('Cancelled');
      return { name: 'Controlled fixture', points: 12 };
    },
  },
});
// result: { ok: true, value: 12, output: ['Controlled fixture'] }
await quickjs.cancel('lookup-1'); // idempotent; no effect after completion
await quickjs.close(); // terminal; joins workers, removes listeners
```

`execute` takes an async function body. `tools` is an immutable object of explicitly granted async JSON handlers. `text(value)` appends JSON output. Undefined values/results normalize to null. JSON.stringify semantics apply (cycles and BigInt fail; undefined properties are omitted; nonfinite numbers become null). The returned union distinguishes script, timeout, aborted, resource-limit and native-transport errors. Host handler errors reject the corresponding script promise; scripts may catch them. Admission/configuration errors reject the API promise.

Top-level `execute`, `cancel`, `close` use one shared facade. Prefer one facade per native module; native close affects every facade. Two active runs total, including advanced channel runs. Script/tool output must be treated as untrusted app data.

## Bounds and lifecycle

| Limit | Default |
| --- | ---: |
| Native monotonic deadline | 10,000 ms |
| QuickJS allocator | 32 MiB |
| QuickJS stack guard | 256 KiB |
| Aggregate outbound JSON | 1 MiB |
| Individual bootstrap/data/message | 1 MiB |
| Pending host requests | 32 |
| Active workers per module | 2 |

Override using `limits: { timeoutMs, memoryBytes, stackBytes, outputBytes, messageBytes, maxHostCalls }`. All values are finite positive safe integers with bounded ranges; see exported `effectiveLimits`. Native validates independently. Byte sizes are UTF-8. Output conservatively includes all emitted/request/final JSON; message bounds cover serialized payloads, excluding the event envelope. Error text is bounded too. QuickJS allocator limits do **not** bound total process RSS or platform event-dispatch overhead.

Cancellation sets an atomic flag rather than queuing behind evaluation. QuickJS's bytecode interrupt and checks between promise jobs/hook passes stop both CPU and `while (true) await null` loops. The deadline runs during host waits. Stop waits for admission and worker join; terminal settles once. Native context/runtime disposal happens on the owning thread before terminal delivery. Expo module destruction closes workers; no background-execution guarantee beyond the OS lifecycle.

Serialization, regular expressions, large built-in operations and platform event delivery may delay interrupt polling. A host handler must honor its AbortSignal; cancellation cannot undo external effects or forcibly terminate app code. Don't give untrusted scripts unrestricted tool capabilities. This is an **in-process capability boundary**, not OS isolation or a defense against native engine vulnerabilities.

## Advanced deterministic integrations

[start / deliver / stop channel](docs/native-channel.md) supports configurable bootstrap/prelude code and exact JSON envelopes. `expo-quickjs/core` exports the dependency-free facade, transport types, effective limits, native build identity and engine/channel revision. The main entry binds Expo's native module. Bootstrap must capture/delete primitives and defer user script until native has captured/hidden receive/drain functions. Advanced integrations own deterministic UTC time/randomness, ordered-result application and fingerprints; none are implicit in generic execute. Pi 1.3.0 support lives in the separate `pi-codemode-expo` repository.

## Develop and verify

```sh
npm ci --legacy-peer-deps
cmake -S . -B build
cmake --build build -j 4
ctest --test-dir build --output-on-failure
npm test
npm run build
npm pack
```

`npm test` runs facade transport tests and actual native QuickJS subprocess tests through `build/channel_runner`. CTest has an external 20-second watchdog; integration children have external kill watchdogs. `cmake -S . -B build-asan -DQUICKJS_SANITIZE=ON` enables ASan/UBSan when supported. No QuickJS downloads occur at install/build. [Engine provenance and checksum](vendor/PROVENANCE.md); [upstream MIT license](vendor/quickjs-2025-09-13/LICENSE).

## Packed Expo example

From repository root, run `npm pack`, then `cd example && npm install --legacy-peer-deps`. The example consumes the tarball, not sibling source. `npx expo run:ios` / `npx expo run:android` generates/builds native projects. Hermes remains enabled in app.json. An automatic native self-test runs at mount. Controls cover calculation, delayed controlled host tool, CPU/microtask loops, output limits and cancellation. The 100ms UI tick counter lets you check responsiveness. Reload while a run is active to exercise module teardown. No model credentials or paid requests are needed.
