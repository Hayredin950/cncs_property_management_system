import { categoriesRouter } from "./routes/categories.js";
import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import morgan from "morgan";
import authRouter from "./routes/auth.js";
import { tagsRouter } from "./routes/tags.js";
import { itemsRouter } from "./routes/items.js"; // <-- Import your items router

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/categories", categoriesRouter);

// Mount tag-specific routes first, then the general items router
app.use("/items", tagsRouter);
app.use("/items", itemsRouter);

export default app;