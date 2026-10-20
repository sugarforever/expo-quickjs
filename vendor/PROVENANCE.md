# Vendored QuickJS

- Upstream: https://bellard.org/quickjs/
- Official release archive: https://bellard.org/quickjs/quickjs-2025-09-13.tar.xz
- Version: 2025-09-13
- Archive SHA-256: `6f1f322aea3bb3a90858db85c9fe717013fde4df7dfcafe2f57e78f5bb4b4a0c`
- Retrieved 2026-10-20. Full unmodified extracted release in `quickjs-2025-09-13/`.
- License: MIT; upstream copyright and full terms in `quickjs-2025-09-13/LICENSE`.
- Original archive retained in Git (not included in npm tarball).
- Build only quickjs.c, dtoa.c, libregexp.c, libunicode.c, cutils.c. Never link quickjs-libc.c: no std/os module loader or device APIs.

To verify: `shasum -a 256 vendor/quickjs-2025-09-13.tar.xz`. To update, deliberately select an official release, download to a new versioned filename, record/review SHA-256, extract, update all build paths and engine/fingerprint constants, rerun native/sanitizer/adapter/mobile suites, and retain upstream license. No download occurs during installation or native builds.

Do not add this directory to C++ `-I`: on case-insensitive macOS, upstream VERSION shadows the standard `<version>` header. Include quickjs.h by relative path; C source includes its local headers naturally.
