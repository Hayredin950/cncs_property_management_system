import { Router, type NextFunction, type Request, type Response } from "express";

export const departmentsRouter: Router = Router();

/**
 * The CNCS department vocabulary.
 *
 * Closes gap G9: `Item.department` is a free-text column and there was no
 * endpoint to enumerate it, so the only source of department names was the
 * departments that happened to appear on `GET /items` — which is empty on a
 * fresh register and drifts with typos. This is the fixed list the college
 * files property under, exposed so every client picks from the same set.
 *
 * Public on purpose: the register, the audit scope and the item form are all
 * reachable by (or on behalf of) staff who may be anonymous on the read side,
 * and department names are not sensitive. It stays a read; writing a department
 * is still part of `Item`.
 */
export const CNCS_DEPARTMENTS = [
  "Biology",
  "Chemistry",
  "Physics",
  "Mathematics",
  "Statistics",
  "Earth Science (Geology)",
  "Computer Science",
  "Information Science (INSY)",
] as const;

departmentsRouter.get(
  "/",
  (_req: Request, res: Response, _next: NextFunction): void => {
    // `{ value, label }` rather than a bare string array: it is the shape every
    // picker in the app already consumes, so a client can render it directly.
    res.status(200).json(
      CNCS_DEPARTMENTS.map((name) => ({ value: name, label: name })),
    );
  },
);
