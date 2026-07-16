---
name: Expo dev environment quirks
description: Non-obvious Expo CLI, Metro, and expo-file-system behaviors in this workspace
---

## Expo CLI login prompt blocks Metro — use EXPO_OFFLINE=1, not CI=1
- `expo start` blocks on an interactive "Log in / Proceed anonymously" prompt. `--non-interactive` is ignored. `CI=1` avoids the startup prompt BUT breaks Expo Go: when a device requests the manifest, the CLI throws "CommandError: Input is required, but 'npx expo' is in non-interactive mode" and the device can't load the app. `CI=1` also disables Metro file watching/hot reload.
- **Fix:** prefix the dev script with `EXPO_OFFLINE=1` instead — skips all Expo account/signing checks, serves the manifest fine, and keeps watch mode/hot reload.
- **How to verify:** `curl -H "expo-platform: ios" http://localhost:<port>/` should return HTTP 200 with a multipart manifest.

## expo-file-system v19 legacy API
- In expo-file-system ≥19, the old API lives at `expo-file-system/legacy`; the main export is the new class-based API. Legacy `getInfoAsync` no longer accepts `{ size: true }` (InfoOptions only has `md5`); `size` is always included in the returned FileInfo.

## tsconfig.base.json must stay esnext/bundler
- Root `tsconfig.base.json` must keep `module: esnext`, `moduleResolution: bundler`, `types: []`. Switching to NodeNext breaks lib/api-client-react, lib/api-zod, lib/db, and api-server. The Expo app extends `expo/tsconfig.base` instead, so it's unaffected.
- **Why:** A past Vercel-deployment attempt changed these and broke the whole workspace.

## Verifying native bundles without a device
- To confirm the iOS bundle compiles, curl Metro directly: `http://localhost:24514/node_modules/.pnpm/expo-router@<ver>_<hash>/node_modules/expo-router/entry.bundle?platform=ios&dev=true` (find the exact pnpm path from the "Web Bundled" log line). First cold build takes 2–3 min — run curl with a long max-time.
