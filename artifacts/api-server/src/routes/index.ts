import { Router, type IRouter } from "express";
import healthRouter from "./health";
import flowbuilderRouter from "./flowbuilder";

const router: IRouter = Router();

router.use(healthRouter);
router.use(flowbuilderRouter);

export default router;
