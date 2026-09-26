---
name: Doctor routing integrity
description: Constraints that keep patient consultations assigned to real Doctor accounts rather than unlinked or Technician records.
---

Doctor auth accounts and the operational doctor directory are separate records. Automatic consultation routing must provision or repair the directory link, filter candidates to active users whose auth role is Doctor, and persist assignment notifications with that Doctor user ID.

**Why:** Accounts can be created successfully without a directory row; unlinked rows produce pending consultations, and notifications without `userId` do not appear in the intended Doctor's inbox.

**How to apply:** Preserve the auth-to-directory backfill and role filter whenever changing signup, user administration, doctor availability, consultation routing, or clinical notification fan-out.