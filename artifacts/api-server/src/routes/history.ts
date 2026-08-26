// src/routes/history.ts
import { Router, type IRouter } from "express";
import { queryHistory, getHistorySymbols } from "../lib/history.js";
import { authMiddleware } from "../lib/auth.js";

const router: IRouter = Router();

router.use(authMiddleware);

/**
 * GET /api/history
 * Same query params as the user panel's endpoint, but with no implicit
 * account scoping — admin can omit accountId to see history across every
 * account, or pass one to drill into a single user.
 */
router.get("/", async (req, res) => {
  try {
    const q = req.query;
    const result = await queryHistory({
      accountId: q.accountId ? Number(q.accountId) : undefined,
      symbol: typeof q.symbol === "string" ? q.symbol : undefined,
      side: q.side === "BUY" || q.side === "SELL" ? q.side : undefined,
      eventType: typeof q.eventType === "string" ? (q.eventType as any) : undefined,
      batchId: typeof q.batchId === "string" ? q.batchId : undefined,
      slotId: typeof q.slotId === "string" ? q.slotId : undefined,
      dateFrom: typeof q.dateFrom === "string" ? q.dateFrom : undefined,
      dateTo: typeof q.dateTo === "string" ? q.dateTo : undefined,
      minQty: q.minQty ? Number(q.minQty) : undefined,
      maxQty: q.maxQty ? Number(q.maxQty) : undefined,
      minRepunchCount: q.minRepunchCount ? Number(q.minRepunchCount) : undefined,
      maxRepunchCount: q.maxRepunchCount ? Number(q.maxRepunchCount) : undefined,
      search: typeof q.search === "string" ? q.search : undefined,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      sortBy: typeof q.sortBy === "string" ? (q.sortBy as any) : undefined,
      sortDir: q.sortDir === "asc" || q.sortDir === "desc" ? q.sortDir : undefined,
    });
    res.json(result);
  } catch (err: any) {
    console.error("[admin/history] query failed", err);
    res.status(500).json({ message: "Failed to fetch history", error: err.message });
  }
});

/**
 * GET /api/history/symbols
 * Distinct symbols seen in history — used to populate the symbol filter.
 * Pass ?accountId= to scope to one account, or omit for all.
 */
router.get("/symbols", async (req, res) => {
  try {
    const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;
    const symbols = await getHistorySymbols(accountId);
    res.json({ symbols });
  } catch (err: any) {
    console.error("[admin/history] symbols query failed", err);
    res.status(500).json({ message: "Failed to fetch symbols", error: err.message });
  }
});

export default router;