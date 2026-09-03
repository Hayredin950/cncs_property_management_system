import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import morgan from "morgan";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import authRouter from "./routes/auth.js";
import { requestsRouter } from "./routes/requests.js";
import { tagsRouter } from "./routes/tags.js";

const app: Application = express();

app.use(cors());
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
 * One mount per line, sorted by mount path: each Phase 2 slice adds exactly one
 * line here, so git resolves the conflict mechanically instead of by hand.
 */
app.use(["/api/v1/auth", "/auth"], authRouter);
app.use(["/api/v1/items", "/items"], tagsRouter);
app.use(["/api/v1/requests", "/requests"], requestsRouter);

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
