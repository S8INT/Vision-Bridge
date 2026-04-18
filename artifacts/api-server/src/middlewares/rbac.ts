/**
 * RBAC middleware — enforces role-based permissions on routes.
 * Must be used after requireAuth.
 */

import type { Request, Response, NextFunction } from "express";
import { canAccess, type Resource, type Action } from "../lib/rbac.js";

export function requireRole(
  resource: Resource,
  action: Action,
) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const auth = req.auth;

    if (!auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!canAccess(auth.role, resource, action)) {
      res.status(403).json({
        error: "Forbidden",
        detail: `Role '${auth.role}' is not permitted to '${action}' on '${resource}'`,
      });
      return;
    }

    next();
  };
}
