---
name: Role-scoped clinical data
description: The security boundary between patient self-service consultation views and staff consultation queues
---

Patient consultation UX must be protected at three layers: the navigation resolver, the screen/deep-link guard, and the API response scope. Patient accounts should receive only their linked patient record and care records from clinical bootstrap; staff queue endpoints should be restricted to roles with queue permission.

**Why:** Hiding a tab alone still leaves unrelated consultation data in shared client state and allows stale tabs or deep links to render the staff workspace.

**How to apply:** Whenever a new clinical destination or query is added, define the permitted roles, scope the server response by authenticated user or assigned care team, and add a matching client route guard.