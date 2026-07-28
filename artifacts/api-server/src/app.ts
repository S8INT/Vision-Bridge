import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: Request) {
        return {
          id: (req as any).id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: Response) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// CORS: restrict to an explicit allowlist (comma-separated origins) via
// CORS_ALLOWED_ORIGINS. When no allowlist is configured we reflect all origins
// in non-production for convenience, but deny cross-origin requests in
// production so PHI endpoints are not exposed to arbitrary web origins.
const allowedOrigins = (process.env["CORS_ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOrigin =
  allowedOrigins.length > 0
    ? allowedOrigins
    : process.env["NODE_ENV"] === "production"
      ? false
      : true;

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
