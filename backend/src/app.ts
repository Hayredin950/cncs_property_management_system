import { categoriesRouter } from "./routes/categories.js";
import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import morgan from "morgan";
import authRouter from "./routes/auth.js";
import { tagsRouter } from "./routes/tags.js";

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/items", tagsRouter);
app.use("/categories", categoriesRouter);

export default app;

