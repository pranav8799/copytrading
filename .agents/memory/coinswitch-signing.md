---
name: CoinSwitch API signing
description: How to sign CoinSwitch futures API requests and rate limit details.
---

**Signing formula:** HMAC-SHA256 over `method + path + epoch` (epoch = seconds since Unix epoch as string).

Headers required on every request:
- `X-AUTH-SIGNATURE`: the HMAC hex digest
- `X-AUTH-APIKEY`: the raw API key
- `X-AUTH-EPOCH`: the epoch string used in the signature

**Exchange ID:** Always `EXCHANGE_2` in request bodies/params.

**Base URL:** `https://coinswitch.co` (configurable via `COINSWITCH_BASE_URL` env var).

**Rate limit:** 20 requests/minute. Safe batch size: 18 accounts per batch, 3100ms delay between batches.

**Why:** The signing uses the full path including query string for GET requests. For POST/DELETE, the path has no query string — params go in the body.

**How to apply:** See `artifacts/api-server/src/lib/signRequest.ts` for implementation. Always use `callCoinswitch()` helper from `coinswitchApi.ts` — it handles signing, base URL, and method dispatch.
