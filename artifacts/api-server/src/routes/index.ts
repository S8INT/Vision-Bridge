import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imagingRouter from "./imaging.js";
import analyticsRouter from "./analytics.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/imaging", imagingRouter);
router.use("/analytics", analyticsRouter);

export default router;
