import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isDbAvailable } from "../lib/authStore.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({
    status: "ok",
    database: isDbAvailable() ? "connected" : "mock",
  });
  res.json(data);
});

export default router;
