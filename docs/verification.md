# Verification record (2026-10-20)

This file records evidence, not a promise that untested platforms work.

## Host checks

- Real pinned QuickJS 2025-09-13 compiled with AppleClang 17 / C++17 via CMake/CTest.
- Native tests cover return/Unicode, absent ambient APIs, script errors, CPU/microtask deadlines, cancellation, bounded output/heap/stack/pending calls, unknown/duplicate/stale replies, concurrent stop/close, admission limits, repeated teardown and reaping completed callbacks.
- TypeScript facade tests include controlled transport admission, host errors/cyclic JSON, pre-aborted and admission-race cancellation, late results and concurrent close. Integration tests use actual native `channel_runner` subprocesses with external kill watchdogs for async/concurrent calls, bridge hiding, stalled promises, return/error separation and both loop types.
- UBSan full native suite passed. ASan+UBSan binary timed out before main; a minimal `int main(){return 0;}` built with AppleClang ASan also timed out with/without detect_leaks=0. ASan is **unverified on this host**, not a clean sanitizer claim. Linux CI includes ASan+UBSan. ThreadSanitizer minimal empty C program exits with signal 11 on this host; TSan library suite is unverified.
- TypeScript declaration build passes. Package includes C/C++/Swift/Kotlin/JNI source, headers, licenses, protocol docs and full pinned engine, no build-time engine fetching.

## Mobile / packed consumer

- npm packed `expo-quickjs-0.1.0.tgz` installed into a clean example (Expo 58.0.16, ExpoModulesCore 58.0.23, React 19.3.0, React Native 0.88.0).
- Expo iOS prebuild, CocoaPods autolinking and Xcode iOS-simulator Debug build passed, including actual ObjC++/Swift/C++/vendored C module compilation. Hermes remains enabled.
- iOS 26.2 arm64 simulator (iPhone 17 Pro) actual Hermes/native self-test passed: calculation, delayed Unicode tool reply, JS-timer responsiveness and atomic cancellation for CPU and microtask loops, output limit, ten sequential create/dispose cycles. Native module registration was verified at runtime after adding explicit root podspecPath.
- Optional freshly packed Pi adapter fixture also passed on this simulator: Unicode output + delayed tool + store/load; deterministic start with Date.now=1000, performance.now=0, boxed local Date parsed as UTC and WeakRef absent. It initially exposed Hermes Function.toString returning [bytecode]; the adapter session fixed this by freezing canonical source at package build. Generic example restored afterward; no Pi dependency added to core.
- Both npm artifact source builds and available Expo module autolinking checks passed. Simulator screenshots are preserved in [core evidence](evidence/ios-core-selftest.png) and [adapter smoke evidence](evidence/ios-adapter-smoke.png). Temporary adapter fixture stays an ignored build artifact.
- Android SDK/NDK absent (`~/Library/Android/sdk` missing). Kotlin/JNI/Gradle source exists; Android native build and device/emulator behavior are **unverified**.
- No physical devices exercised. Simulator fresh launches and full JS reloads were exercised. Background behavior and reload during an actively executing run remain unverified; test them on each target OS/device before production use.
- Clean example npm install reported 21 inherited dependency advisories (7 moderate, 14 high); the root development-only dependency install reported none. No forced framework upgrades applied.

## Independent adapter checks

The separate adapter session reported real native Pi 1.3.0 protocol/prelude and Harness+SQLite restart/replay tests passing, including committed nested-result reuse, safe/unsafe effect policy, success-only stores and fingerprint divergence blocking new host effects. Those results belong to the adapter repository; generic core does not embed Pi or claim exactly-once external effects.

## Boundary

Native QuickJS runtimes isolate JS globals and expose only explicit JSON capabilities. They share the application process. Allocator limits exclude host/platform allocations, serialization and event envelopes. Cancellation interrupts JS and signals host handlers; it cannot roll back side effects or kill arbitrary app handlers. QuickJS built-ins may delay polling. No native-engine exploit isolation, OS sandbox, background-running or production-hardening guarantee is claimed.

## Final artifact/checks

- Final source facade/real-engine integration suite: 17/17 passed. Native CTest passed against repository source and extracted npm artifact; UBSan CTest passed after lifecycle fixes.
- Final core tarball: `expo-quickjs-0.1.0.tgz`; SHA-256 `893dccb91465752a45c70b45cc4e21fa16b41648143a7f4183bd34c10940651c`. No publication or remote repository created.
- Fresh review identified retained completed executions and concurrent-close barriers; fixes were reproduced with failing tests before implementation and are now covered natively and in the facade.
