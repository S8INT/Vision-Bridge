import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imagingRouter from "./imaging.js";
import analyticsRouter from "./analytics.js";
import authRouter from "./auth.js";
import patientsRouter from "./patients.js";
import clinicalRouter from "./clinical.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/patients", patientsRouter);
router.use("/clinical", clinicalRouter);
router.use("/imaging", imagingRouter);
router.use("/analytics", analyticsRouter);

export default router;
