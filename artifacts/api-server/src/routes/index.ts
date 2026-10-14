import { Router, type IRouter } from "express";
import healthRouter from "./health";
import flowbuilderRouter from "./flowbuilder";
import storageRouter from "./storage";
import referenceTablesRouter from "./reference-tables";
import staffRouter from "./staff";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(referenceTablesRouter);
router.use(staffRouter);
router.use(flowbuilderRouter);

export default router;
