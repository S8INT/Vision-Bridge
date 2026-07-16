---
name: Expo dev environment quirks
description: Non-obvious Expo CLI, Metro, and expo-file-system behaviors in this workspace
---

## Expo CLI login prompt blocks Metro
- `expo start` blocks on an interactive "Log in / Proceed anonymously" prompt when run in a workflow. `--non-interactive` is ignored (CLI warns it's unsupported). The working fix is prefixing the dev script with `CI=1`.
- **Why:** Without it, Metro never starts and Expo Go can't connect.
- **How to apply:** Trade-off — CI mode disables Metro file watching/hot reload, so the `artifacts/visionbridge: expo` workflow must be restarted after any code change for the change to be served.

## expo-file-system v19 legacy API
- In expo-file-system ≥19, the old API lives at `expo-file-system/legacy`; the main export is the new class-based API. Legacy `getInfoAsync` no longer accepts `{ size: true }` (InfoOptions only has `md5`); `size` is always included in the returned FileInfo.

## tsconfig.base.json must stay esnext/bundler
- Root `tsconfig.base.json` must keep `module: esnext`, `moduleResolution: bundler`, `types: []`. Switching to NodeNext breaks lib/api-client-react, lib/api-zod, lib/db, and api-server. The Expo app extends `expo/tsconfig.base` instead, so it's unaffected.
- **Why:** A past Vercel-deployment attempt changed these and broke the whole workspace.

## Verifying native bundles without a device
- To confirm the iOS bundle compiles, curl Metro directly: `http://localhost:24514/node_modules/.pnpm/expo-router@<ver>_<hash>/node_modules/expo-router/entry.bundle?platform=ios&dev=true` (find the exact pnpm path from the "Web Bundled" log line). First cold build takes 2–3 min — run curl with a long max-time.
