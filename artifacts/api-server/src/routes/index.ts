import { Router, type IRouter } from "express";
import authRouter from "./auth";
import accountsRouter from "./accounts";
import tradeRouter from "./trade";
import positionsRouter from "./positions";
import ordersRouter from "./orders";
import pnlRouter from "./pnl";
import tpslRouter from "./tpsl";
import leverageRouter from "./leverage";
import marginRouter from "./margin";
import balancesRouter from "./balances";
import marketRouter from "./market";
import webhooksRouter from "./webhooks";
import logsRouter from "./logs";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(accountsRouter);
router.use(tradeRouter);
router.use(positionsRouter);
router.use(ordersRouter);
router.use(pnlRouter);
router.use(tpslRouter);
router.use(leverageRouter);
router.use(marginRouter);
router.use(balancesRouter);
router.use(marketRouter);
router.use(webhooksRouter);
router.use(logsRouter);
router.use(dashboardRouter);
router.use(settingsRouter);

export default router;
