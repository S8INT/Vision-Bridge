/**
 * Centralized error handling for the API.
 *
 * Express 5 forwards rejected promises from async route handlers to the
 * error-handling middleware automatically. Without a handler registered, those
 * errors fall through to Express's default finalhandler, which returns an HTML
 * 500 page (wrong content type for a JSON API) and leaks stack traces. This
 * module provides:
 *   - `notFoundHandler`: a JSON 404 for unmatched routes.
 *   - `errorHandler`: a JSON error responder that maps well-known error types
 *     to appropriate status codes, logs the failure, and never leaks internal
 *     details for unexpected 5xx errors in production.
 */

import type { Request, Response, NextFunction } from "express";
import { MulterError } from "multer";
import { logger } from "../lib/logger.js";

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  expose?: boolean;
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

function statusForError(err: HttpError): number {
  if (err instanceof MulterError) {
    return err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
  }
  const status = err.status ?? err.statusCode;
  if (typeof status === "number" && status >= 400 && status <= 599) {
    return status;
  }
  return 500;
}

export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Delegate to Express if headers are already sent — the response is in flight
  // and we can only let Express abort the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = statusForError(err);
  const log = req.log ?? logger;

  if (status >= 500) {
    log.error({ err, method: req.method, url: req.path }, "Unhandled request error");
  } else {
    log.warn({ err: err.message, status, method: req.method, url: req.path }, "Request rejected");
  }

  // For 5xx errors, hide the underlying message in production to avoid leaking
  // internals; client (4xx) errors carry a safe, actionable message.
  const isProduction = process.env["NODE_ENV"] === "production";
  const message =
    status >= 500 && isProduction
      ? "Internal server error"
      : err.message || "Internal server error";

  res.status(status).json({ error: message });
}
