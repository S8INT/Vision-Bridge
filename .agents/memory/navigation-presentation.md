---
name: Navigation presentation
description: Why VisionBridge uses a shared custom tab bar instead of platform-native tab labels
---

The mobile navigation should use one shared custom tab-bar component fed by the centralized permission-aware navigation resolver. Platform-native tab labels can visibly ellipsize on narrow devices even when the underlying route configuration is correct.

**Why:** The previous native tab presentation rendered every label as an ellipsis on the target narrow mobile layout, making the primary destinations ambiguous.

**How to apply:** Keep global navigation limited to four resolved primary destinations plus an optional More slot; use short, complete labels and move secondary/contextual destinations into the resolver-backed More screen.