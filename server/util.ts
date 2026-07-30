import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodTypeAny, type output } from "zod";

/** An error with an intended status code. Anything else becomes a 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} wasn't found.`);

/**
 * A 422 that carries per-field messages. The client joins `fields[].message`
 * for display, so these strings are written to be read by a person.
 */
export class ValidationError extends HttpError {
  readonly fields: Array<{ path: string; message: string }>;

  constructor(error: ZodError) {
    super(422, "Some fields need another look.");
    /* Messages are written as standalone sentences: the client joins them
       into one line, so a "field.path:" prefix would only add noise. */
    this.fields = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  }
}

/** Note the `output` inference — schema defaults are applied in the result. */
export function parse<S extends ZodTypeAny>(schema: S, value: unknown): output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error);
  return result.data;
}

/** Wraps an async handler so a rejection reaches the error middleware. */
export function route(
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

/** Route params are typed loosely enough to arrive as an array; treat that as bad input. */
export function intParam(raw: string | string[] | undefined, what = "id"): number {
  if (typeof raw !== "string") throw new HttpError(400, `Invalid ${what}.`);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${what}.`);
  return n;
}

/* ---- money -------------------------------------------------------- */

/** numeric columns arrive as strings; the client works in numbers. */
export const num = (value: string | number | null | undefined): number =>
  value == null ? 0 : Number(value);

/** Round to cents, so summing a column never drifts. */
export const cents = (n: number): number => Math.round(n * 100) / 100;

/** Numbers go back into a numeric column as fixed-scale strings. */
export const money = (n: number): string => cents(n).toFixed(2);

/* ---- months ------------------------------------------------------- */

/** Inclusive first and last day of a "YYYY-MM", for date-range filters. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

/* ---- error middleware --------------------------------------------- */

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) return next(err);

  if (err instanceof ValidationError) {
    return res.status(err.status).json({ error: err.message, fields: err.fields });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    const wrapped = new ValidationError(err);
    return res.status(wrapped.status).json({ error: wrapped.message, fields: wrapped.fields });
  }

  console.error(err);
  return res.status(500).json({ error: "Something went wrong on the server." });
}
