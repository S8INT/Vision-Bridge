import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imagingRouter from "./imaging.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/imaging", imagingRouter);

export default router;
