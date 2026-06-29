import axios from "axios";
import { signRequest, BASE_URL } from "./signRequest";
import { decrypt } from "./crypto";
import { db, accountsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { logger } from "./logger";

export interface OrderPayload {
  symbol: string;
  side: "BUY" | "SELL";
  order_type: "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
  quantity: number;
  price?: number;
  trigger_price?: number;
  reduce_only?: boolean;
  time_in_force?: "GTC" | "IOC" | "FOK";
  client_order_id?: string;
}

export interface AccountResult {
  accountId: number;
  accountName: string;
  success: boolean;
  orderId?: string;
  status?: string;
  error?: string;
}

export async function getAccountsByIds(accountIds: number[]) {
  return db
    .select()
    .from(accountsTable)
    .where(inArray(accountsTable.id, accountIds));
}

export async function placeOrderForAccount(
  account: { id: number; name: string; apiKey: string; secretKey: string },
  payload: OrderPayload,
): Promise<{ order_id: string; status: string }> {
  const apiKey = decrypt(account.apiKey);
  const secretKey = decrypt(account.secretKey);

  const isTpSl =
    payload.order_type === "TAKE_PROFIT_MARKET" ||
    payload.order_type === "STOP_MARKET";

  const body: Record<string, unknown> = {
    exchange: "EXCHANGE_2",
    symbol: payload.symbol.toUpperCase(),
    side: payload.side,
    order_type: payload.order_type,
    // TP/SL orders must have quantity=0; regular orders use the supplied quantity
    quantity: isTpSl ? 0 : payload.quantity,
  };

  if (payload.order_type === "LIMIT" && payload.price != null) {
    body.price = payload.price;


    body.time_in_force = payload.time_in_force ?? "GTC";
  }
  if (isTpSl) {
    // trigger_price is mandatory for TP/SL orders
    if (payload.trigger_price == null) {
      throw new Error(
        `trigger_price is required for ${payload.order_type} orders`,
      );
    }
    body.trigger_price = payload.trigger_price;
    body.reduce_only = true; // always required for TP/SL
  } else {
    if (payload.reduce_only != null) body.reduce_only = payload.reduce_only;
  }
  if (payload.order_type !== "LIMIT" && payload.time_in_force) {
    body.time_in_force = payload.time_in_force;
  }
  if (payload.client_order_id) body.client_order_id = payload.client_order_id;

  const { headers, path } = signRequest(
    "POST",
    "/trade/api/v2/futures/order",
    {},
    apiKey,
    secretKey,
  );
  try {
    const response = await axios.post(`${BASE_URL}${path}`, body, { headers });
    return response.data.data;
  } catch (err: unknown) {
    // Re-throw with the CoinSwitch response body included so callers can surface it
    if (axios.isAxiosError(err) && err.response) {
      const csBody = JSON.stringify(err.response.data);
      throw new Error(
        `CoinSwitch ${err.response.status}: ${csBody}`,
      );
    }
    throw err;
  }
}

export async function executeOnAllAccounts(
  accountIds: number[],
  payload: OrderPayload,
  firedVia: "MANUAL" | "WEBHOOK" = "MANUAL",
): Promise<AccountResult[]> {
  const accounts = await getAccountsByIds(accountIds);
  const BATCH_SIZE = 18;
  const DELAY_MS = 3100;

  const results: AccountResult[] = [];

  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((acc) => placeOrderForAccount(acc, payload)),
    );

    for (let j = 0; j < batch.length; j++) {
      const acc = batch[j];
      const result = batchResults[j];
      if (result.status === "fulfilled") {
        results.push({
          accountId: acc.id,
          accountName: acc.name,
          success: true,
          orderId: result.value.order_id,
          status: result.value.status,
        });
      } else {
        logger.error(
          { error: result.reason, accountId: acc.id },
          "Order failed for account",
        );
        results.push({
          accountId: acc.id,
          accountName: acc.name,
          success: false,
          error: result.reason?.message || "Unknown error",
        });
      }
    }

    if (i + BATCH_SIZE < accounts.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  return results;
}

export async function callCoinswitch(
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  apiKey: string,
  secretKey: string,
  paramsOrBody: object = {},
): Promise<unknown> {
  const { headers, path } = signRequest(
    method,
    endpoint,
    method === "GET" ? paramsOrBody : {},
    apiKey,
    secretKey,
  );

  if (method === "GET") {
    const response = await axios.get(`${BASE_URL}${path}`, { headers });
    return response.data;
  } else if (method === "DELETE") {
    const response = await axios.delete(`${BASE_URL}${path}`, {
      headers,
      data: paramsOrBody,
    });
    return response.data;
  } else {
    const response = await axios.post(`${BASE_URL}${path}`, paramsOrBody, {
      headers,
    });
    return response.data;
  }
}
