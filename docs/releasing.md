# Releasing expo-quickjs

## First publication (0.1.0)

Authenticate with `npm login`, completing the npm security-key/passkey challenge in Chrome. Then publish the prepared artifact from the repository root:

```sh
npm whoami
npm publish ./expo-quickjs-0.1.0.tgz --access public
npm view expo-quickjs@0.1.0 version
```

The tarball has already passed native, TypeScript and extracted-package checks. Local publication does not request GitHub provenance; subsequent Actions publications do. An already-published version is immutable and cannot be overwritten.

After this first publish, configure the package's npm **Trusted Publisher**:

- Provider: GitHub Actions
- Organization/user: `sugarforever`
- Repository: `expo-quickjs`
- Workflow filename: `release.yml`
- Environment: leave blank (the workflow has none)
- Allow direct `npm publish`

See https://docs.npmjs.com/trusted-publishers/. The workflow already grants `id-token: write` and uses Node 24. No NPM_TOKEN is needed with trusted publishing. The optional secret is only a bootstrap/fallback path.

Publish the prepared GitHub draft release after the npm first publish. The workflow recognizes an existing package version and skips its npm upload, so the manually bootstrapped release is safe to finalize.

The first publication may briefly show a `0.0.0-stage` placeholder while npm processes it. Wait until the exact version is available from the registry before declaring the release complete.

The trusted publisher was configured on October 20, 2026. npm currently marks it **Pending validation** and requires an actual workflow publication before **October 22, 2026 at 16:00 UTC**. Skipping the already-published 0.1.0 does not validate OIDC. Before the next release, check the connection in npm package Settings; if it expired, recreate it using the values above immediately before publishing. The first subsequent version will verify the complete OIDC publication path.

## Later versions

1. Start from a clean, updated `main`. Bump root package.json and package-lock.json without creating the Git tag yet:

   ```sh
   git pull --ff-only
   npm version patch --no-git-tag-version
   ```

   Use `minor` or `major` when appropriate. Update release notes in `docs/releases/<version>.md`. Record platform validation and known limits honestly. Coordinate adapter peer-version requirements separately.

2. Build and verify the new version, including the packed example:

   ```sh
   npm ci --legacy-peer-deps
   cmake -S . -B build
   cmake --build build -j 4
   ctest --test-dir build --output-on-failure
   npm test
   npm run build
   npm pack --json > build/pack.json
   npm run check:package
   npm --prefix example install --save --legacy-peer-deps ./expo-quickjs-<version>.tgz
   ```

   That example install updates its local tarball dependency and lockfile. Exercise available native platforms for runtime changes. Do not create a release tag before these changes are committed.

3. Commit/push the version, example lockfile and release notes. Wait for `verify` to pass for that exact commit on GitHub. Then create a GitHub release targeting that verified commit:

   ```sh
   RELEASE_VERSION=$(node -p 'require("./package.json").version')
   RELEASE_COMMIT=$(git rev-parse HEAD)
   gh release create "v$RELEASE_VERSION" --target "$RELEASE_COMMIT" \
     --title "expo-quickjs $RELEASE_VERSION" \
     --notes-file "docs/releases/$RELEASE_VERSION.md"
   ```

4. The **Release to npm** workflow repeats verification, checks the tag against package.json and main ancestry, builds/checks a tarball, then publishes that exact artifact with provenance using npm OIDC. Verify the workflow is green and `npm view expo-quickjs@<version> version` returns the expected version.

If publication fails, resolve the cause and retry **Release to npm** through workflow_dispatch with the same existing tag. Registry/network errors fail the run; only a registry 404 permits a new upload. A version already published is skipped. Source changes require a new version rather than overwriting an npm release.
