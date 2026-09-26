---
name: Imaging connectivity probe
description: The mobile imaging upload connectivity check must target the API server's mounted health endpoint.
---

The imaging client must use the API server's actual `/api/healthz` endpoint when deciding whether an image can upload. Treating a non-OK health response as offline silently moves valid online captures into the local upload queue.

**Why:** The API exposes `/api/healthz`, while a probe to `/api/health` returns 404; native upload code interprets that non-OK response as offline.

**How to apply:** When changing the API health route or mobile upload probe, verify both the route mount and a live HTTP response before relying on the result for offline queuing.