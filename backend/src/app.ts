import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import morgan from "morgan";

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

export default app;
