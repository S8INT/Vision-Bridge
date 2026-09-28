---
name: Consultation care-plan persistence
description: Cross-layer constraints for saving specialist diagnosis, treatment, and follow-up data.
---

Mobile consultation updates send ISO date strings, but Drizzle PostgreSQL timestamp columns require `Date` instances. The API must parse and validate consultation PATCH fields at its boundary, and the client must await the response before showing a success state.

**Why:** A single uncoerced follow-up date caused the entire diagnosis/treatment update to fail with `value.toISOString is not a function`, while the client swallowed the 400 and told the clinician the care plan was saved.

**How to apply:** Keep date coercion and explicit update validation in the consultation route. Keep care-plan forms wired to the returned consultation row and show an error when persistence fails; keep diagnosis/treatment aliases synchronized where different views consume them. Any patient-facing list fetched outside shared app state must refresh when the screen regains focus, or another user’s completed review can remain hidden until a full reload.