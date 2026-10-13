import { Router, type IRouter } from "express";
import healthRouter from "./health";
import flowbuilderRouter from "./flowbuilder";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(flowbuilderRouter);

export default router;
