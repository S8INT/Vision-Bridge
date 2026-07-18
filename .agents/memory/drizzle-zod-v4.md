---
name: drizzle-zod requires zod/v4 imports
description: Type errors when mixing drizzle-zod schemas with plain "zod" imports
---

**Rule:** In packages using drizzle-zod 0.8+, import `z` from `"zod/v4"` (not `"zod"`) in any file that runs `z.infer` on a `createInsertSchema(...)` result.

**Why:** drizzle-zod 0.8 builds its schemas against zod v4 types (e.g. ZodUUID). With zod 3.25.x, the plain `"zod"` entry point is still v3, so `z.infer<typeof insertSchema>` fails TS2344 ("missing _type, _parse, …"). This also silently breaks `tsc -b` builds of project references, which surfaces downstream as TS6305 "output file has not been built" errors in consumers.

**How to apply:** If a workspace package's typecheck shows TS6305 for lib/db or similar, build the reference directly (`tsc -b lib/db`) to see the real error — it's often this zod v3/v4 mismatch.
