import type { ErrorRequestHandler } from "express";
import { logger } from "../lib/logger.js";

/**
 * Last handler in the chain: turns anything thrown out of a route into JSON.
 *
 * Express 5 forwards a rejected route promise here automatically, so without
 * this the default handler answered with an HTML error page — which the
 * client's `JSON.parse` then choked on, replacing a real message ("Invalid
 * id") with a parse error. It also printed a stack trace into the response
 * body whenever NODE_ENV was not "production".
 *
 * Helpers like `parseId` throw with a `status` attached; anything without one
 * is a genuine fault and is logged and reported as a 500.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = Number((err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode);
  const known = Number.isInteger(status) && status >= 400 && status <= 599;

  if (!known) logger.error({ err }, "Unhandled route error");

  res.status(known ? status : 500).json({
    error: known && err instanceof Error ? err.message : "Internal server error",
  });
};
