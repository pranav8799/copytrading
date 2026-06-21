# Copy Trading Admin Panel — Complete Build Prompt
# For: Lovable / Replit / Cursor / v0

---

## What You Are Building

A **Copy Trading Admin Panel** — a full-stack web app where a single admin can fire futures trades simultaneously across multiple user accounts via the CoinSwitch Futures API. Trades can be triggered manually (select accounts → fire) or automatically via webhooks (TradingView alerts, bots).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Tailwind CSS |
| Backend | Node.js + Express.js |
| Database | MySQL |
| ORM | Prisma or raw mysql2 |
| Auth | JWT (admin only, single user) |
| Realtime | Socket.IO (position + order status updates) |
| HTTP Client | axios (backend → CoinSwitch API) |
| Signing | crypto (Node built-in, for CoinSwitch HMAC auth) |

---

## Visual Design

- Theme: Light/professional
- Font: Inter or system-ui
- Colors:
  - Primary: #2563EB (blue)
  - BUY/Long: #16A34A (green)
  - SELL/Short: #DC2626 (red)
  - Background: #F9FAFB
  - Card surface: #FFFFFF
  - Border: #E5E7EB
  - Muted text: #6B7280
- Layout: Fixed left sidebar (240px) + scrollable main content
- Flat, card-based UI — no gradients, minimal shadows

---

## CoinSwitch API — Authentication (CRITICAL)

Every request to CoinSwitch must be signed. Implement this as a shared utility `signRequest.ts` used by all API calls.

```typescript
import crypto from 'crypto';

const BASE_URL = 'https://coinswitch.co'; // replace with actual base if different

function signRequest(
  method: string,       // 'GET', 'POST', 'DELETE'
  endpoint: string,     // e.g. '/trade/api/v2/futures/order'
  params: object = {},  // query params for GET, body for POST/DELETE
  apiKey: string,
  secretKey: string
): { headers: Record<string, string>; path: string } {
  const epoch = Math.floor(Date.now() / 1000).toString();
  const queryString = method === 'GET'
    ? '?' + new URLSearchParams(params as Record<string, string>).toString()
    : '';
  const path = endpoint + queryString;

  const signaturePayload = method + path + epoch;
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(signaturePayload)
    .digest('hex');

  return {
    headers: {
      'Content-Type': 'application/json',
      'X-AUTH-SIGNATURE': signature,
      'X-AUTH-APIKEY': apiKey,
      'X-AUTH-EPOCH': epoch,
    },
    path,
  };
}
```

Use this for EVERY CoinSwitch API call. Each user account has its own apiKey + secretKey stored in the database.

---

## Database Schema (MySQL)

```sql
-- User accounts (each has their own CoinSwitch API keys)
CREATE TABLE accounts (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  api_key      TEXT NOT NULL,        -- AES-256 encrypted
  secret_key   TEXT NOT NULL,        -- AES-256 encrypted
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Every trade fired across accounts
CREATE TABLE trade_logs (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  account_id         INT NOT NULL,
  order_id           VARCHAR(100),   -- CoinSwitch order_id returned
  symbol             VARCHAR(20) NOT NULL,
  side               ENUM('BUY','SELL') NOT NULL,
  order_type         VARCHAR(30) NOT NULL,
  quantity           DECIMAL(20,8),
  price              DECIMAL(20,8),
  trigger_price      DECIMAL(20,8),
  reduce_only        BOOLEAN DEFAULT FALSE,
  status             VARCHAR(30),    -- RAISED, EXECUTED, FAILED, etc.
  error_message      TEXT,
  fired_via          ENUM('MANUAL','WEBHOOK') DEFAULT 'MANUAL',
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Webhook endpoints
CREATE TABLE webhooks (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(100) NOT NULL,
  token            VARCHAR(100) NOT NULL UNIQUE,  -- UUID, secret URL token
  target_accounts  JSON,         -- array of account IDs, e.g. [1,2,3]
  default_symbol   VARCHAR(20),
  default_leverage INT,
  is_active        BOOLEAN DEFAULT TRUE,
  last_triggered   DATETIME,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Webhook execution logs
CREATE TABLE webhook_logs (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  webhook_id     INT NOT NULL,
  payload        JSON,
  accounts_fired INT,
  success_count  INT,
  fail_count     INT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id)
);

-- System/error logs
CREATE TABLE system_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  level      ENUM('info','warn','error') NOT NULL,
  message    TEXT NOT NULL,
  context    JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## API Key Encryption Utility

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!; // 32-byte hex string
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]);
  return decrypted.toString();
}
```

---

## CoinSwitch API — All Endpoints Used

### EXCHANGE IDENTIFIER
All requests use: `"exchange": "EXCHANGE_2"`

---

### 1. PLACE ORDER
**Used for:** Manual trade execution, webhook-triggered trades, setting TP/SL

```
POST https://coinswitch.co/trade/api/v2/futures/order
Rate limit: 20 requests per 60 seconds
```

**Request body:**
```json
{
  "exchange": "EXCHANGE_2",
  "symbol": "BTCUSDT",
  "side": "BUY",
  "order_type": "LIMIT",
  "price": 95000,
  "quantity": 0.01,
  "trigger_price": 0,
  "reduce_only": false,
  "time_in_force": "GTC",
  "client_order_id": "optional-uuid"
}
```

**Order type rules:**
- `MARKET`: omit price, set quantity > 0
- `LIMIT`: price required, quantity > 0, time_in_force applies (GTC/IOC/FOK)
- `STOP_MARKET`: trigger_price required, quantity = 0, reduce_only = true
- `TAKE_PROFIT_MARKET`: trigger_price required, quantity = 0, reduce_only = true

**Success response (200):**
```json
{
  "data": {
    "order_id": "01936474-a76f-767e-a056-ca1d41915778",
    "exchange": "EXCHANGE_2",
    "symbol": "BTCUSDT",
    "side": "BUY",
    "status": "RAISED",
    "order_type": "LIMIT",
    "quantity": "0.01",
    "exec_quantity": "0",
    "price": "95000",
    "avg_execution_price": "0",
    "execution_fee": "0.0041",
    "realised_pnl": "0",
    "reduce_only": false,
    "trigger_price": "0",
    "created_at": 1732557186934,
    "updated_at": 1732557186934
  }
}
```

**Error responses:**
- 400: Invalid quantity, price below tick, insufficient balance
- 401: Invalid signature
- 422: Validation failed (missing fields, wrong types)

**Implementation note:** After placing an order, if `status === "RAISED"`, poll Get Order Status until terminal status is reached. Terminal statuses: `EXECUTED`, `PARTIALLY_EXECUTED`, `CANCELLED`, `FAILED`.

> **CRITICAL — PARTIALLY_EXECUTED in Futures is TERMINAL.** Unlike spot, the unfilled remainder is cancelled. Do not wait for further fills. Log it as partial and move on.

---

### 2. CANCEL ORDER
**Used for:** Cancelling a single open order

```
DELETE https://coinswitch.co/trade/api/v2/futures/order
Rate limit: 10 requests per 60 seconds
```

**Request body:**
```json
{
  "exchange": "EXCHANGE_2",
  "order_id": "698ed406-8ef5-4664-9779-f7978702a447"
}
```

**Success response (200):**
```json
{
  "data": {
    "order_id": "0193688e-5212-7493-be58-4f83644772e8",
    "exchange": "EXCHANGE_2",
    "symbol": "DOGEUSDT",
    "side": "BUY",
    "order_type": "LIMIT",
    "status": "CANCELLATION_RAISED",
    "quantity": "22",
    "exec_quantity": "0",
    "price": "0.28",
    "avg_exec_price": "0",
    "exec_fee": "0",
    "reduce_only": false,
    "created_at": 1732625977884,
    "updated_at": 1732626020104
  }
}
```

**Note:** Cancel response uses `avg_exec_price` and `exec_fee` (NOT `avg_execution_price` / `execution_fee`). Poll Get Order Status until status = `CANCELLED`.

---

### 3. CANCEL ALL OPEN ORDERS
**Used for:** Cancel all orders across a symbol or all symbols for one account

```
POST https://coinswitch.co/trade/api/v2/futures/cancel_all
Rate limit: 10 requests per 60 seconds
```

**Request body:**
```json
{
  "exchange": "EXCHANGE_2",
  "symbol": "BTCUSDT"   // optional — omit to cancel ALL symbols
}
```

**Success response (200):**
```json
{
  "data": {
    "orders_ids": [
      "01936be4-2571-7a3f-97fa-a29a2b85d717",
      "01936be4-9e37-7487-8e31-20fede6ef271"
    ]
  }
}
```

This also cancels TP/SL orders (STOP_MARKET / TAKE_PROFIT_MARKET). Poll each order_id to confirm CANCELLED.

---

### 4. GET ORDER STATUS
**Used for:** Polling order state after placement or cancellation

```
GET https://coinswitch.co/trade/api/v2/futures/order?order_id={order_id}
Rate limit: 20 requests per 60 seconds
```

**Request params:**
```
order_id=698ed406-8ef5-4664-9779-f7978702a447
```

**Success response (200):**
```json
{
  "data": {
    "order": {
      "order_id": "698ed406-8ef5-4664-9779-f7978702a447",
      "exchange": "EXCHANGE_2",
      "symbol": "DOGEUSDT",
      "side": "BUY",
      "status": "EXECUTED",
      "order_type": "LIMIT",
      "quantity": "6.16",
      "exec_quantity": "6.16",
      "price": "0.28",
      "avg_execution_price": "0.28",
      "execution_fee": "0.0041",
      "realised_pnl": "0",
      "reduce_only": false,
      "created_at": 1732623664116,
      "updated_at": 1732623664116
    }
  }
}
```

**Note:** Response is wrapped in `data.order` (not `data` directly).

**Polling logic:**
```typescript
async function pollOrderStatus(
  orderId: string,
  apiKey: string,
  secretKey: string,
  maxAttempts = 10,
  intervalMs = 2000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const status = await getOrderStatus(orderId, apiKey, secretKey);
    const terminal = ['EXECUTED','PARTIALLY_EXECUTED','CANCELLED','FAILED'];
    if (terminal.includes(status)) return status;
  }
  return 'TIMEOUT';
}
```

---

### 5. GET OPEN ORDERS
**Used for:** Displaying open orders per account in the Orders page

```
POST https://coinswitch.co/trade/api/v2/futures/orders/open
Rate limit: 20 requests per 60 seconds
```

**Request body:**
```json
{
  "exchange": "EXCHANGE_2",
  "symbol": "BTCUSDT",   // optional filter
  "limit": 50,
  "from_time": 1732500000000,  // optional, Unix ms
  "to_time": 1732600000000     // optional, Unix ms — max 7 day window
}
```

**Success response (200):**
```json
{
  "data": {
    "orders": [
      {
        "order_id": "01936c09-85a6-79d5-a7b8-d0e19daa9fbf",
        "exchange": "EXCHANGE_2",
        "symbol": "BTCUSDT",
        "side": "BUY",
        "status": "RAISED",
        "order_type": "LIMIT",
        "quantity": "0.01",
        "exec_quantity": "0",
        "price": "95000",
        "avg_execution_price": "0",
        "execution_fee": "0.10",
        "realised_pnl": "0",
        "reduce_only": false,
        "created_at": 1732684383674,
        "updated_at": 1732684383674
      }
    ],
    "cursor": 1732684383674
  }
}
```

Use `cursor` value as `to_time` in the next call to paginate.

---

### 6. GET CLOSED ORDERS
**Used for:** Displaying trade history in Orders page and P&L tracker

```
POST https://coinswitch.co/trade/api/v2/futures/orders/closed
Rate limit: 20 requests per 60 seconds
```

**Request body:**
```json
{
  "exchange": "EXCHANGE_2",
  "symbol": "BTCUSDT",   // optional
  "status": "EXECUTED",  // optional: EXECUTED, PARTIALLY_EXECUTED, CANCELLED
  "limit": 50,
  "from_time": 1732500000000,
  "to_time": 1732600000000
}
```

**Success response (200):** Same shape as Open Orders — `data.orders` array + `data.cursor`.

---

### 7. GET POSITIONS
**Used for:** Displaying live open positions across all accounts

```
GET https://coinswitch.co/trade/api/v2/futures/positions?exchange=EXCHANGE_2&symbol=BTCUSDT
Rate limit: 20 requests per 60 seconds
```

**Request params:**
```
exchange=EXCHANGE_2
symbol=BTCUSDT
```

**Success response (200):**
```json
{
  "data": [
    {
      "exchange": "EXCHANGE_2",
      "position_id": "8b81b763-df36-4c93-9bc8-9a93d65b8546",
      "symbol": "BTCUSDT",
      "position_side": "LONG",
      "leverage": "10",
      "position_size": "0.01",
      "position_value": "950.00",
      "position_margin": "95.00",
      "maint_margin": "5.32",
      "avg_entry_price": "95000",
      "mark_price": "95500",
      "last_price": "95480",
      "unrealised_pnl": "5.00",
      "liquidation_price": "85500",
      "margin_type": "ISOLATED",
      "status": "OPEN",
      "created_at": 1732617093684,
      "updated_at": 1732636761825
    }
  ]
}
```

`data` is an array. Only OPEN positions are returned. Call this for each account individually and aggregate.

---

### 8. SET LEVERAGE
**Used for:** Changing leverage per symbol before opening a position

```
POST https://coinswitch.co/trade/api/v2/futures/leverage
Rate limit: 10 requests per 60 seconds
```

**Request body:**
```json
{
  "symbol": "BTCUSDT",
  "exchange": "EXCHANGE_2",
  "leverage": 10
}
```

**Success response (200):**
```json
{
  "data": {
    "exchange": "EXCHANGE_2",
    "symbol": "BTCUSDT",
    "leverage": "10"
  }
}
```

**CRITICAL CONSTRAINT:** Cannot change leverage while:
- An open position exists on the symbol, OR
- Any open orders exist on the symbol
Always cancel orders and close positions first. Show a blocking error in the UI if either condition is true.

---

### 9. GET LEVERAGE
**Used for:** Displaying current leverage in account selector and positions view

```
GET https://coinswitch.co/trade/api/v2/futures/leverage?symbol=BTCUSDT&exchange=EXCHANGE_2
Rate limit: 20 requests per 60 seconds
```

**Success response (200):**
```json
{
  "data": {
    "exchange": "EXCHANGE_2",
    "symbol": "BTCUSDT",
    "leverage": "10"
  }
}
```

---

### 10. ADD MARGIN
**Used for:** Adding margin to an open position to push liquidation price further away

```
POST https://coinswitch.co/trade/api/v2/futures/add_margin
Rate limit: 10 requests per 60 seconds
```

**Request body:**
```json
{
  "exchange": "EXCHANGE_2",
  "symbol": "BTCUSDT",
  "margin": 50
}
```

**Success response (200):** Returns the updated full position object (same shape as Get Positions). `position_margin` reflects the new higher value, `liquidation_price` has moved.

---

### 11. GET WALLET BALANCE
**Used for:** Showing available balance per account in the account selector and dashboard

```
GET https://coinswitch.co/trade/api/v2/futures/wallet_balance
Rate limit: 20 requests per 60 seconds
No query parameters required.
```

**Success response (200):**
```json
{
  "data": {
    "base_asset_balances": [
      {
        "base_asset": "USDT",
        "balances": {
          "total_balance": "60960.82",
          "total_available_balance": "60910.77",
          "total_blocked_balance": "50.05",
          "total_position_margin": "56.83",
          "total_open_order_margin": "-6.77"
        }
      }
    ],
    "asset": [
      {
        "symbol": "BTCUSDT",
        "base_asset": "USDT",
        "exchange": "EXCHANGE_2",
        "blocked_balance": "50.04",
        "position_margin": "50.04",
        "open_order_margin": "0.0008"
      }
    ]
  }
}
```

Use `data.base_asset_balances[0].balances.total_available_balance` as the available balance shown in the UI.

---

### 12. GET TRANSACTIONS
**Used for:** P&L tracker — fetching fees, funding payments, realised PnL

```
GET https://coinswitch.co/trade/api/v2/futures/transactions
Rate limit: 20 requests per 60 seconds
```

**Request params:**
```
exchange=EXCHANGE_2
symbol=BTCUSDT        (optional)
type=commission       (optional: commission, P&L, funding fee, liquidation fee)
limit=50
from_time=1732500000000
to_time=1732600000000
```

**Success response (200):**
```json
{
  "data": [
    {
      "exchange": "EXCHANGE_2",
      "transaction_id": "678708aa-507b-4881-8b3f-...",
      "symbol": "BTCUSDT",
      "type": "P&L",
      "quote_asset": "USDT",
      "amount": "12.50"
    },
    {
      "exchange": "EXCHANGE_2",
      "transaction_id": "8b81b763-df36-4c93-...",
      "symbol": "BTCUSDT",
      "type": "COMMISSION",
      "quote_asset": "USDT",
      "amount": "-0.62"
    }
  ]
}
```

`amount` is signed — positive = credit, negative = debit. Transaction types: `FUNDING_FEE`, `COMMISSION`, `P&L`, `LIQUIDATION_FEE`, `ADD_MARGIN`.

---

### 13. GET INSTRUMENT INFO
**Used for:** Symbol autocomplete, validating quantity/price precision, leverage limits

```
GET https://coinswitch.co/trade/api/v2/futures/instrument_info?exchange=EXCHANGE_2
Rate limit: 100 requests per 60 seconds
```

**Success response (200):**
```json
{
  "data": {
    "BTCUSDT": {
      "symbol": "btc",
      "base_asset": "btc",
      "quote_asset": "usdt",
      "status": "TRADING",
      "type": "PERPETUAL_FUTURES",
      "min_leverage": "1",
      "max_leverage": "25",
      "leverage_step": 1,
      "min_base_quantity": "0.001",
      "base_quantity_step_size": "0.001",
      "quantity_precision": 3,
      "price_precision": 2,
      "tick_size": 1,
      "max_market_base_quantity": "119",
      "max_base_quantity": "952",
      "taker_fee_rate": "0.00065",
      "maker_fee_rate": "0.00024"
    }
  }
}
```

Cache this response on app startup. Use `quantity_precision` to validate order quantity inputs and `price_precision` for price inputs.

---

### 14. GET ORDER BOOK
**Used for:** Showing best bid/ask in the trade execution panel

```
GET https://coinswitch.co/trade/api/v2/futures/order_book?exchange=EXCHANGE_2&symbol=BTCUSDT
Rate limit: 100 requests per 60 seconds
```

**Success response (200):**
```json
{
  "data": {
    "timestamp": 1732685131699,
    "asks": [["95136.70", "3.96"], ["95137.00", "0.50"]],
    "bids": [["95136.60", "3.18"], ["95136.00", "1.20"]],
    "symbol": "BTCUSDT"
  }
}
```

`bids` sorted descending, `asks` sorted ascending. Each entry: [price, quantity] as strings.

---

### 15. GET TICKER
**Used for:** Showing last price, mark price, funding rate in the trade panel

```
GET https://coinswitch.co/trade/api/v2/futures/ticker?exchange=EXCHANGE_2&symbol=BTCUSDT
Rate limit: 100 requests per 60 seconds
```

**Success response (200):**
```json
{
  "data": {
    "EXCHANGE_2": {
      "symbol": "BTCUSDT",
      "last_price": "95136.60",
      "mark_price": 95136.7,
      "index_price": 95046.53,
      "funding_rate": 0.00039681,
      "next_funding_timestamp": 1732838400000,
      "best_bid_price": "95136.60",
      "best_ask_price": "95136.70",
      "high_price_24h": "97276.00",
      "low_price_24h": "94707.00",
      "price_24h_pcnt": "-1.297300",
      "open_interest": "67529.878",
      "timestamp": 1732821806680
    }
  }
}
```

Response is keyed by `EXCHANGE_2`. Access via `data['EXCHANGE_2']`.

---

## Backend — Core Trade Execution Service

This is the most important piece. Implement as `tradeService.ts`:

```typescript
interface OrderPayload {
  symbol: string;
  side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
  quantity: number;
  price?: number;
  trigger_price?: number;
  reduce_only?: boolean;
  time_in_force?: 'GTC' | 'IOC' | 'FOK';
  client_order_id?: string;
}

interface AccountResult {
  accountId: number;
  accountName: string;
  success: boolean;
  orderId?: string;
  status?: string;
  error?: string;
}

async function executeOnAllAccounts(
  accountIds: number[],
  payload: OrderPayload
): Promise<AccountResult[]> {
  // Fetch and decrypt credentials for selected accounts
  const accounts = await getAccountsByIds(accountIds);

  // Fire all in parallel — one failure must NOT block others
  const results = await Promise.allSettled(
    accounts.map(account => placeOrderForAccount(account, payload))
  );

  // Map results and log each to MySQL
  return results.map((result, i) => {
    const account = accounts[i];
    if (result.status === 'fulfilled') {
      logTrade({
        account_id: account.id,
        order_id: result.value.order_id,
        symbol: payload.symbol,
        side: payload.side,
        order_type: payload.order_type,
        quantity: payload.quantity,
        price: payload.price,
        trigger_price: payload.trigger_price,
        status: result.value.status,
        fired_via: 'MANUAL'
      });
      return {
        accountId: account.id,
        accountName: account.name,
        success: true,
        orderId: result.value.order_id,
        status: result.value.status
      };
    } else {
      logTrade({
        account_id: account.id,
        symbol: payload.symbol,
        side: payload.side,
        order_type: payload.order_type,
        quantity: payload.quantity,
        status: 'FAILED',
        error_message: result.reason?.message
      });
      return {
        accountId: account.id,
        accountName: account.name,
        success: false,
        error: result.reason?.message
      };
    }
  });
}

async function placeOrderForAccount(account: Account, payload: OrderPayload) {
  const decryptedKey = decrypt(account.api_key);
  const decryptedSecret = decrypt(account.secret_key);

  const body = {
    exchange: 'EXCHANGE_2',
    symbol: payload.symbol.toUpperCase(),
    side: payload.side,
    order_type: payload.order_type,
    quantity: payload.quantity,
    ...(payload.price && { price: payload.price }),
    ...(payload.trigger_price && { trigger_price: payload.trigger_price }),
    ...(payload.reduce_only !== undefined && { reduce_only: payload.reduce_only }),
    ...(payload.time_in_force && { time_in_force: payload.time_in_force }),
    ...(payload.client_order_id && { client_order_id: payload.client_order_id }),
  };

  const { headers, path } = signRequest('POST', '/trade/api/v2/futures/order', {}, decryptedKey, decryptedSecret);

  const response = await axios.post(`${BASE_URL}${path}`, body, { headers });
  return response.data.data;
}
```

---

## Backend — Rate Limit Guard

CoinSwitch allows 20 Place Order requests per 60 seconds. If more than 20 accounts are selected, batch them:

```typescript
async function executeWithRateLimit(
  accounts: Account[],
  payload: OrderPayload,
  batchSize = 18,  // stay under 20/min limit
  delayMs = 3100   // just over 3 seconds between batches
): Promise<AccountResult[]> {
  const results: AccountResult[] = [];
  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(acc => placeOrderForAccount(acc, payload))
    );
    results.push(...mapResults(batch, batchResults));
    if (i + batchSize < accounts.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}
```

---

## Backend — Express Routes

```typescript
// Auth
POST   /api/auth/login          → validate admin password → return JWT

// Accounts
GET    /api/accounts            → list all (mask API keys in response)
POST   /api/accounts            → add account (encrypt keys before saving)
PUT    /api/accounts/:id        → edit account
DELETE /api/accounts/:id        → remove account
POST   /api/accounts/:id/verify → call wallet_balance to verify credentials

// Trade Execution
POST   /api/trade/execute
  body: { accountIds: number[], order: OrderPayload }
  → calls executeOnAllAccounts()
  → returns AccountResult[] (per-account success/fail)

// Cancel
DELETE /api/trade/order
  body: { accountIds: number[], orderId: string, exchange: string }
  → cancel specific order across listed accounts

POST   /api/trade/cancel-all
  body: { accountIds: number[], symbol?: string }
  → calls cancel_all for each account in parallel

// Positions
GET    /api/positions?symbol=BTCUSDT
  → calls GET /futures/positions for each active account in parallel
  → aggregates and returns with account name attached

// Orders
POST   /api/orders/open         → body: { symbol?, accountIds? } → open orders across accounts
POST   /api/orders/closed       → body: { symbol?, status?, from_time?, to_time? }

// P&L
GET    /api/pnl?from_time=&to_time=&accountIds=
  → calls GET /futures/transactions for each account (type=P&L and type=commission)
  → aggregates per account

// TP/SL
POST   /api/tpsl/set
  body: { accountIds, symbol, tp_price?, sl_price? }
  → for each account, place TAKE_PROFIT_MARKET and/or STOP_MARKET order
  → quantity: 0, reduce_only: true

DELETE /api/tpsl/:accountId/:orderId   → cancel TP/SL order for account

// Leverage
GET    /api/leverage?symbol=BTCUSDT&accountId=1
POST   /api/leverage
  body: { accountIds, symbol, leverage }
  → validate no open position or orders first
  → call POST /futures/leverage for each account

// Add Margin
POST   /api/margin/add
  body: { accountId, symbol, margin }

// Wallet Balances
GET    /api/balances            → calls wallet_balance for all active accounts in parallel

// Market Data (proxied — use any one account's keys to fetch, data is public)
GET    /api/market/ticker?symbol=BTCUSDT
GET    /api/market/orderbook?symbol=BTCUSDT
GET    /api/market/instruments
GET    /api/market/klines?symbol=BTCUSDT&interval=5

// Webhooks
GET    /api/webhooks            → list all webhooks
POST   /api/webhooks            → create webhook (generate UUID token)
PUT    /api/webhooks/:id        → edit webhook
DELETE /api/webhooks/:id        → delete webhook
POST   /api/webhooks/:token     → PUBLIC — receives TradingView/bot payload, fires trades

// Logs
GET    /api/logs/trades?page=&symbol=&accountId=&status=
GET    /api/logs/webhooks?page=
GET    /api/logs/system?page=&level=

// Settings
GET    /api/settings
PUT    /api/settings
```

---

## Webhook Endpoint — Full Implementation

```typescript
// PUBLIC route — no JWT auth, secured by token in URL
app.post('/api/webhooks/:token', async (req, res) => {
  const webhook = await db.webhooks.findOne({ token: req.params.token });
  if (!webhook || !webhook.is_active) {
    return res.status(404).json({ error: 'Webhook not found or inactive' });
  }

  // Expected payload from TradingView or custom bot:
  // {
  //   "symbol": "BTCUSDT",
  //   "side": "BUY",
  //   "order_type": "MARKET",
  //   "quantity": 0.01,
  //   "price": null,          // optional, for LIMIT
  //   "trigger_price": null,  // optional, for STOP/TP
  //   "reduce_only": false
  // }
  const payload = req.body;
  const symbol = payload.symbol || webhook.default_symbol;
  const accountIds: number[] = JSON.parse(webhook.target_accounts);

  const results = await executeOnAllAccounts(accountIds, {
    symbol,
    side: payload.side,
    order_type: payload.order_type || 'MARKET',
    quantity: payload.quantity,
    price: payload.price,
    trigger_price: payload.trigger_price,
    reduce_only: payload.reduce_only || false,
  });

  // Log the webhook execution
  await db.webhook_logs.insert({
    webhook_id: webhook.id,
    payload: JSON.stringify(payload),
    accounts_fired: accountIds.length,
    success_count: results.filter(r => r.success).length,
    fail_count: results.filter(r => !r.success).length,
  });

  await db.webhooks.update({ id: webhook.id }, { last_triggered: new Date() });

  res.json({ success: true, results });
});
```

**TradingView Alert Message Format** (document this in the Webhooks UI):
```json
{
  "symbol": "{{ticker}}",
  "side": "BUY",
  "order_type": "MARKET",
  "quantity": 0.01
}
```
TradingView webhook URL: `https://yourdomain.com/api/webhooks/YOUR-TOKEN-HERE`

---

## Frontend Pages — Detailed Specs

### Page 1: Dashboard
- Stat cards: Total Accounts, Active Accounts (have open positions), Total Open Positions, Total Unrealised PnL
- Accounts table: Name | Available Balance | Open Positions | Unrealised PnL | Last Trade | Status
- Recent Executions feed: last 10 from trade_logs table

### Page 2: Trade Execution (Main Panel)
**Left column — Order Form:**
- Symbol input with autocomplete from instrument_info cache
- Order type tabs: MARKET | LIMIT | STOP_MARKET | TP_MARKET
- BUY (green) / SELL (red) side toggle
- Quantity input (validated against min_base_quantity and base_quantity_step_size)
- Price input (only shown for LIMIT — validated against price_precision)
- Trigger Price input (only shown for STOP_MARKET and TAKE_PROFIT_MARKET)
- Reduce Only toggle
- Time In Force selector: GTC | IOC | FOK
- Live ticker strip: Last Price | Mark Price | Best Bid | Best Ask | Funding Rate

**Right column — Account Selector:**
- List of all accounts with checkbox, name, available balance (from wallet_balance), current leverage on selected symbol
- Accounts with balance < estimated margin highlighted amber
- Select All / Deselect All
- Selected count badge: "X of Y selected"

**Execute Button:**
- Label: "Execute BUY on X Accounts" (updates dynamically)
- Opens confirmation modal showing: symbol, side, type, qty, price, list of accounts
- On confirm: fires parallel API calls, shows live results panel per account:
  - Account name | Status (Sending → RAISED → EXECUTED/FAILED) | Order ID

### Page 3: Positions
- Auto-refresh every 10s via GET /futures/positions for all accounts
- Table: Account | Symbol | LONG/SHORT | Size | Entry Price | Mark Price | Unrealised PnL | Liq Price | Leverage | Margin | Actions
- Actions: [Add Margin] (opens modal) | [Close Position] (fires MARKET order, opposite side, reduce_only: true)
- Filter by account, symbol, side

### Page 4: Orders
- Tab: Open Orders | Closed Orders
- Open Orders table: Account | Symbol | Side | Type | Qty | Exec Qty | Price | Status | Created | [Cancel]
- Closed Orders table: same columns + Avg Exec Price | Fees | Realised PnL
- Bulk cancel: select rows → Cancel Selected
- Cancel All button (fires cancel_all for selected accounts)
- Filter by account, symbol, date range

### Page 5: P&L Tracker
- Date range picker
- Stat cards: Total Realised PnL | Total Fees | Net PnL | Best Account
- Per-account breakdown table: Account | Realised PnL | Fees | Net PnL | Trade Count
- Line chart (Recharts): PnL over time, one line per account
- Data from GET /futures/transactions filtered by P&L and COMMISSION types

### Page 6: TP/SL Manager
- Symbol selector
- Account multi-select
- Table showing current TP/SL per account: Account | Symbol | TP Price | SL Price | TP Order ID | SL Order ID | Actions
- Set TP/SL form:
  - Take Profit Price → fires POST /futures/order with order_type: TAKE_PROFIT_MARKET, quantity: 0, reduce_only: true, trigger_price: tp_price
  - Stop Loss Price → fires POST /futures/order with order_type: STOP_MARKET, quantity: 0, reduce_only: true, trigger_price: sl_price
  - Apply to selected accounts simultaneously
- Cancel TP / Cancel SL buttons per row → fires DELETE /futures/order

### Page 7: User Accounts
- Accounts table: Name | API Key (masked ****) | Status | Created | Actions [Edit] [Delete] [Verify]
- Add Account drawer: Name, API Key, Secret Key, [Save & Verify]
  - On Save: encrypt both keys with AES-256, store in DB
  - Verify: calls GET /futures/wallet_balance with the keys — shows balance if success, error if fail
- Edit: can update name, re-enter keys (re-encrypts)
- Delete: soft-delete (set is_active = false), keeps logs intact

### Page 8: Webhooks
- Webhooks table: Name | URL | Target Accounts | Last Triggered | Status (Active/Paused) | Actions
- Create Webhook form:
  - Name
  - Target accounts (multi-select)
  - Default symbol (optional)
  - Default leverage (optional, applied before trade if set)
  - Active toggle
  - [Generate] → creates UUID token → shows full webhook URL
- Webhook URL display: `https://yourdomain.com/api/webhooks/{token}` with Copy button
- Payload template panel (copy-ready JSON for TradingView)
- Test button → sends a simulated dry-run and shows result
- Edit / Pause / Delete per webhook

### Page 9: Logs
- Tabs: Trade Logs | Webhook Logs | System Logs
- Trade Logs table: Time | Account | Symbol | Side | Type | Qty | Price | Status | Fired Via | Error
- Webhook Logs table: Time | Webhook Name | Accounts Fired | Success | Failed | Payload (expandable)
- System Logs table: Time | Level (color-coded) | Message | Context
- Filters: date range, account, symbol, status
- Export to CSV
- Pagination: 50 rows per page

### Page 10: Settings
- Default leverage per symbol (stored in DB, used as default in trade form)
- Default order type preference
- Global webhook enable/disable master switch
- Rate limit status display: calls used vs limit per endpoint
- Danger zone: Clear all logs, Revoke JWT session

---

## Environment Variables

```env
DATABASE_URL=mysql://user:password@localhost:3306/copytrading
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=your-32-byte-hex-key-here    # openssl rand -hex 32
COINSWITCH_BASE_URL=https://coinswitch.co
PORT=3001
```

---

## Key Implementation Rules (Do Not Skip)

1. **Promise.allSettled always** — never use Promise.all for multi-account trade execution. One failure must not block others.

2. **AES-256 encryption** — never store raw API keys. Encrypt on save, decrypt only in memory at execution time, never return in API responses.

3. **PARTIALLY_EXECUTED is terminal in Futures** — handle this same as EXECUTED in polling logic. Do not keep polling.

4. **TP/SL order format** — always: `quantity: 0`, `reduce_only: true`, `trigger_price: <price>`. Order type: `TAKE_PROFIT_MARKET` for TP, `STOP_MARKET` for SL.

5. **Leverage change guard** — before calling POST /futures/leverage, check GET /futures/positions and POST /futures/orders/open. If either returns data for that symbol, block the leverage change and show a clear UI error.

6. **Rate limiting** — Place Order is 20 req/60s. For > 18 accounts, batch with 3.1s delay between batches. Show a progress indicator in the UI during batching.

7. **Cancel response field names are different** — Cancel Order returns `avg_exec_price` and `exec_fee`, not `avg_execution_price` and `execution_fee`. Handle both in the response parser.

8. **GET Order Status response is nested** — response is `data.order` (singular object), not `data` directly. All other order responses are `data` or `data.orders`.

9. **Symbol casing** — CoinSwitch accepts lowercase symbols in requests but returns uppercase. Normalize to uppercase for display, send lowercase or uppercase in requests (both work).

10. **Wallet balance for market data** — GET /futures/wallet_balance needs no query params. Call it per account using that account's own API keys.

11. **Ticker is keyed by exchange** — access ticker data via `response.data.data['EXCHANGE_2']`, not `response.data.data` directly.

12. **Webhook token security** — generate with `crypto.randomUUID()`. Treat the URL as a secret. Add optional HMAC verification header support for TradingView.

