# Implementation ledger

- Ruling: single root package, no packages/ prefix; Pi adapter is another repository as explicitly authorized.
- Ruling: generic primitive channel with adapter-owned pinned prelude, protocol ordering and deterministic clock. Native channel supplies owner-thread transport, drain notifications and resource bounds. Avoids embedding Pi in generic core.
- Native QuickJS pinned 2025-09-13 official archive; SHA256 6f1f322aea3bb3a90858db85c9fe717013fde4df7dfcafe2f57e78f5bb4b4a0c.

- Task 1 native behaviors RED: initial stub calculation failed. Native core then passed real calculations/ambient absence/errors/resource limits/CPU+microtask watchdog/cancel/host replies/repeated teardown.
- Task 2 facade RED: five initial tests failed not-implemented; facade and actual native integration passed after implementation.
- Regression RED/GREEN: return-value envelope collision; admission cancellation race; cyclic/BigInt return serialization; invalid Unicode run IDs; exception byte bound; concurrent facade close; completed-run retention; close vs retiring-worker barrier.
- Review findings fixed: retire and join completed workers off owner; clear large captured state; serialize native admission/reaping with close; share facade close Promise.
- Standalone package, pinned full unmodified engine, native channel contract and Expo bindings implemented. Root podspec requires explicit apple.podspecPath for Expo module registration.
- iOS packed example built and native simulator selftest passed; Android SDK/NDK absent. UBSan passed; ASan hello itself stalls before main, so no clean ASan claim.
