import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import morgan from "morgan";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { accessoriesRouter } from "./routes/accessories.js";
import { auditsRouter } from "./routes/audits.js";
import authRouter from "./routes/auth.js";
import { categoriesRouter } from "./routes/categories.js";
import { departmentsRouter } from "./routes/departments.js";
import { itemHistoryRouter } from "./routes/itemHistory.js";
import { itemsRouter } from "./routes/items.js";
import { notificationsRouter } from "./routes/notifications.js";
import { reportsRouter } from "./routes/reports.js";
import { requestsRouter } from "./routes/requests.js";
import { uploadsRouter } from "./routes/uploads.js";
import { usersRouter } from "./routes/users.js";
import { tagsRouter } from "./routes/tags.js";

const app: Application = express();

/**
 * CORS allowlist.
 *
 * `CORS_ORIGINS` is a comma-separated list of the browsable frontend origins
 * (e.g. `https://cncs-pms.vercel.app,https://cncs.aau.edu.et`).
 *
 * **Unset means "allow every origin" in development** — so local dev (5173/5174,
 * whatever port Vite lands on), the docker compose stack and the test suite need
 * no configuration and nothing about them changes.
 *
 * **Unset in production is denied.** A deployment that forgot the variable used
 * to allow every origin, which is the one configuration mistake this setting
 * exists to prevent. Instead of failing open it now fails closed — no CORS
 * headers, so browsers block cross-origin calls — and says so once at startup
 * with the fix. Same-origin and server-to-server calls are unaffected.
 *
 * Note what this does and does not buy: the browser is the enforcer, so this stops
 * other sites from calling the API with a signed-in user's token. It does not make
 * the API private — `authenticate` does that.
 */
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (IS_PRODUCTION && CORS_ORIGINS.length === 0) {
  console.warn(
    "[cors] CORS_ORIGINS is unset in production. Cross-origin browser requests " +
      "will be blocked. Set CORS_ORIGINS to a comma-separated list of the " +
      "frontend origin(s), e.g. https://cncs.example.edu.et",
  );
}

app.use(
  CORS_ORIGINS.length > 0
    ? cors({
        origin(origin, callback) {
          // No `Origin` header at all means a same-origin fetch, curl, or a
          // server-to-server call. There is no browser cross-origin decision to
          // make, so there is nothing to allow or deny.
          if (!origin || CORS_ORIGINS.includes(origin)) {
            callback(null, true);
            return;
          }
          // Deny by omitting the headers rather than by throwing: a throw would
          // surface through `errorHandler` as a 500, which reads as "the server is
          // broken" for what is a deliberate policy decision.
          callback(null, false);
        },
      })
    : IS_PRODUCTION
      ? // Fail closed: no allow-all in production just because the env is unset.
        cors({ origin: false })
      : cors(),
);
app.use(express.json());
app.use(morgan("dev"));

app.get(["/api/v1/health", "/health"], (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

/**
 * Every router is mounted twice: under `/api/v1` (the SDS path) and under its bare
 * path, which is what Phase 1 shipped and what its tests still call. Keeping both
 * means the frontend can move to the versioned prefix without a flag day.
 *
 * One mount per line, sorted by mount path: a later phase adds exactly one line
 * here, so git resolves the conflict mechanically instead of by hand.
 *
 * `itemsRouter` is mounted LAST of the four `/items` routers on purpose. Its
 * `GET /:tagId` is a single-segment pattern, so it cannot swallow the two-segment
 * paths the other three own (`/:id/tag`, `/:id/history`, `/:id/accessories`) —
 * Express 5 matches on the complete path. But if anyone later adds a bare
 * `GET /items/:id`, mounting order is the only thing that decides the winner, and
 * last-place means the specific routes keep working.
 */
app.use(["/api/v1/audits", "/audits"], auditsRouter);
app.use(["/api/v1/auth", "/auth"], authRouter);
app.use(["/api/v1/categories", "/categories"], categoriesRouter);
app.use(["/api/v1/departments", "/departments"], departmentsRouter);
app.use(["/api/v1/items", "/items"], accessoriesRouter);
app.use(["/api/v1/items", "/items"], itemHistoryRouter);
app.use(["/api/v1/items", "/items"], tagsRouter);
app.use(["/api/v1/items", "/items"], itemsRouter);
app.use(["/api/v1/notifications", "/notifications"], notificationsRouter);
app.use(["/api/v1/reports", "/reports"], reportsRouter);
app.use(["/api/v1/requests", "/requests"], requestsRouter);
app.use(["/api/v1/uploads", "/uploads"], uploadsRouter);
app.use(["/api/v1/users", "/users"], usersRouter);

/**
 * Both must come last, and in this order. `notFoundHandler` is a plain `use()`
 * with no path — Express 5 removed the `"*"` string pattern and `app.all("*")`
 * now throws at startup. `errorHandler` is last because Express picks error
 * handlers by arity (4 parameters) and only consults those registered after the
 * middleware that threw.
 */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
